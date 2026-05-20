#!/usr/bin/env bash
set -euo pipefail

cd /app

# Ensure the data dir exists (Railway Volume mounts at MIMIX_DATA_ROOT in prod).
mkdir -p "${MIMIX_DATA_ROOT:-/app}/runs"

# Apply pending DB migrations. Idempotent — no-op if up-to-date. Soft-fail so
# the container can still come up if DATABASE_URL is not configured yet
# (the operator will see auth() errors and know what to fix).
pnpm --filter @mimix/web prisma:migrate:deploy || {
  echo "[entrypoint] WARN: prisma migrate deploy failed — continuing without applying migrations"
}

# Single service: the Next.js app. Railway injects PORT.
exec pnpm --filter @mimix/web start --hostname 0.0.0.0 --port "${PORT:-3000}"
