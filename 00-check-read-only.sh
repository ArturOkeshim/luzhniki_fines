#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
sha256sum -c SHA256SUMS.txt
/usr/bin/node --env-file=.env scripts/check-production-config.mjs
/usr/bin/node --experimental-strip-types --env-file=.env scripts/preflight-readonly.mjs
