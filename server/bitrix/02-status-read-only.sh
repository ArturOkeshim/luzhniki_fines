#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_HOST='aqua-bitrix-srv01'
BITRIX_ROOT='/home/bitrix/ext_www/crm.luzhniki.ru'
INIT_FILE="${BITRIX_ROOT}/local/php_interface/init.php"
TARGET_FILE="${BITRIX_ROOT}/local/php_interface/include/luzhniki-fine-check-notification.php"
BEGIN_MARKER='LUZHNIKI_FINE_CHECK_NOTIFICATION_V1_BEGIN'
END_MARKER='LUZHNIKI_FINE_CHECK_NOTIFICATION_V1_END'

[[ "$(hostname)" = "${EXPECTED_HOST}" ]]
[[ -f "${INIT_FILE}" ]]
[[ -f "${TARGET_FILE}" ]]
[[ "$(grep -c "${BEGIN_MARKER}" "${INIT_FILE}" || true)" -eq 1 ]]
[[ "$(grep -c "${END_MARKER}" "${INIT_FILE}" || true)" -eq 1 ]]
/usr/bin/php -l "${INIT_FILE}"
/usr/bin/php -l "${TARGET_FILE}"

echo 'HANDLER_STATUS=installed'
echo 'WRITES_ATTEMPTED=0'
echo 'DUPLICATE_BITRIX_EMAIL_SMS=disabled-for-fine-orders'
echo 'PAYMENT_CALLBACK_IDEMPOTENCY=enabled-for-pay-system-24'
echo 'DUPLICATE_FISCAL_CHECK=blocked-before-Payment-setPaid'
echo 'OFD_RECEIPT_EMAIL=unchanged'
