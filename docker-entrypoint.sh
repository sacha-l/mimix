#!/usr/bin/env bash
set -euo pipefail

cd /app

mkdir -p /app/runs

pnpm --filter @mimix/demo-target preview --host 127.0.0.1 --port 3001 &
TARGET_PID=$!

pnpm --filter @mimix/web start --hostname 0.0.0.0 --port 3000 &
WEB_PID=$!

shutdown() {
  echo "[entrypoint] shutting down (TARGET=$TARGET_PID WEB=$WEB_PID)"
  kill -TERM "$TARGET_PID" "$WEB_PID" 2>/dev/null || true
  wait "$TARGET_PID" "$WEB_PID" 2>/dev/null || true
  exit 0
}
trap shutdown SIGTERM SIGINT

wait -n "$TARGET_PID" "$WEB_PID"
EXIT_CODE=$?
echo "[entrypoint] one process exited with $EXIT_CODE — tearing down"
shutdown
