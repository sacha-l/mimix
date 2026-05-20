# Next Features — Mimix status & backlog

> **Living doc.** Update it after every meaningful change: move shipped items
> to **Recently shipped**, re-tier what's left, add new findings. This is the
> one place to see where Mimix is and what to do next. Keep it honest — it's
> only useful if it matches reality.

---

## Current state

Mimix tests **any web app** (and, as a target kind, Solana dApps). A visitor
registers an app URL, picks "Web app" or "Solana dApp", gives an email + goal +
a short questionnaire, picks personas, pays (or skips in debug mode), watches a
live run, and gets a report. The orchestrator spawns one agent process per
persona; each agent drives a real headless browser with Playwright and decides
actions with Claude (`MIMIX_MODEL`, default Sonnet 4.6; or hand-authored scripts
with no API key). **Web** runs browse the app as-is — no wallet. **Solana** runs
add a funded devnet Zerion wallet and a real onchain leg. For web runs the
journey is the customer's stated goal; for Solana runs it's the persona's
crypto journey. Runs/users stored as JSON files (`runs/`, `users/`). SMTP email
notifies operator on run-start and requester on report-ready. An MCP server
exposes `run_mimix` / `get_run_status` / `get_report`. Run reads (HTTP + SSE)
are gated by a per-run access token returned once at creation. Payments verify
a USDC transfer to the operator wallet (replay-guarded); pricing is $9 Standard / $29
Pro. 3 live personas; 5 beta personas are card-only stubs. Launch work lives on
the `staging` branch.

---

## Backlog

### P1 — hardening & robustness

_Empty — all known correctness/abuse-risk items are shipped. Next gaps land here._

### P2 — product / roadmap

- **Real-USDC payment UI.** The `/api/pay/verify` backend now checks a USDC
  transfer to `MIMIX_PAYOUT_ADDRESS`, but the `/pay` page UI still drives the
  old devnet USDG + Phantom flow. The first cohort is comped (debug skip); a
  real USDC checkout UI (or a hosted checkout) still needs building.
- **Tier → model wiring.** `MIMIX_MODEL` is global; the Pro tier should
  per-run select Opus 4.7 while Standard uses Sonnet 4.6. Needs a `tier` field
  on the run, threaded register → pay → `createRun` → agent env.
- **Beta personas are stubs.** The 5 beta personas (`packages/personas/beta/`)
  are card-only. To go live each needs `behavior` + `policy` + a fake-mode
  script, then moving to `packages/personas/live/`.
- **Web-app persona set.** Web runs reuse the 3 crypto personas (behavior
  profiles only); a purpose-built web-app persona set would sharpen findings.
- **"Hosted version" is vaporware copy.** The layout banner promises a hosted
  SaaS; either build it or soften the copy.
- **Report sharing.** `/report/[id]` only exports JSON — no manual "email me"
  resend, share link, or PDF (auto report-ready email already fires).
- **SSE reconnect.** `/run/[id]` shows a "connection interrupted" banner but
  relies on the browser's default retry — no explicit resume/backoff.
- **Solana mainnet target testing.** Web targets work in production as-is;
  testing a *mainnet* Solana dApp would need real mainnet wallet support.

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

- **P1 cleared:** per-run **access tokens** gate `/api/runs/[id]` and the SSE
  stream (capability-style — token in the run URL, returned once by
  `POST /api/runs`, included by the MCP server); wrap-up LLM errors now surface
  as `wrap_up_error` on the report fragment instead of silently producing empty
  observations. Also: Railway deploy live at
  `https://mimix-production.up.railway.app`, fronted by a `railway.json` +
  single-service entrypoint; Dockerfile uses `npm install -g pnpm` (the
  Playwright base image's corepack has stale keys) and matches the installed
  Playwright `v1.60.0-noble` so chromium actually launches.
- **Launch v1 (on `staging`):** engine decoupled from Solana — `target_kind`
  `web`/`solana`, so any web app is testable (web runs skip wallet/funding/
  Phantom/onchain-send; journey = customer goal). USDC payment verification +
  payment-replay guard. Revised pricing ($9 Standard / $29 Pro, USDC). Per-run
  model via `MIMIX_MODEL` (default Sonnet 4.6). Faucet per-pubkey daily cap.
  Atomic file writes (`run.json` / `users` / `payments`). http(s) URL
  validation on `/api/runs`. Target-kind selector on `/register`.
  `release-plan.md` GTM doc added.
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
