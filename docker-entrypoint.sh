#!/usr/bin/env bash
set -euo pipefail

cd /app
mkdir -p /app/runs /app/users

# Single service: the Next.js app. The orchestrator runs in-process and
# spawns the agent-runtime as child processes. The demo target is hosted
# separately on Vercel, so it is not run here.
#
# Railway injects PORT; fall back to 3000 for a plain `docker run`.
exec pnpm --filter @mimix/web start --hostname 0.0.0.0 --port "${PORT:-3000}"
