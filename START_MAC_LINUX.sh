#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is not installed. Read START_HERE_RU.md, section 3.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker Engine is not ready. Start Docker Desktop/Engine and try again.' >&2
  exit 1
fi
docker compose version >/dev/null
docker compose up -d --build --wait
echo 'INNOSIGHT: http://localhost:3000'
if command -v open >/dev/null 2>&1; then
  open 'http://localhost:3000' || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open 'http://localhost:3000' >/dev/null 2>&1 || true
fi
