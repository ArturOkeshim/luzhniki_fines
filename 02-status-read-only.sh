#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR='/opt/luzhniki-oplata-shtrafov/shtrafiParkovrf'

echo 'APP:'
test -f "${APP_DIR}/.luzhniki-fines-fresh-v54.2"
test -s "${APP_DIR}/.env"
stat -c '%A %U:%G %n' "${APP_DIR}" "${APP_DIR}/.env"

echo 'SERVICE:'
systemctl is-active luzhniki-fines
systemctl is-enabled luzhniki-fines
systemctl status luzhniki-fines --no-pager --lines=10

echo 'RECONCILIATION TIMER:'
systemctl is-active luzhniki-fines-reconcile.timer
systemctl is-enabled luzhniki-fines-reconcile.timer
systemctl status luzhniki-fines-reconcile.timer --no-pager --lines=10

echo 'NGINX:'
/usr/sbin/nginx -t
systemctl is-active nginx

echo 'LOCAL_HTTP:'
/usr/bin/curl -fsS --max-time 10 http://127.0.0.1:3000/ >/dev/null
echo 'OK'
