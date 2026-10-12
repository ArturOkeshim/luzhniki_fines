#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE_ID='LUZHNIKI-FINES-SERVER-V54.2-FULL'
APP_PARENT='/opt/luzhniki-oplata-shtrafov'
APP_DIR="${APP_PARENT}/shtrafiParkovrf"
SERVICE_NAME='luzhniki-fines'
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
RECONCILE_SERVICE_FILE='/etc/systemd/system/luzhniki-fines-reconcile.service'
RECONCILE_TIMER_FILE='/etc/systemd/system/luzhniki-fines-reconcile.timer'
NGINX_FILE='/etc/nginx/conf.d/shtrafy.luzh-dev.ru.conf'
MARKER_NAME='.luzhniki-fines-fresh-v54.2'
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
STAGING_DIR=''
APP_INSTALLED=0
SERVICE_INSTALLED=0
RECONCILE_SERVICE_INSTALLED=0
RECONCILE_TIMER_INSTALLED=0
NGINX_INSTALLED=0

cleanup_staging() {
  if [[ -n "${STAGING_DIR:-}" && -d "${STAGING_DIR}" ]]; then
    case "${STAGING_DIR}" in
      "${APP_PARENT}"/.shtrafiParkovrf-install.*) rm -rf -- "${STAGING_DIR}" ;;
      *) echo 'Остановка очистки: неожиданный временный путь' >&2 ;;
    esac
  fi
}

rollback_error() {
  local status=$?
  trap - ERR
  set +e
  echo 'Установка не завершена. Выполняется автоматический откат.' >&2
  if [[ "${SERVICE_INSTALLED}" -eq 1 ]]; then
    systemctl disable --now "${SERVICE_NAME}" >/dev/null 2>&1 || true
  fi
  if [[ "${RECONCILE_TIMER_INSTALLED}" -eq 1 ]]; then
    systemctl disable --now luzhniki-fines-reconcile.timer >/dev/null 2>&1 || true
  fi
  if [[ "${SERVICE_INSTALLED}" -eq 1 && -f "${SERVICE_FILE}" ]]; then
    rm -f -- "${SERVICE_FILE}"
  fi
  if [[ "${RECONCILE_SERVICE_INSTALLED}" -eq 1 && -f "${RECONCILE_SERVICE_FILE}" ]]; then
    rm -f -- "${RECONCILE_SERVICE_FILE}"
  fi
  if [[ "${RECONCILE_TIMER_INSTALLED}" -eq 1 && -f "${RECONCILE_TIMER_FILE}" ]]; then
    rm -f -- "${RECONCILE_TIMER_FILE}"
  fi
  if [[ "${NGINX_INSTALLED}" -eq 1 && -f "${NGINX_FILE}" ]]; then
    rm -f -- "${NGINX_FILE}"
  fi
  systemctl daemon-reload >/dev/null 2>&1 || true
  if command -v nginx >/dev/null 2>&1 && nginx -t >/dev/null 2>&1; then
    systemctl reload nginx >/dev/null 2>&1 || true
  fi
  if [[ "${APP_INSTALLED}" -eq 1 && -d "${APP_DIR}" ]]; then
    local failed_dir="${APP_PARENT}/shtrafiParkovrf-failed-$(date +%Y%m%d-%H%M%S)"
    mv -- "${APP_DIR}" "${failed_dir}"
    echo "Неудачная установка сохранена: ${failed_dir}" >&2
  fi
  cleanup_staging
  exit "${status}"
}

[[ "$(id -u)" -eq 0 ]]
[[ -f "${SOURCE_DIR}/.env" ]]
[[ -f "${SOURCE_DIR}/package.json" ]]
[[ -f "${SOURCE_DIR}/deploy/luzhniki-fines.service" ]]
[[ -f "${SOURCE_DIR}/deploy/luzhniki-fines-reconcile.service" ]]
[[ -f "${SOURCE_DIR}/deploy/luzhniki-fines-reconcile.timer" ]]
[[ -f "${SOURCE_DIR}/deploy/nginx-shtrafy.luzh-dev.ru.conf" ]]

for program in /usr/bin/node /usr/bin/npm /usr/bin/curl /usr/bin/systemctl /usr/sbin/nginx; do
  [[ -x "${program}" ]] || {
    echo "Остановка: отсутствует ${program}. Установите предварительные зависимости." >&2
    exit 1
  }
done

getent passwd www-data >/dev/null
getent group www-data >/dev/null
for target in "${APP_DIR}" "${SERVICE_FILE}" "${RECONCILE_SERVICE_FILE}" "${RECONCILE_TIMER_FILE}" "${NGINX_FILE}"; do
  if [[ -e "${target}" || -L "${target}" ]]; then
    echo "Остановка: уже существует ${target}. Работающая установка не изменена." >&2
    exit 1
  fi
done
[[ -d /etc/nginx/conf.d ]]
/usr/sbin/nginx -t
[[ -f "${SOURCE_DIR}/pnpm-lock.yaml" ]]
[[ ! -e "${SOURCE_DIR}/.env.local" ]]
cd "${SOURCE_DIR}"
sha256sum -c SHA256SUMS.txt >/dev/null

