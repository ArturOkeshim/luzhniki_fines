#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_HOST='aqua-bitrix-srv01'
BITRIX_ROOT='/home/bitrix/ext_www/crm.luzhniki.ru'
INIT_FILE="${BITRIX_ROOT}/local/php_interface/init.php"
TARGET_DIR="${BITRIX_ROOT}/local/php_interface/include"
TARGET_FILE="${TARGET_DIR}/luzhniki-fine-check-notification.php"
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_FILE="${SOURCE_DIR}/luzhniki-fine-check-notification.php"
BACKUP_DIR='/root/luzhniki-fine-check-notification-backups'
BEGIN_MARKER='LUZHNIKI_FINE_CHECK_NOTIFICATION_V1_BEGIN'
END_MARKER='LUZHNIKI_FINE_CHECK_NOTIFICATION_V1_END'
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_INIT="${BACKUP_DIR}/init.php.${STAMP}.bak"
BACKUP_HANDLER=''
TMP_INIT=''
TARGET_EXISTED=0
COMPLETED=0

rollback_error() {
  local status=$?
  trap - ERR
  set +e
  if [[ "${COMPLETED}" -eq 0 && -f "${BACKUP_INIT}" ]]; then
    cp -a -- "${BACKUP_INIT}" "${INIT_FILE}"
  fi
  if [[ "${COMPLETED}" -eq 0 ]]; then
    if [[ "${TARGET_EXISTED}" -eq 1 && -n "${BACKUP_HANDLER}" && -f "${BACKUP_HANDLER}" ]]; then
      cp -a -- "${BACKUP_HANDLER}" "${TARGET_FILE}"
    elif [[ "${TARGET_EXISTED}" -eq 0 && -f "${TARGET_FILE}" ]]; then
      rm -f -- "${TARGET_FILE}"
    fi
  fi
  [[ -z "${TMP_INIT}" || ! -e "${TMP_INIT}" ]] || rm -f -- "${TMP_INIT}"
  echo 'Установка не завершена; init.php и обработчик возвращены в исходное состояние.' >&2
  exit "${status}"
}

[[ "$(id -u)" -eq 0 ]]
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
if [[ "${begin_count}" -eq 1 ]]; then
  [[ -f "${TARGET_FILE}" ]] || {
    echo 'Остановка: подключение есть, но файл обработчика отсутствует.' >&2
    exit 1
  }
  if cmp -s -- "${SOURCE_FILE}" "${TARGET_FILE}"; then
    echo 'HANDLER_INSTALL=already-current'
    exit 0
  fi
  echo 'Остановка: обработчик уже подключён, но отличается от комплекта.' >&2
  exit 1
fi

install -d -m 0700 "${BACKUP_DIR}"
cp -a -- "${INIT_FILE}" "${BACKUP_INIT}"
if [[ -f "${TARGET_FILE}" ]]; then
  TARGET_EXISTED=1
  BACKUP_HANDLER="${BACKUP_DIR}/luzhniki-fine-check-notification.php.${STAMP}.bak"
  cp -a -- "${TARGET_FILE}" "${BACKUP_HANDLER}"
fi

trap rollback_error ERR
install -d -m 0755 -o bitrix -g bitrix "${TARGET_DIR}"
install -m 0644 -o bitrix -g bitrix "${SOURCE_FILE}" "${TARGET_FILE}"

TMP_INIT="$(mktemp "${INIT_FILE}.luzhniki-fines.XXXXXX")"
cp -a -- "${INIT_FILE}" "${TMP_INIT}"
{
  printf '\n// %s\n' "${BEGIN_MARKER}"
  printf "require_once __DIR__ . '/include/luzhniki-fine-check-notification.php';\n"
  printf '// %s\n' "${END_MARKER}"
} >> "${TMP_INIT}"
/usr/bin/php -l "${TMP_INIT}"
mv -f -- "${TMP_INIT}" "${INIT_FILE}"
TMP_INIT=''
/usr/bin/php -l "${INIT_FILE}"
/usr/bin/php -l "${TARGET_FILE}"
COMPLETED=1
trap - ERR

echo 'HANDLER_INSTALL=OK'
echo "INIT_BACKUP=${BACKUP_INIT}"
if [[ -n "${BACKUP_HANDLER}" ]]; then
  echo "HANDLER_BACKUP=${BACKUP_HANDLER}"
fi
echo 'DUPLICATE_BITRIX_EMAIL_SMS=disabled-for-fine-orders'
echo 'PAYMENT_CALLBACK_IDEMPOTENCY=enabled-for-pay-system-24'
echo 'DUPLICATE_FISCAL_CHECK=blocked-before-Payment-setPaid'
echo 'OFD_RECEIPT_EMAIL=unchanged'
