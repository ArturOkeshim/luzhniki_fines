#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

[[ $# -eq 1 && "$1" =~ ^[1-9][0-9]*$ ]] || {
  echo 'Использование: bash 04-verify-paid-order-read-only.sh ID_ПЛАТЕЖА' >&2
  exit 2
}

/usr/bin/node --experimental-strip-types --env-file=.env \
  scripts/verify-paid-order-readonly.mjs "$1"
