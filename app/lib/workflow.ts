import { bitrixRestRequest } from "./bitrix";
import { bitrixConfig } from "./config";
import {
  itemPaymentId,
  itemPlate,
  isOutstanding,
  listFineCategoryItems,
  listPaidCategoryResetItems,
  moveFineToPaidBuilding,
  type RawFine,
  STAGES,
  updateFineItem,
} from "./fines";
import { vibeRequest } from "./vibecode";

export type PaymentStatus = {
  id: number;
  orderId: number;
  paid: boolean;
  sum: number;
  datePaid: string;
};

function paymentRecord(payment: unknown): Record<string, unknown> {
  if (!payment || typeof payment !== "object") return {};
  const record = payment as Record<string, unknown>;
  return record.payment && typeof record.payment === "object"
    ? (record.payment as Record<string, unknown>)
    : record;
}

function paymentIsPaid(payment: unknown): boolean {
  const nested = paymentRecord(payment);
  const paid = nested.paid ?? nested.PAID ?? nested.payed ?? nested.PAYED;
  return paid === true || paid === "Y" || paid === 1 || paid === "1";
}

export async function getPaymentStatus(
  paymentId: number,
): Promise<PaymentStatus> {
  let payment: unknown;
  try {
    payment = await vibeRequest(`/v1/payments/${paymentId}`, {
      cache: "no-store",
    });
  } catch (error) {
    console.error(
      "PAYMENT_STATUS_VIBECODE_FALLBACK",
      error instanceof Error ? error.message : String(error),
    );
    payment = await bitrixRestRequest<{ payment?: unknown }>(
      "sale.payment.get",
      { id: paymentId },
    );
  }
  const record = paymentRecord(payment);
  return {
    id: Number(record.id ?? record.ID ?? paymentId),
    orderId: Number(record.orderId ?? record.ORDER_ID ?? 0),
    paid: paymentIsPaid(record),
    sum: Number(record.sum ?? record.SUM ?? 0),
    datePaid: String(record.datePaid ?? record.DATE_PAID ?? ""),
  };
}

export async function isPaymentPaid(paymentId: number): Promise<boolean> {
  return (await getPaymentStatus(paymentId)).paid;
}

export type ReconcileResult = {
  allPaid: boolean;
  moved: boolean;
  remaining: number;
  paidFineIds: number[];
  deferredFineIds: number[];
};

function isRunningWorkflowConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /CRM_ITEM_HAS_RUNNING_WORKFLOWS|запущенные бизнес-процессы/iu.test(
    message,
  );
}

export async function reconcilePlate(
  plate: string,
  suppliedItems?: RawFine[],
  confirmedPaymentIds: readonly number[] = [],
): Promise<ReconcileResult> {
  let items = suppliedItems ?? [
    ...(await listFineCategoryItems()),
    ...(await listPaidCategoryResetItems()),
  ];
  let plateItems = items.filter((item) => itemPlate(item) === plate);
  const hadPlateItems = plateItems.length > 0;
  const confirmedPayments = new Set(confirmedPaymentIds);
  const awaitingByPayment = new Map<number, RawFine[]>();

  for (const item of plateItems) {
    const paymentId = itemPaymentId(item);
    if (paymentId && item.stageId !== STAGES.paidAtBuilding) {
      const group = awaitingByPayment.get(paymentId) ?? [];
      group.push(item);
      awaitingByPayment.set(paymentId, group);
    }
  }

  const paidFineIds: number[] = [];
  await Promise.all(
    [...awaitingByPayment.entries()].map(async ([paymentId, paymentItems]) => {
      if (
        !confirmedPayments.has(paymentId) &&
        !(await isPaymentPaid(paymentId))
      ) {
        return;
      }
      await Promise.all(
        paymentItems.map(async (item) => {
          const id = Number(item.id);
          if (
            Number(item.categoryId) === bitrixConfig.finesCategoryId &&
            item.stageId !== STAGES.paidInFines
          ) {
            await updateFineItem(id, { stageId: STAGES.paidInFines });
          }
          paidFineIds.push(id);
        }),
      );
    }),
  );

  if (paidFineIds.length) {
    items = [
      ...(await listFineCategoryItems()),
      ...(await listPaidCategoryResetItems()),
    ];
    plateItems = items.filter((item) => itemPlate(item) === plate);
  }

  const outstanding = plateItems.filter(isOutstanding);
  if (outstanding.length) {
    return {
      allPaid: false,
      moved: false,
      remaining: outstanding.length,
      paidFineIds,
      deferredFineIds: [],
    };
  }

  if (!plateItems.length) {
    return {
      allPaid: hadPlateItems && paidFineIds.length > 0,
      moved: hadPlateItems && paidFineIds.length > 0,
      remaining: 0,
      paidFineIds,
      deferredFineIds: [],
    };
  }

  const deferredFineIds: number[] = [];
  await Promise.all(
    plateItems.map(async (item) => {
      try {
        await moveFineToPaidBuilding(Number(item.id), item);
      } catch (error) {
        if (!isRunningWorkflowConflict(error)) throw error;
        deferredFineIds.push(Number(item.id));
      }
    }),
  );

  return {
    allPaid: deferredFineIds.length === 0,
    moved: deferredFineIds.length === 0,
    remaining: 0,
    paidFineIds,
    deferredFineIds,
  };
}

export type ReconcileSweepResult = {
  checkedPlates: number;
  restoredPlates: string[];
  deferredFineIds: number[];
  failedPlates: Array<{ plate: string; error: string }>;
};

export async function reconcilePendingFinePayments(): Promise<ReconcileSweepResult> {
  const items = [
    ...(await listFineCategoryItems()),
    ...(await listPaidCategoryResetItems()),
  ];
  const plates = [
    ...new Set(
      items
        .filter(
          (item) =>
            itemPaymentId(item) > 0 &&
            (item.stageId === STAGES.awaiting ||
              item.stageId === STAGES.paidInFines ||
              item.stageId === STAGES.paidAtBuildingReset),
        )
        .map(itemPlate)
        .filter(Boolean),
    ),
  ];
  const restoredPlates: string[] = [];
  const deferredFineIds: number[] = [];
  const failedPlates: Array<{ plate: string; error: string }> = [];

  for (const plate of plates) {
    try {
      const result = await reconcilePlate(plate, items);
      if (result.moved) restoredPlates.push(plate);
      deferredFineIds.push(...result.deferredFineIds);
    } catch (error) {
      failedPlates.push({
        plate,
        error:
          error instanceof Error ? error.message : "Unknown reconciliation error",
      });
    }
  }

  return {
    checkedPlates: plates.length,
    restoredPlates,
    deferredFineIds,
    failedPlates,
  };
}
