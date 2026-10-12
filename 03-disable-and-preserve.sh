#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE_ID='LUZHNIKI-FINES-SERVER-V54.2-FULL'
APP_PARENT='/opt/luzhniki-oplata-shtrafov'
APP_DIR="${APP_PARENT}/shtrafiParkovrf"
SERVICE_FILE='/etc/systemd/system/luzhniki-fines.service'
RECONCILE_SERVICE_FILE='/etc/systemd/system/luzhniki-fines-reconcile.service'
RECONCILE_TIMER_FILE='/etc/systemd/system/luzhniki-fines-reconcile.timer'
NGINX_FILE='/etc/nginx/conf.d/shtrafy.luzh-dev.ru.conf'
STAMP="$(date +%Y%m%d-%H%M%S)"

[[ "$(id -u)" -eq 0 ]]
[[ -f "${APP_DIR}/.luzhniki-fines-fresh-v54.2" ]]
[[ "$(tr -d '\r\n' < "${APP_DIR}/.luzhniki-fines-fresh-v54.2")" = "${PACKAGE_ID}" ]]

systemctl disable --now luzhniki-fines-reconcile.timer || true
systemctl disable --now luzhniki-fines || true
if [[ -f "${SERVICE_FILE}" ]]; then
  mv -- "${SERVICE_FILE}" "${SERVICE_FILE}.disabled.${STAMP}"
fi
if [[ -f "${RECONCILE_SERVICE_FILE}" ]]; then
  mv -- "${RECONCILE_SERVICE_FILE}" "${RECONCILE_SERVICE_FILE}.disabled.${STAMP}"
fi
if [[ -f "${RECONCILE_TIMER_FILE}" ]]; then
  mv -- "${RECONCILE_TIMER_FILE}" "${RECONCILE_TIMER_FILE}.disabled.${STAMP}"
fi
if [[ -f "${NGINX_FILE}" ]]; then
  mv -- "${NGINX_FILE}" "${NGINX_FILE}.disabled.${STAMP}"
fi
systemctl daemon-reload
/usr/sbin/nginx -t
systemctl reload nginx || true

PRESERVED_DIR="${APP_PARENT}/shtrafiParkovrf-disabled-${STAMP}"
mv -- "${APP_DIR}" "${PRESERVED_DIR}"

echo 'Служба отключена. Файлы не удалены.'
echo "PRESERVED_DIR=${PRESERVED_DIR}"
echo "SERVICE_BACKUP=${SERVICE_FILE}.disabled.${STAMP}"
echo "NGINX_BACKUP=${NGINX_FILE}.disabled.${STAMP}"