/usr/bin/node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) process.exit(1);
' || {
  echo 'Остановка: требуется Node.js версии 22.13 или новее.' >&2
  exit 1
}

for key in VIBECODE_API_KEY B24_WEBHOOK_URL APP_SESSION_SECRET; do
  grep -Eq "^[[:space:]]*${key}=.+" "${SOURCE_DIR}/.env" || {
    echo "Остановка: в .env отсутствует заполненная переменная ${key}." >&2
    exit 1
  }
done
grep -Eq '^[[:space:]]*B24_WEBHOOK_URL=https://crm\.luzhniki\.ru/rest/[0-9]+/[^/]+/$' \
  "${SOURCE_DIR}/.env" || {
    echo 'Остановка: B24_WEBHOOK_URL не прошёл проверку формата.' >&2
    exit 1
  }
if grep -Eqi 'CHANGE_ME|PLACEHOLDER|YOUR_KEY|КЛЮЧ|СЕКРЕТ' "${SOURCE_DIR}/.env"; then
  echo 'Остановка: в .env обнаружено шаблонное значение.' >&2
  exit 1
fi

# No ERR trap before these checks: an existing installation must never be stopped.
/usr/bin/node --env-file=.env scripts/check-production-config.mjs
/usr/bin/node --experimental-strip-types --env-file=.env scripts/preflight-readonly.mjs
trap rollback_error ERR
trap cleanup_staging EXIT

install -d -m 0755 "${APP_PARENT}"
STAGING_DIR="$(mktemp -d "${APP_PARENT}/.shtrafiParkovrf-install.XXXXXX")"
cp -a "${SOURCE_DIR}/." "${STAGING_DIR}/"
chmod 0600 "${STAGING_DIR}/.env"
printf '%s\n' "${PACKAGE_ID}" > "${STAGING_DIR}/${MARKER_NAME}"
chmod 0444 "${STAGING_DIR}/${MARKER_NAME}"

cd "${STAGING_DIR}"
# Keep exactly the same lockfile and package-manager version as the tested build.
/usr/bin/npm exec --yes --package=pnpm@11.19.0 -- pnpm install --frozen-lockfile --ignore-scripts --prod=false
/usr/bin/npm test
/usr/bin/npm run build
[[ -f dist/server/index.js ]]
[[ -d dist/client ]]

install -d -m 0755 -o www-data -g www-data "${STAGING_DIR}/.runtime"
chown -R www-data:www-data "${STAGING_DIR}"
chmod 0600 "${STAGING_DIR}/.env"
mv -- "${STAGING_DIR}" "${APP_DIR}"
STAGING_DIR=''
APP_INSTALLED=1

install -m 0644 -o root -g root \
  "${APP_DIR}/deploy/luzhniki-fines.service" "${SERVICE_FILE}"
SERVICE_INSTALLED=1
install -m 0644 -o root -g root \
  "${APP_DIR}/deploy/luzhniki-fines-reconcile.service" "${RECONCILE_SERVICE_FILE}"
RECONCILE_SERVICE_INSTALLED=1
install -m 0644 -o root -g root \
  "${APP_DIR}/deploy/luzhniki-fines-reconcile.timer" "${RECONCILE_TIMER_FILE}"
RECONCILE_TIMER_INSTALLED=1
install -m 0644 -o root -g root \
  "${APP_DIR}/deploy/nginx-shtrafy.luzh-dev.ru.conf" "${NGINX_FILE}"
NGINX_INSTALLED=1

/usr/sbin/nginx -t
/usr/bin/systemctl daemon-reload
/usr/bin/systemctl enable --now "${SERVICE_NAME}"
/usr/bin/systemctl enable --now luzhniki-fines-reconcile.timer
/usr/bin/systemctl enable --now nginx
/usr/bin/systemctl reload nginx

for attempt in {1..20}; do
  if /usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3000/ >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 20 ]]; then
    echo 'Остановка: приложение не ответило на локальную проверку.' >&2
    false
  fi
  sleep 1
done

/usr/bin/systemctl is-active --quiet "${SERVICE_NAME}"
/usr/bin/systemctl is-enabled --quiet "${SERVICE_NAME}"
/usr/bin/systemctl is-active --quiet luzhniki-fines-reconcile.timer
/usr/bin/systemctl is-enabled --quiet luzhniki-fines-reconcile.timer
/usr/bin/systemctl is-active --quiet nginx
/usr/bin/node scripts/http-smoke.mjs http://127.0.0.1:3000/

trap - ERR
echo 'FRESH_INSTALL=OK'
echo "APP_DIR=${APP_DIR}"
echo "SERVICE=${SERVICE_NAME}"
echo 'RECONCILE_TIMER=luzhniki-fines-reconcile.timer'
echo 'LOCAL_HTTP_CHECK=OK'
echo 'Секреты установлены из комплектного .env и не выводились.'
