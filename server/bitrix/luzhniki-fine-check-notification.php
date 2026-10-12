<?php

use Bitrix\Main\Application;
use Bitrix\Main\Event;
use Bitrix\Main\EventResult;
use Bitrix\Sale\Internals\PaymentTable;

/**
 * Serializes successful Sberbank callbacks for one fine payment.
 *
 * Bitrix calls OnSalePsServiceProcessRequestBeforePaid after the bank handler
 * has confirmed the operation, but before Payment::setPaid('Y') queues the
 * fiscal check. Two concurrent callbacks can therefore load the same unpaid
 * payment and each queue a separate check. A MySQL named lock closes that
 * race without changing Bitrix core or the custom payment-system handler.
 */
final class LuzhnikiFinePaymentIdempotency
{
    private const PAY_SYSTEM_ID = 24;
    private const LOCK_PREFIX = 'luzhniki:fine-payment:';
    private const LOCK_TIMEOUT_SECONDS = 15;

    /** @var array<int, string> */
    private static array $heldLocks = [];

    public static function beforePaid(Event $event): void
    {
        $payment = $event->getParameter('payment');
        $status = (string)$event->getParameter('status');
        $paySystemId = (int)$event->getParameter('pay_system_id');

        if (
            $status !== 'Y'
            || $paySystemId !== self::PAY_SYSTEM_ID
            || !is_object($payment)
            || !method_exists($payment, 'getId')
            || !self::isFinePayment($payment)
        ) {
            return;
        }

        $paymentId = (int)$payment->getId();
        if ($paymentId <= 0 || isset(self::$heldLocks[$paymentId])) {
            return;
        }

        self::acquire($paymentId);

        try {
            $persisted = PaymentTable::getRow([
                'filter' => ['=ID' => $paymentId],
                'select' => ['ID', 'PAID', 'PAY_SYSTEM_ID', 'ORDER_ID'],
            ]);

            if (!$persisted) {
                throw new RuntimeException('Payment was not found after acquiring the idempotency lock');
            }
            if ((int)$persisted['PAY_SYSTEM_ID'] !== self::PAY_SYSTEM_ID) {
                throw new RuntimeException('Payment system changed during callback processing');
            }

            if ((string)$persisted['PAID'] === 'Y') {
                // The current object may have been loaded before the first request
                // committed. Synchronize it without firing PAID/PAYED transitions.
                // The following Payment::setPaid('Y') in Bitrix core becomes a no-op,
                // so it cannot queue a second fiscal check.
                $payment->setFieldsNoDemand(['PAID' => 'Y']);

                $order = self::paymentOrder($payment);
                if ($order && method_exists($order, 'setFieldsNoDemand')) {
                    $order->setFieldsNoDemand(['PAYED' => 'Y']);
                }

                self::log(sprintf(
                    'Duplicate paid callback suppressed for paymentId=%d orderId=%d',
                    $paymentId,
                    (int)$persisted['ORDER_ID']
                ));
            }
        } catch (Throwable $error) {
            self::release($paymentId);
            throw $error;
        }
    }

    public static function afterProcess(Event $event): void
    {
        $payment = $event->getParameter('payment');
        if (!is_object($payment) || !method_exists($payment, 'getId')) {
            return;
        }

        self::release((int)$payment->getId());
    }

    public static function releaseAll(): void
    {
        foreach (array_keys(self::$heldLocks) as $paymentId) {
            self::release((int)$paymentId);
        }
    }

    private static function isFinePayment($payment): bool
    {
        $order = self::paymentOrder($payment);
        if (!$order || !method_exists($order, 'getBasket')) {
            return false;
        }

        foreach ($order->getBasket() as $basketItem) {
            $xmlId = (string)$basketItem->getField('XML_ID');
            if (strncmp($xmlId, 'fine-', 5) === 0) {
                return true;
            }
        }

        return false;
    }

    private static function paymentOrder($payment)
    {
        if (method_exists($payment, 'getOrder')) {
            return $payment->getOrder();
        }
        if (method_exists($payment, 'getCollection')) {
            $collection = $payment->getCollection();
            if ($collection && method_exists($collection, 'getOrder')) {
                return $collection->getOrder();
            }
        }

        return null;
    }

    private static function acquire(int $paymentId): void
    {
        $lockName = self::LOCK_PREFIX . $paymentId;
        $connection = Application::getConnection();
        $row = $connection->query(sprintf(
            "SELECT GET_LOCK('%s', %d) AS ACQUIRED",
            $lockName,
            self::LOCK_TIMEOUT_SECONDS
        ))->fetch();

        if ((int)($row['ACQUIRED'] ?? 0) !== 1) {
            throw new RuntimeException(sprintf(
                'Could not acquire payment idempotency lock for paymentId=%d',
                $paymentId
            ));
        }

        self::$heldLocks[$paymentId] = $lockName;
    }

    private static function release(int $paymentId): void
    {
        $lockName = self::$heldLocks[$paymentId] ?? null;
        if ($lockName === null) {
            return;
        }

        unset(self::$heldLocks[$paymentId]);
        try {
            Application::getConnection()->query(sprintf(
                "SELECT RELEASE_LOCK('%s')",
                $lockName
            ));
        } catch (Throwable $error) {
            self::log(sprintf(
                'Could not release payment idempotency lock for paymentId=%d: %s',
                $paymentId,
                $error->getMessage()
            ));
        }
    }

    private static function log(string $message): void
    {
        if (class_exists('Bitrix\\Sale\\PaySystem\\Logger')) {
            \Bitrix\Sale\PaySystem\Logger::addDebugInfo(
                self::class . ': ' . $message
            );
        }
    }
}

final class LuzhnikiFineCheckNotification
{
    public static function suppressBitrixDuplicate($payment, $check)
    {
        try {
            if (!is_object($payment) || !method_exists($payment, 'getOrder')) {
                return null;
            }

            $order = $payment->getOrder();
            if (!$order || !method_exists($order, 'getBasket')) {
                return null;
            }

            foreach ($order->getBasket() as $basketItem) {
                $xmlId = (string)$basketItem->getField('XML_ID');
                if (strncmp($xmlId, 'fine-', 5) === 0) {
                    // ОФД продолжает формировать и отправлять сам чек. Этот результат
                    // отключает только стандартное письмо/СМС Битрикса со ссылкой.
                    return new EventResult(EventResult::SUCCESS);
                }
            }
        } catch (Throwable $error) {
            // При любой неоднозначности сохраняем штатное поведение Битрикса.
            return null;
        }

        return null;
    }
}

AddEventHandler(
    'sale',
    'OnPrintableCheckSend',
    [LuzhnikiFineCheckNotification::class, 'suppressBitrixDuplicate']
);

\Bitrix\Main\EventManager::getInstance()->addEventHandler(
    'sale',
    'OnSalePsServiceProcessRequestBeforePaid',
    [LuzhnikiFinePaymentIdempotency::class, 'beforePaid']
);

\Bitrix\Main\EventManager::getInstance()->addEventHandler(
    'sale',
    'OnSaleAfterPsServiceProcessRequest',
    [LuzhnikiFinePaymentIdempotency::class, 'afterProcess']
);

register_shutdown_function([LuzhnikiFinePaymentIdempotency::class, 'releaseAll']);
