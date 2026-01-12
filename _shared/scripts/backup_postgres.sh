#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Load env vars from .env
set -a
source ./.env
set +a

TS="$(date +%Y-%m-%d_%H-%M-%S)"
OUT="./backups/postgres_${POSTGRES_DB}_${TS}.sql.gz"

echo "Backing up ${POSTGRES_DB} -> ${OUT}"

docker exec -t postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${OUT}"

echo "Done."
ls -lh "${OUT}"
