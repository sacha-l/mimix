# Next Features — Mimix status & backlog

> **Living doc.** Update it after every meaningful change: move shipped items
> to **Recently shipped**, re-tier what's left, add new findings. This is the
> one place to see where Mimix is and what to do next. Keep it honest — it's
> only useful if it matches reality.

---

## Current state

Mimix is a working demo: a visitor registers an app URL, gives an email +
goal + a short questionnaire, picks personas, pays (or skips in debug mode),
watches a live run, and gets a report. The orchestrator spawns one agent
process per persona; each agent drives a real headless browser with
Playwright, decides actions with Claude Opus 4.7 (or hand-authored scripts
when no API key is set), passes every action through the policy engine, and
broadcasts a real Solana devnet transaction via the forked Zerion CLI. Runs
and users are stored as JSON files (`runs/`, `users/`). SMTP email notifies
the operator on run-start and the requester on report-ready. An MCP server
(`services/mcp-server`) exposes `run_mimix` / `get_run_status` / `get_report`
so a Claude client can drive runs. 3 live personas; 5 beta personas are
card-only stubs.

---

## Backlog

### P1 — hardening & robustness

- **Faucet is unprotected.** `apps/web/app/api/faucet/route.ts` mints 100 USDG
  to any pubkey with no rate limit, per-pubkey cap, or origin check — trivially
  drainable in a loop. Add a per-pubkey/IP daily cap (file-based counter).
- **No auth on API routes.** `/api/runs`, `/api/runs/[id]`, `/api/runs/[id]/events`,
  `/api/pay/verify` are all open — anyone can create runs, watch any run's live
  SSE stream, or verify arbitrary transactions. Decide on a model (signed
  requester token, or accept it as a deliberate demo gap).
- **Payment-signature replay.** `/api/pay/verify` will verify the same signature
  for multiple runs. Track consumed signatures.
- **Non-atomic file writes.** `run.json` and `users/*.json` are read-modify-write
  with no locking — concurrent updates race and a crash mid-write corrupts the
  file. Use write-temp-then-rename; consider a per-file lock for `users/`.
- **Wrap-up LLM errors are silent.** If `askObservations` fails, the report
  fragment gets empty observations with no surfaced reason
  (`services/agent-runtime/src/main.ts`).

### P2 — product / roadmap

- **Beta personas are stubs.** The 5 beta personas (`packages/personas/beta/`)
  are card-only. To go live each needs `wallet` + `policy` + `behavior` +
  `journey_goal`, a `PERSONA_SCRIPTS` entry and a `PERSONA_OBSERVATIONS` bank in
  `services/agent-runtime/src/llm.ts`, then moving to `packages/personas/live/`.
- **Monetization is disabled.** `/pricing` Starter + Pro tiers are "coming soon"
  with disabled CTAs — no real purchase path.
- **Mainnet payment path.** Devnet mock USDG → real mainnet USDC settlement is
  unbuilt and undocumented.
- **"Hosted version" is vaporware copy.** The layout banner promises a hosted
  SaaS; either build it or soften the copy.
- **Report sharing.** `/report/[id]` only exports JSON — no "email me", share
  link, or PDF.
- **SSE reconnect.** `/run/[id]` now shows a "connection interrupted" banner but
  relies on the browser's default retry — no explicit resume/backoff.
- **Arbitrary-URL coverage.** Most production Solana dApps reject a devnet
  wallet; only the bundled DemoPay target is reliable.

### P3 — DX & quality

- **No CI.** No GitHub Actions, lint config, formatter, or pre-commit hook.
- **Thin test coverage.** Tests exist only for `policy-engine` and `personas`.
  Nothing covers the orchestrator, the agent-runtime main loop, the API routes,
  `email.ts`, `users.ts`, or the MCP server.
- **Repo hygiene.** 30+ test run directories are committed under `runs/`.
- **Observability.** No structured logging, no health-check endpoint, no
  first-class way to see why a run failed.

---

## Recently shipped

- **Critical fixes:** orchestrator agent-spawn timeout (`MIMIX_AGENT_TIMEOUT_MS`)
  so a hung agent can't hang the whole run; `createRun` rejects 0-persona runs;
  error states on `/run/[id]` + `/report/[id]` (no more infinite "Loading…");
  Dockerfile now builds `services/mcp-server` and provisions `users/`;
  `.env.example` documents `MIMIX_TURN_BUDGET` / `MIMIX_FAKE_LLM` /
  `MIMIX_AGENT_TIMEOUT_MS`.
- **User onboarding:** `/register` collects email + goal + questionnaire;
  file-based user store at `users/{hash}.json`.
- **Email notifications:** SMTP/nodemailer — operator on run-start, requester on
  report-ready (no-op when SMTP env is unset).
- **LLM upgrade:** agent runtime moved to `claude-opus-4-7`.
- **MCP server:** `services/mcp-server` exposes `run_mimix` / `get_run_status` /
  `get_report`.
- **Repositioning:** marketing copy generalized from "Solana dApp" to "any app";
  creator attribution (Sacha Lansky, GitHub, X) added.

---

## How to use this doc

1. When you finish a backlog item, move it to **Recently shipped** with a
   one-line summary; delete it from the tier list.
2. When you discover a new gap, add it under the right tier (P1 = correctness
   or abuse risk, P2 = product/roadmap, P3 = DX/quality).
3. Keep **Current state** accurate — it's the fastest way for anyone (human or
   agent) to get oriented.
4. If a tier empties out, that's a real milestone — note it.
