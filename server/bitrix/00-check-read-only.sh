#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_HOST='aqua-bitrix-srv01'
BITRIX_ROOT='/home/bitrix/ext_www/crm.luzhniki.ru'
INIT_FILE="${BITRIX_ROOT}/local/php_interface/init.php"
TARGET_FILE="${BITRIX_ROOT}/local/php_interface/include/luzhniki-fine-check-notification.php"
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_FILE="${SOURCE_DIR}/luzhniki-fine-check-notification.php"
BEGIN_MARKER='LUZHNIKI_FINE_CHECK_NOTIFICATION_V1_BEGIN'
END_MARKER='LUZHNIKI_FINE_CHECK_NOTIFICATION_V1_END'

[[ "$(hostname)" = "${EXPECTED_HOST}" ]] || {
  echo "Остановка: нужен ${EXPECTED_HOST}. Ничего не изменено." >&2
  exit 1
}
[[ -f "${INIT_FILE}" ]]
[[ -f "${SOURCE_FILE}" ]]
/usr/bin/php -l "${SOURCE_FILE}"

begin_count="$(grep -c "${BEGIN_MARKER}" "${INIT_FILE}" || true)"
end_count="$(grep -c "${END_MARKER}" "${INIT_FILE}" || true)"
if [[ "${begin_count}" -gt 1 || "${end_count}" -gt 1 || "${begin_count}" != "${end_count}" ]]; then
  echo 'Остановка: маркированный блок init.php имеет неоднозначное состояние.' >&2
  exit 1
fi

echo "HOST=${EXPECTED_HOST}"
echo 'MODE=read-only'
echo 'WRITES_ATTEMPTED=0'
if [[ "${begin_count}" -eq 1 ]]; then
  [[ -f "${TARGET_FILE}" ]]
  /usr/bin/php -l "${TARGET_FILE}"
  echo 'HANDLER_STATUS=installed'
else
  echo 'HANDLER_STATUS=not-installed'
fi
echo 'SCOPE=only-orders-with-basket-xml-id-fine-*'
echo 'PAYMENT_CALLBACK_IDEMPOTENCY=enabled-for-pay-system-24'
echo 'DUPLICATE_FISCAL_CHECK=blocked-before-Payment-setPaid'
echo 'OFD_RECEIPT_EMAIL=not-modified'
