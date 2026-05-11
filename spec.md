# Mimix — Build Spec

A marketplace of autonomous onchain agent-personas that test Solana dApps like real users. Builders register **any Solana dApp URL**, pick personas, pay in mock USDG on devnet, and Mimix spawns agents — each with its own funded **devnet** wallet, scoped policy, and behavior profile — that execute **real signed onchain transactions** through a **forked Zerion CLI**, and return a structured report with verifiable Solscan tx links.

Each persona is a fork of the public Zerion CLI plus a YAML policy file. Agents navigate the target dApp via headless browser automation, decide actions via Claude Sonnet 4.6 (vision + tool-use), and execute their onchain payment leg via the forked Zerion CLI's `send` pipeline. The demo ships with a reference target dApp (`demo-target/`) on devnet — a simple Solana SOL payment UI with intentional UX issues — but the `/register` flow accepts any URL.

Devnet is a deliberate choice for the hackathon: every agent transaction is a real signed Solana transaction submitted via the forked Zerion CLI and confirmed on devnet (verified end-to-end in the Phase 0 spike, tx `3dsvt9f5unUtaMqPVDkUNKCWZtjDiFAmYftSbDGZd59HD5bTm126huDKEeWvWtVtov6zo7kamM1kyrUGozsWVCu5`). The mainnet path is identical and documented as the production deployment.

---

## Bounty alignment

This project targets two Frontier hackathon tracks. The spec is shaped by both.

### Zerion Track (2,000 USDC) — primary

