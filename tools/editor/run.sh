#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v bun >/dev/null 2>&1; then
  printf 'Bun이 필요합니다: https://bun.sh\n' >&2
  exit 1
fi

if ! command -v hugo >/dev/null 2>&1; then
  printf 'Hugo가 필요합니다: brew install hugo\n' >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  bun install
fi

printf '\nHyperAccel Blog Editor: http://127.0.0.1:4173\n'
printf 'Hugo 실제 화면:          http://127.0.0.1:1413\n\n'
exec bun run dev
