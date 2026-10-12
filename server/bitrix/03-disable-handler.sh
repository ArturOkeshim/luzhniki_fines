#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_HOST='aqua-bitrix-srv01'
BITRIX_ROOT='/home/bitrix/ext_www/crm.luzhniki.ru'
INIT_FILE="${BITRIX_ROOT}/local/php_interface/init.php"
TARGET_FILE="${BITRIX_ROOT}/local/php_interface/include/luzhniki-fine-check-notification.php"
BACKUP_DIR='/root/luzhniki-fine-check-notification-backups'
BEGIN_MARKER='LUZHNIKI_FINE_CHECK_NOTIFICATION_V1_BEGIN'
END_MARKER='LUZHNIKI_FINE_CHECK_NOTIFICATION_V1_END'
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_INIT="${BACKUP_DIR}/init.php.before-disable.${STAMP}.bak"
PRESERVED_HANDLER="${TARGET_FILE}.disabled.${STAMP}"
TMP_INIT=''

[[ "$(id -u)" -eq 0 ]]
[[ "$(hostname)" = "${EXPECTED_HOST}" ]]
[[ -f "${INIT_FILE}" ]]
[[ -f "${TARGET_FILE}" ]]
[[ "$(grep -c "${BEGIN_MARKER}" "${INIT_FILE}" || true)" -eq 1 ]]
[[ "$(grep -c "${END_MARKER}" "${INIT_FILE}" || true)" -eq 1 ]]

install -d -m 0700 "${BACKUP_DIR}"
cp -a -- "${INIT_FILE}" "${BACKUP_INIT}"
TMP_INIT="$(mktemp "${INIT_FILE}.luzhniki-fines-disable.XXXXXX")"
awk -v begin="${BEGIN_MARKER}" -v end="${END_MARKER}" '
  index($0, begin) { skipping=1; next }
  index($0, end) { skipping=0; next }
  !skipping { print }
' "${INIT_FILE}" > "${TMP_INIT}"
/usr/bin/php -l "${TMP_INIT}"
mv -f -- "${TMP_INIT}" "${INIT_FILE}"
TMP_INIT=''
mv -- "${TARGET_FILE}" "${PRESERVED_HANDLER}"
/usr/bin/php -l "${INIT_FILE}"

echo 'HANDLER_DISABLE=OK'
echo "INIT_BACKUP=${BACKUP_INIT}"
echo "PRESERVED_HANDLER=${PRESERVED_HANDLER}"
echo 'Защита от повторного callback и подавление дополнительной отправки Bitrix отключены.'