- `packages/zerion-fork/` is a **real fork** of [`zeriontech/zerion-ai`](https://github.com/zeriontech/zerion-ai) at upstream commit `a0518ca5f92d7da50beb7fb9801efd82d8ac30e4`, with documented Mimix modifications in `packages/zerion-fork/MIMIX_FORK.md`.
- Every persona's onchain action routes through the forked Zerion CLI's `send` pipeline (build → OWS sign → broadcast). Real signed devnet transactions, verifiable on Solscan.
- Every persona enforces a scoped policy via `packages/policy-engine/` (chain lock, spend cap, allowed actions, session timeout) on top of Zerion CLI's own policy system.
- Open source GitHub + demo video.

**Spike result (Phase 0, 2026-05-12):** the forked Zerion CLI's `send SOL` works on Solana devnet via `SOLANA_RPC_URL` env override. Real tx confirmed: `3dsvt9f5unUtaMqPVDkUNKCWZtjDiFAmYftSbDGZd59HD5bTm126huDKEeWvWtVtov6zo7kamM1kyrUGozsWVCu5`. The Zerion `swap` and SPL `send` pathways are mainnet-only (Zerion API does not serve devnet); Mimix uses native SOL transfers as the agent's onchain leg. The bounty's "at least one real onchain transaction" is satisfied; the "all swaps must route through Zerion API" sub-clause is vacuously satisfied (no swaps).

### Visa Frontier Track (10,000 USDG, Superteam Germany) — opportunistic

Submission is cheap (Superteam Earn button), so we'll submit but not contort the demo around it. The README includes a "Mainnet payment path" section showing how the devnet mock-USDG flow becomes real USDC on mainnet in production. Submission still requires:

- Project on both **Colosseum portal** and **Superteam Earn**
- Country marked **GERMANY**
- Eligibility per global hackathon rules

---

## Tech stack (locked — do not substitute)

- **Frontend:** Next.js 14 App Router, Tailwind, shadcn/ui
- **Backend:** Next.js API routes + Node child processes for agent runtimes
- **Browser automation:** Playwright (headless Chromium) with `page.addInitScript()` injecting `window.phantom.solana` provider stub
- **LLM:** Anthropic Claude `claude-sonnet-4-6` via `@anthropic-ai/sdk` with vision, tool-use structured output, and prompt caching on the static persona prefix
- **Solana:** `@solana/web3.js`, `@solana/spl-token`, **devnet** (mainnet-fork local validator as Phase 0 fallback)
- **Zerion:** **fork** of `zeriontech/zerion-ai` into `packages/zerion-fork/` — all swap execution routes through it
- **USDG:** mock SPL token deployed on Solana devnet via included script
- **Streaming:** Server-Sent Events
- **State:** filesystem JSON under `runs/`. No database, no Redis, no Docker.
- **Package manager:** pnpm workspaces

---

## Repo structure

```
mimix/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── page.tsx                       # Landing
│       │   ├── register/page.tsx              # Register any Solana dApp URL
│       │   ├── personas/page.tsx              # Marketplace (8 cards: 3 live + 5 beta)
│       │   ├── pay/page.tsx                   # USDG payment (devnet)
│       │   ├── run/[id]/page.tsx              # Live run dashboard
│       │   ├── report/[id]/page.tsx           # Final report
│       │   └── api/
│       │       ├── runs/route.ts              # POST create run
│       │       ├── runs/[id]/route.ts         # GET run state
│       │       ├── runs/[id]/events/route.ts  # SSE event stream
│       │       ├── pay/verify/route.ts        # Verify devnet USDG transfer
│       │       └── personas/route.ts          # List 8 persona cards
│       └── components/
├── packages/
│   ├── zerion-fork/                           # Real fork of zerion-ai + Mimix wrapper
│   ├── policy-engine/                         # YAML policy parser + checker
│   ├── persona-types/                         # Shared TS types
│   └── personas/
│       ├── live/
│       │   ├── newbie-nora.yaml
│       │   ├── whale-walter.yaml
│       │   └── degen-dan.yaml
│       └── beta/
│           ├── cross-chain-cody.yaml
│           ├── mobile-maya.yaml
│           ├── stablecoin-sam.yaml
│           ├── paranoid-pat.yaml
│           └── yield-hunter-yuki.yaml
├── services/
│   ├── orchestrator/                          # Spawns + monitors agents (sequential)
│   └── agent-runtime/                         # Playwright + LLM + Zerion + policy loop
├── demo-target/                               # Reference test target: throwaway Solana devnet swap dApp w/ intentional UX issues, swaps routed through Zerion
├── runs/                                      # Filesystem state for runs
├── scripts/
│   ├── deploy-mock-usdg.ts                    # Deploy USDG-mock SPL token on devnet
│   ├── setup-treasury.ts                      # Initialize treasury wallet + USDG ATA
│   └── fund-persona-wallet.ts                 # Funds a fresh keypair (SOL faucet + USDG mint)
├── README.md
├── package.json
└── pnpm-workspace.yaml
```

---

## Data models

### Persona card (for marketplace UI)

```ts
type PersonaCard = {
  id: string;
  display_name: string;
  avatar_emoji: string;
  tagline: string;
  tests: string;
  status: "live" | "beta";
  price_usdg: 5;
}
```

### Live persona YAML (full schema)

```yaml
id: newbie-nora
display_name: Newbie Nora
avatar_emoji: "🐣"
status: live
tagline: First-time Solana user. Easily confused.
tests: Onboarding friction, signing UX, default settings.
price_usdg: 5

wallet:
  chain: solana
  network: devnet
  starting_balance_sol: 0.5
  starting_balance_usdg: 50

policy:
  max_slippage_bps: 50
  max_spend_per_tx_usd: 10
  max_total_spend_usd: 30
  allowed_actions: [view, click, type, connect_wallet, sign, swap]
  forbidden_actions: [stake, leverage, lend, bridge, approve_unlimited]
  allowed_chains: [solana-devnet]
  session_duration_min: 5

behavior:
  patience_score: 3        # 1-10
  technical_skill: 2
  risk_tolerance: 1
  reads_warnings: true
  abandonment_triggers:
    - slippage_above_threshold
    - signing_dialog_complex
    - cta_unclear
    - error_message_unexplained

journey_goal: |
  You are a brand-new Solana user. Your goal is to swap 5 USDG for SOL.
  You don't know what slippage means. You will read warnings.
  If anything is confusing, you will abandon and explain why.
```

### Beta persona YAML (stub — no runtime logic needed)

```yaml
id: mobile-maya
display_name: Mobile Maya
avatar_emoji: "📱"
status: beta
tagline: Phantom mobile user on a small screen.
tests: Responsive layout, mobile wallet adapter, touch targets.
price_usdg: 5
```

### Run (`runs/{run_id}/run.json`)

```json
{
  "id": "run_01HXXXX",
  "created_at": "2026-05-12T22:30:00Z",
  "target_dapp": {
    "url": "https://demo-target.mimix.app",
    "name": "DemoSwap",
    "description": "Solana devnet swap dApp under test"
  },
  "personas": ["newbie-nora", "whale-walter", "degen-dan"],
  "payment": {
    "amount_usdg": 15,
    "tx_signature": "5J7...",
    "verified": true
  },
  "status": "running",
  "agents": {
    "newbie-nora": { "status": "running", "events_count": 23 },
    "whale-walter": { "status": "complete", "events_count": 41 },
    "degen-dan": { "status": "running", "events_count": 18 }
  }
}
```

### Event (`runs/{run_id}/events.jsonl` — one JSON per line)

```json
{ "ts": "...", "persona": "newbie-nora", "type": "action", "action": "click", "selector": "button[data-testid=connect]", "reasoning": "I need to connect my wallet first." }
{ "ts": "...", "persona": "newbie-nora", "type": "screenshot", "path": "runs/.../shots/0003.png" }
{ "ts": "...", "persona": "newbie-nora", "type": "tx", "chain": "solana-devnet", "signature": "5J7...", "via": "zerion-api", "result": "success" }
{ "ts": "...", "persona": "newbie-nora", "type": "policy_block", "attempted": "approve_unlimited", "reason": "forbidden_action" }
{ "ts": "...", "persona": "newbie-nora", "type": "observation", "text": "The slippage default is 1% — I expected 0.5%. Felt risky." }
{ "ts": "...", "persona": "newbie-nora", "type": "abandon", "reason": "signing_dialog_complex", "step": "swap_confirm" }
```

### Report (`runs/{run_id}/report.json`)

```json
{
  "run_id": "run_01HXXXX",
  "summary": {
    "personas_run": 3,
    "journeys_completed": 1,
    "journeys_abandoned": 2,
    "total_real_txs": 4,
    "policy_violations_blocked": 2,
    "user_ready_score": 42
  },
  "per_persona": [
    {
      "persona": "newbie-nora",
      "outcome": "abandoned",
      "abandon_reason": "signing_dialog_complex",
      "completed_steps": ["connect_wallet", "select_token", "input_amount"],
      "failed_step": "confirm_swap",
      "observations": ["..."],
      "tx_signatures": []
    }
  ]
}
```

---

## Personas

### Live (fully wired, devnet via Zerion)

| ID | Name | Wallet | What it tests |
|---|---|---|---|
| `newbie-nora` | 🐣 Newbie Nora | 0.5 SOL / 50 USDG | Onboarding, signing UX, default slippage |
| `whale-walter` | 🐋 Whale Walter | 50 SOL / 10k USDG | Execution quality, MEV, large-amount warnings |
| `degen-dan` | 🐺 Degen Dan | 5 SOL / 500 USDG | Multi-tx flow, repeat actions, high slippage tolerance |

Devnet means we can use larger wallet balances without real-money exposure — useful for Walter's "large amount warning" tests. Walter's policy has `max_slippage_bps: 30`, `max_spend_per_tx_usd: 5000`, allows `simulate_tx`. Dan's has `max_slippage_bps: 300`, `patience_score: 9`, `reads_warnings: false`.

### Beta (stubs only — marketplace cards, not runnable)

| ID | Name | Tests |
|---|---|---|
| `cross-chain-cody` | 🌉 Cross-chain Cody | LI.FI bridge UX, post-bridge asset visibility (v2) |
| `mobile-maya` | 📱 Mobile Maya | Responsive layout, mobile wallet, touch targets |
| `stablecoin-sam` | 💵 Stablecoin Sam | Recurring payment flows, USDG-pair UX |
| `paranoid-pat` | 🕵️ Paranoid Pat | Security warnings, tx simulation, signature clarity |
| `yield-hunter-yuki` | 🌾 Yield Hunter Yuki | APY display, lock-up clarity, claim flows |

Beta YAMLs contain only the card fields (id through price_usdg). Orchestrator rejects them with 400 if selected.

---

## Component specs

### `packages/policy-engine/`

Pure TypeScript. No I/O. Single export:

```ts
function checkAction(
  policy: PersonaPolicy,
  action: AgentAction,
  context: { spentSoFar: number; sessionElapsedMs: number; chain: string }
): { allowed: true } | { allowed: false; reason: string }
```

Checks performed:
- Action type ∈ `allowed_actions` and ∉ `forbidden_actions`
- Spend would not exceed `max_spend_per_tx_usd` or `max_total_spend_usd`
- Slippage param ≤ `max_slippage_bps`
- Chain ∈ `allowed_chains`
- Session elapsed < `session_duration_min`

Every blocked action emits a `policy_block` event upstream.

### `packages/zerion-fork/`

Per Zerion bounty requirement: this is a **real fork** of `zeriontech/zerion-ai`, not a dependency.

1. Fork the public Zerion CLI repo into `packages/zerion-fork/` and record the fork commit SHA in README
2. Add a thin Mimix wrapper exposing `executeSwap(walletKeypair, params) → { signature, route, commissionPaid }`
3. Add a `--policy <path>` CLI flag that loads a Mimix policy YAML and enforces it before sending
4. Add a `--mimix-persona <id>` flag so tx events can be tagged back to a persona
5. Re-export the wrapper for use by `agent-runtime` and the demo dApp backend

All agent swaps go through this wrapper. All swaps go through the Zerion API (mandated by Zerion CLI's execution model and the bounty). Do not call other DEX endpoints directly from `agent-runtime` or `demo-target/`.

### `services/agent-runtime/`

One Node child process per persona. Main loop:

```
load persona YAML (live only)
load policy
generate fresh keypair for this persona
call scripts/fund-persona-wallet.ts to fund from devnet faucet + USDG mint

launch Playwright browser
inject window.phantom.solana provider via page.addInitScript()
  - publicKey = persona keypair
  - signTransaction / signAndSendTransaction sign locally and submit via devnet RPC
navigate to target dApp URL

loop (max 30 turns, max 10 min wall-clock, max $10 LLM spend):
  take screenshot
  emit screenshot event
  call LLM with:
    - persona profile + journey_goal (prompt-cached static prefix)
    - current screenshot (vision)
    - recent action history (last 5)
    - remaining policy budget
  receive proposed action + reasoning (tool-use structured output)
  check action via policy-engine.checkAction
  if blocked:
    emit policy_block event
    ask LLM for alternative action
    continue
  if action == abandon:
    emit abandon event with reason
    break
  if action == swap:
    call zerion-fork.executeSwap(...)
    emit tx event with devnet signature
  else:
    execute via Playwright (click / type / sign)
    emit action event
  if journey complete (LLM signals or goal heuristic):
    emit complete event
    break

after loop:
  ask LLM for 3-5 qualitative observations in persona voice
  emit observation events
  close browser
  write per-persona report fragment
```

**Why the agent's swap goes through Zerion CLI even when testing the target dApp's UI:** the Zerion bounty requires all agent swaps to route through the Zerion API. The agent observes the target dApp's swap UI to gather UX observations (slippage defaults, scary modals, friction), then executes the actual swap intent via the forked Zerion CLI. For our own `demo-target/`, the dApp's "Confirm Swap" button also delegates to Zerion server-side, so the two execution paths are the same.

Hard guardrails: 30-turn cap, 10-minute wall-clock cap, $10 LLM spend cap per run.

### `services/orchestrator/`

Next.js API routes:

- `POST /api/runs` — body: `{ target_dapp_url, personas[], payment_signature }`
  - Verifies payment via `/api/pay/verify` against Solana **devnet**
  - Rejects with 400 if any persona has `status: beta`
  - Creates `runs/{id}/`, spawns child processes **sequentially**
  - Returns `{ run_id }`
- `GET /api/runs/[id]` — returns `runs/{id}/run.json`
- `GET /api/runs/[id]/events` — SSE stream tailing `runs/{id}/events.jsonl`
- `POST /api/pay/verify` — verifies a USDG-mock SPL transfer on Solana **devnet** to the marketplace treasury wallet matches the expected amount; returns `{ verified: boolean }`
- `GET /api/personas` — returns all 8 persona cards (live + beta) sorted live-first

Sequential spawn keeps the live dashboard UX identical (SSE columns fill in one at a time) and removes a class of bugs (RPC quotas, file-locking on `events.jsonl`).

### `scripts/deploy-mock-usdg.ts`

Deploys an SPL token named "USDG-mock" on Solana devnet. Saves mint address + authority keypair to `.env.local`. Idempotent — checks for existing mint before deploying.

### `scripts/setup-treasury.ts`

Idempotent. Loads/generates the Mimix treasury keypair, ensures USDG ATA exists for treasury, prints pubkey + balances. Pre-funds via devnet SOL faucet + mints USDG to treasury on first run.

### `scripts/fund-persona-wallet.ts`

Given a `run_id` and `persona_id`:

1. Generates a fresh keypair
2. Airdrops `wallet.starting_balance_sol` SOL from devnet faucet (with retry on rate limit)
3. Mints `wallet.starting_balance_usdg` USDG-mock to the new wallet's ATA
4. Saves keypair to `runs/{run_id}/wallets/{persona_id}.json` (gitignored)

### `demo-target/` — the reference test target

A throwaway Solana devnet swap dApp with intentional UX issues for agents to find. This is the **reference** target shipped with Mimix; `/register` accepts any Solana dApp URL.

- Single-page React (Vite + `@solana/wallet-adapter-react`)
- "Connect Phantom" button (devnet) — for human visitors
- Picks up the Playwright-injected `window.phantom.solana` provider when driven by agents
- Token in/out selectors (SOL ↔ USDG-mock only)
- **Slippage input defaulting to 1%** — deliberately too high; Nora flags it
- **Confirm modal with verbose, scary signing message** — Nora abandons here
- The "Confirm Swap" action posts to a backend endpoint that uses the forked Zerion CLI to execute the swap on devnet — every swap routes through Zerion API for both human and agent flows
- All elements tagged with `data-testid="..."` for reliable Playwright selectors
- Deployed to Vercel; URL stored in `.env.local`

### Testing arbitrary dApps

The product accepts any Solana dApp URL on `/register`. For arbitrary targets, the agent runtime injects a `window.phantom.solana` stub backed by the persona's devnet keypair via `page.addInitScript()` before navigation. The target dApp's wallet adapter discovers this stub like a real Phantom installation.

The agent observes the dApp's UI for UX friction; the actual swap intent is executed by the forked Zerion CLI server-side (this keeps every agent swap on the Zerion API path the bounty requires).

Caveats documented in README: many production dApps default to mainnet and may not work on devnet without an RPC override. The reliable demo path is the reference `demo-target/`. Arbitrary-URL testing is shown as a working concept; full external-dApp coverage is a v2 roadmap item.

---

## Frontend pages

### `/` (Landing)
Hero: "Test your Solana dApp with real users on demand." Sub-headline: "Real signed onchain transactions. Real Zerion-routed execution. Real reports." Two CTAs: "Start a run" → `/register`, "Browse personas" → `/personas`.

### `/register`
Form: dApp URL (free-form — any Solana dApp), name (≤ 60 chars), brief description (≤ 280 chars), target audience tags. Stored in `localStorage` as `mimix.draft_run`. Continue → `/personas`.

A "Try the reference demo dApp" link pre-fills with the deployed `demo-target/` URL.

### `/personas`
**8-card grid marketplace.** Each card: avatar emoji (large), display_name, tagline, "Tests:" line, status badge.

- Live cards (3): selectable checkbox, hover state
- Beta cards (5): grayed out, "Beta" badge top-right, tooltip on hover ("Unlocks in v2 — join waitlist"), click shows toast and does not select
- Running total at bottom: "3 personas × $5 USDG = $15 USDG"
- Continue button disabled until ≥ 1 live persona selected. Continue → `/pay`.

### `/pay`
Shows treasury **devnet** address (copy button), required amount in USDG, QR code. "Pay with USDG (Devnet)" button connects Phantom adapter, builds SPL USDG transfer tx, signs, sends, polls for confirmation, posts signature to `/api/pay/verify`. On success → `/api/runs` → redirect to `/run/[id]`.

Debug toggle: a "Skip payment (debug)" button gated by `NEXT_PUBLIC_DEBUG_MODE=true` — used during live judging so judges don't need to fund a Phantom wallet. The demo video uses the real payment path.

### `/run/[id]`
Live dashboard. One column per selected persona (filled in sequentially as orchestrator runs them). Each column:
- Status badge (running / complete / abandoned / failed)
- Latest screenshot (auto-refreshes)
- Scrolling event log streamed via SSE — color-coded by event type (action=gray, tx=green, policy_block=orange, abandon=red, observation=purple)

Connects to `/api/runs/[id]/events` (SSE) on mount. "Generate report" button appears when all agents have terminal status. Click → `/report/[id]`.

### `/report/[id]`
Top: summary stats card — `user_ready_score`, personas run, journeys completed/abandoned, total real txs, policy violations blocked.
Per-persona sections:
- Outcome badge
- Completed steps (checklist)
- Failed step (if any)
- Observations as blockquotes in persona voice
- Tx signatures as links to `https://solscan.io/tx/{sig}?cluster=devnet`

"Export JSON" button downloads `runs/{id}/report.json`.

---

## Agent ↔ LLM contract

Each LLM turn input includes:

```json
{
  "persona": { "name": "...", "behavior": {...}, "journey_goal": "..." },
  "policy_budget": { "spent_so_far_usd": 0, "max_total_usd": 30, "session_elapsed_ms": 12000, "session_max_ms": 300000 },
  "recent_actions": [{ "action": "click", "selector": "...", "reasoning": "..." }],
  "screenshot": "<base64>"
}
```

The persona profile + journey_goal is sent as a cached static prefix (prompt caching) so cost stays low across 30 turns.

LLM output must be JSON matching:

```json
{
  "action": "click" | "type" | "sign" | "swap" | "connect_wallet" | "abandon" | "complete",
  "selector": "...",       // for click/type
  "value": "...",          // for type
  "swap_params": {...},    // for swap: { from_mint, to_mint, amount, slippage_bps }
  "reasoning": "...",      // why this action, in persona voice
  "abandon_reason": "..."  // required if action == abandon
}
```

Use Anthropic SDK's tool-use to enforce the schema.

---

## Build order

Phase 0 — Zerion devnet spike (~1 hr)
1. Fork `zeriontech/zerion-ai` into `packages/zerion-fork/`, record fork SHA
2. Run one devnet swap via the forked CLI (e.g., 0.01 SOL → USDG-mock) and confirm a devnet tx signature lands on Solscan
3. If devnet swap fails: pivot to `solana-test-validator --url mainnet-beta` mainnet-fork mode, document the switch in README

Phase 1 — foundations (~3 hrs)
4. pnpm workspace, Next.js app, Tailwind, shadcn
5. Policy engine + persona type definitions
6. Write all 3 live persona YAMLs + 5 beta stubs

Phase 2 — devnet plumbing (~2 hrs)
7. `deploy-mock-usdg.ts` + `setup-treasury.ts` + `fund-persona-wallet.ts`
8. `/api/pay/verify` against devnet USDG transfer to treasury

Phase 3 — agent runtime (~6 hrs)
9. Playwright launch + `page.addInitScript()` Phantom-stub provider injection
10. Claude Sonnet 4.6 loop with vision, tool-use, prompt caching, policy checks
11. Wire forked Zerion's `executeSwap` into the agent's swap action
12. Filesystem event log + report fragment writer

Phase 4 — demo target + UI + orchestrator (~6.5 hrs)
13. `demo-target/` devnet swap dApp w/ Zerion-routed Confirm + intentional UX issues + Vercel deploy
14. Orchestrator: sequential spawn, SSE event stream, run.json state
15. Frontend pages: landing, register (any URL), personas (8 cards), pay (devnet USDG), run dashboard SSE, report w/ Solscan devnet links

Phase 5 — polish + submission (~1.5 hrs)
16. Report generation with `user_ready_score` calculation
17. README with Zerion bounty checklist + Visa opportunistic submission + "Mainnet payment path" section
18. Record demo video showing the full flow including real devnet Solscan tx links + at least one `policy_block` event

If any phase overruns, cut scope within it before moving on. Specifically: drop Whale Walter before Degen Dan (Dan's multi-tx flow is the more impressive run); drop live screenshot in favor of action log only; use accessibility tree instead of vision if LLM costs/latency are problematic.

---

## Technical risks + fallbacks

| Risk | Severity | Fallback |
|---|---|---|
| **Zerion CLI doesn't support Solana devnet** | P0 — blocks the Zerion bounty | Mainnet-fork local validator: `solana-test-validator --url mainnet-beta --clone <jupiter-program-id> ...`. The Zerion CLI thinks it's on mainnet, hits real Jupiter routes, all txs land on the fork. Real Zerion API, no real money. Phase 0 spike determines which path. |
| Playwright `window.phantom` injection breaks on a particular dApp's wallet discovery | P1 | Fall back to the BrowserTestWalletAdapter in our `demo-target/` only; document arbitrary-URL testing as v2 |
| Concurrent agents trip devnet RPC rate limits | P2 | Spec already specifies sequential execution |
| Devnet faucet rate-limited | P2 | Pre-fund a pool of persona wallets ahead of demo, cache in `runs/_fixtures/` |
| LLM vision slow or expensive | P2 | Use `page.accessibility.snapshot()` and pass JSON tree as text |
| LLM cost overrun | P2 | $10 hard cap per run via Anthropic SDK token counting; prompt cache static persona prefix |
| Cannot deploy mock USDG in time | P3 | Make USDG a config constant; payment becomes a server-side flag toggle. Document in README |

---

## Acceptance criteria (per component)

- `packages/zerion-fork/` — `pnpm zerion-fork swap --from USDG --to SOL --amount 1 --policy ./newbie-nora.yaml` produces a Solana devnet (or mainnet-fork) tx signature visible on Solscan, with the policy enforcement code path exercised
- `packages/policy-engine/` — unit tests cover all five check types; runs in < 5ms
- `services/agent-runtime/` — spawned with `{persona_id, target_url}`, produces a complete `events.jsonl` and `report_fragment.json` with at least one real `tx` event signed by the persona keypair and routed through Zerion
- `services/orchestrator/` — `POST /api/runs` with 3 live personas creates 3 **sequential** child processes; SSE stream emits events from all 3
- `apps/web/personas` — renders all 8 cards, 5 beta cards visually disabled, selecting beta shows toast
- `apps/web/run/[id]` — three columns fill in sequentially as events arrive over SSE
- `apps/web/report/[id]` — renders summary + per-persona observations + clickable Solscan devnet tx links
- `demo-target/` — deployed Vercel URL where Phantom-on-devnet can connect, set slippage, view confirm modal, and complete a swap routed through the forked Zerion CLI

---

## Out of scope (do not build)

- Custom persona creation UI
- Wiring up beta personas (they stay stubs, including Cody)
- Auth / user accounts
- Database (filesystem only)
- Mainnet execution (devnet only for the demo; production path documented in README)
- LI.FI cross-chain bridging (Cody is a beta stub only)
- Webhook / CI integrations
- Mobile-responsive frontend (desktop only)
- Multi-tenancy
- Concurrency across runs OR across personas within a run
- Full external-dApp compatibility (any-URL is shown as a working concept; deep coverage is v2)

---

## Bounty submission checklist

### Zerion Track (primary)

- [ ] `packages/zerion-fork/` is a real fork of `zeriontech/zerion-ai` with a commit history showing the fork point
- [ ] At least one persona run produces a real signed Solana devnet (or mainnet-fork) tx signature, verifiable on Solscan, originating from the Zerion API
- [ ] At least one persona has a YAML policy that demonstrably blocks an action (visible as a `policy_block` event in the run)
- [ ] Demo video shows: builder pays USDG → agents test demo dApp → real Zerion-routed tx → policy block visible → report with Solscan links
- [ ] Public GitHub repo, MIT license
- [ ] README has "How Zerion CLI is forked" section with the fork commit SHA and file paths
- [ ] Submitted on the Zerion track of the Frontier hackathon

### Visa Frontier Track (opportunistic)

- [ ] Project submitted to **both** Colosseum portal and Superteam Earn
- [ ] **GERMANY** marked as country on the Frontier hackathon submission
- [ ] Eligibility verified per global hackathon rules before the deadline
- [ ] README has a "Mainnet payment path" section: identical flow, real USDC on Solana mainnet in production
- [ ] One-page business plan blurb in README (unit economics of agent-led dApp testing)

---

## README the agent should produce at the end

- One-paragraph product description (use the intro of this spec)
- ASCII architecture diagram
- Quickstart: `pnpm install`, env vars required (`ANTHROPIC_API_KEY`, `TREASURY_SECRET`, `USDG_MINT`, `NEXT_PUBLIC_DEBUG_MODE`), `pnpm run deploy:usdg`, `pnpm dev`
- "Persona marketplace" section listing all 8 personas with status
- "How the policy engine works" section showing one full live persona YAML
- "How Zerion CLI is forked" section pointing at `packages/zerion-fork/` with the fork commit SHA
- "Test any Solana dApp" section explaining `/register` accepts arbitrary URLs (with the `window.phantom` injection caveat for non-devnet dApps)
- "Mainnet payment path" section showing how mock USDG on devnet becomes real USDC on mainnet in production (Visa angle)
- One-paragraph business plan (Visa requirement)
- Link to deployed app, link to demo video
- Three example **devnet** tx signatures with Solscan links (one builder payment, one persona swap via Zerion, one policy block proof)
- MIT license

End of spec.
