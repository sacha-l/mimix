# Mimix — context for Claude

Mimix hires AI personas to test an app. Each persona browses a target URL in a
real headless browser, completes real tasks (including signed onchain
transactions on Solana devnet), and reports the UX friction it hit in its own
voice.

## Run it from chat

This repo ships an MCP server (`services/mcp-server/`, registered in
`.mcp.json`). When the user says **"run mimix with default"**, call the
`run_mimix` tool **with no arguments** — that runs all live personas against the
hosted DemoPay target (`https://demo-target.vercel.app`).

MCP tools:
- `run_mimix` — start a run. Optional args: `target_url`, `personas` (live IDs), `goal`. Returns a `run_id`.
- `get_run_status` — poll a run by `run_id`.
- `get_report` — fetch per-persona outcomes + observations for a `run_id`.

## Architecture

```
apps/web (Next.js)        → /register /personas /pay /run /report + API routes
services/orchestrator     → createRun(): writes runs/{id}/, spawns one agent per persona
services/agent-runtime    → Playwright + Claude Opus 4.7 vision/tool-use + policy engine
services/mcp-server       → MCP wrapper around createRun()
packages/personas         → persona YAMLs (live + beta)
packages/policy-engine    → pure-function action gate
packages/zerion-fork      → forked Zerion CLI, broadcasts the real onchain tx
demo-target               → bundled Vite demo app (deployed to Vercel)
```

A run writes `runs/{id}/run.json`, `events.jsonl`, and `report-{persona}.json`.
User records (email, goal, questionnaire) live in `users/{hash}.json`.

## Dev commands

- `pnpm install`
- `pnpm dev` — Next.js on :3000
- `pnpm dev:target` — local demo target on :3001 (optional; a hosted one exists)
- `pnpm mcp` — start the MCP server on stdio
- `pnpm test` — policy-engine + personas tests

## Env vars a real run needs

- `ANTHROPIC_API_KEY` — enables Claude-driven personas (without it, scripted fixtures run)
- `TREASURY_KEYPAIR_PATH` / `TREASURY_PUBKEY` — operator treasury that funds persona wallets
- `MIMIX_PASSPHRASE` — passphrase for the forked Zerion CLI keystore
- `SOLANA_RPC_URL` — defaults to devnet
- `USDG_MINT` — mock USDG SPL token mint
- `SMTP_*` + `MIMIX_OPERATOR_EMAIL` + `MIMIX_PUBLIC_URL` — email notifications (optional)

See `.env.example` for the full list.
