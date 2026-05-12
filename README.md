<p align="center">
  <img src="./assets/logo-mark.png" alt="Mimix" width="160" />
</p>

# Mimix

Hire AI personas to test your Solana dApp. They browse it, sign real transactions, and tell you what they hated.

---

## Quickstart

Requires Node ≥ 20, pnpm 10, and the Solana CLI (used once to airdrop the treasury).

```bash
pnpm install
pnpm exec playwright install chromium

# 1. Create an empty treasury keypair (writes ./treasury-keypair.json).
pnpm setup:treasury

# 2. Airdrop devnet SOL to the treasury address printed above.
solana airdrop 2 <treasury-pubkey> --url https://api.devnet.solana.com

# 3. Deploy a mock USDG SPL token (idempotent — writes USDG_MINT to .env.local).
pnpm deploy:usdg

# 4. (Optional) Add your Anthropic key for real LLM-driven personas.
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local

# 5. Run the app and the reference target dApp in two terminals.
pnpm dev               # Next.js on :3000
pnpm dev:target        # reference target on :3001
```

Open <http://localhost:3000> → **Start a run** → pick at least one live persona → **Skip payment (debug)** or pay with Phantom on devnet → watch the live dashboard → **Generate report**.

Without `ANTHROPIC_API_KEY`, Mimix runs in scripted demo mode: every persona still produces a real onchain devnet transaction via the forked Zerion CLI, but their action sequence and observations come from hand-authored fixtures. Adding the key flips the same code path to real Claude Sonnet 4.5 inference.

---

## How it works

```
            ┌────────────────────────────────────────────┐
            │             apps/web (Next.js)             │
            │  /register  /personas  /pay  /run  /report │
            │                                            │
            │  POST /api/runs ───┐                       │
            │  GET  /api/runs/:id/events (SSE) ──┐       │
            └────────────────────────────────────┼───────┘
                                 │               │
                                 ▼               │
                  ┌──────────────────────────┐   │
                  │  services/orchestrator   │   │
                  │  sequential child spawn  │   │
                  └────────┬─────────────────┘   │
                           │ spawn(tsx)          │
                           ▼                     │
            ┌──────────────────────────────────┐ │
            │   services/agent-runtime         │ │
            │   ┌─────────────────────────┐    │ │
            │   │ Playwright headless     │    │ │
            │   │  + window.phantom stub  │    │ │
            │   ├─────────────────────────┤    │ │
            │   │ Claude Sonnet 4.5       │    │ │
            │   │  vision + tool-use      │    │ │
            │   │  + prompt caching       │    │ │
            │   ├─────────────────────────┤    │ │
            │   │ @mimix/policy-engine    │    │ │
            │   ├─────────────────────────┤    │ │
            │   │ packages/zerion-fork    │────┼─┼──> Solana devnet
            │   │   (zerion-ai fork)      │    │ │    real signed tx
            │   └─────────────────────────┘    │ │
            │   writes events.jsonl ───────────┼─┘
            └──────────────────────────────────┘
                           │
                           ▼
                  demo-target/ (Vite + React)
                  SOL payment UI with intentional UX friction
```

The orchestrator spawns one agent process per persona, sequentially. Each agent gets its own Zerion-managed devnet wallet (funded from the treasury at run-start), navigates the target dApp with Playwright, decides actions with Claude (or scripted fixtures), and routes its onchain leg through the forked Zerion CLI. Events stream to `runs/{id}/events.jsonl`; the UI tails it over SSE.

---

## Personas

| ID | Avatar | Status | Tests |
|---|---|---|---|
| `newbie-nora` | 🐣 | live | Onboarding friction, signing UX, default amounts, confirmation modals |
| `whale-walter` | 🐋 | live | Large-amount warnings, signature clarity, execution quality |
| `degen-dan` | 🐺 | live | Multi-tx flow, repeat actions, error recovery, rapid signing |
| `cross-chain-cody` | 🌉 | beta | LI.FI bridge UX (v2) |
| `mobile-maya` | 📱 | beta | Responsive layout, mobile wallet adapter (v2) |
| `stablecoin-sam` | 💵 | beta | Recurring payments, USDC/USDG pair UX (v2) |
| `paranoid-pat` | 🕵️ | beta | Security warnings, simulation, signature clarity (v2) |
| `yield-hunter-yuki` | 🌾 | beta | APY display, lock-up clarity, claim flows (v2) |

Each live persona has a YAML in `packages/personas/live/` with a `wallet`, `policy`, `behavior`, and `journey_goal`. Beta personas are stubs — `/api/runs` rejects them with 400.

---

## Policy engine

Every agent action passes through a pure-function gate:

```ts
function checkAction(
  policy: PersonaPolicy,
  action: AgentAction,
  context: { spentSoFar: number; sessionElapsedMs: number; chain: string },
): { allowed: true } | { allowed: false; reason: string }
```

Five checks per call: chain ∈ `allowed_chains`, action type ∈ `allowed_actions` and ∉ `forbidden_actions`, per-tx spend ≤ `max_spend_per_tx_usd`, cumulative spend ≤ `max_total_spend_usd`, session elapsed < `session_duration_min`. Blocked actions emit a `policy_block` event and the runtime asks the LLM for an alternative.

Example — Newbie Nora's policy (`packages/personas/live/newbie-nora.yaml`):

```yaml
policy:
  max_spend_per_tx_usd: 2
  max_total_spend_usd: 4
  allowed_actions: [view, click, type, connect_wallet, sign, send, abandon, complete]
  forbidden_actions: [stake, leverage, lend, bridge, approve_unlimited]
  allowed_chains: [solana-devnet]
  session_duration_min: 5
```

---

## Zerion CLI fork

`packages/zerion-fork/` is a fork of [`zeriontech/zerion-ai`](https://github.com/zeriontech/zerion-ai) at upstream commit `a0518ca5f92d7da50beb7fb9801efd82d8ac30e4`. Two small modifications (recorded in `packages/zerion-fork/MIMIX_FORK.md`):

1. `cli/utils/common/prompt.js` — honor `MIMIX_PASSPHRASE` when stdin is not a TTY, so the agent runtime can drive the CLI non-interactively.
2. `cli/commands/wallet/create.js` — skip the "Type YES to confirm" backup prompt when the passphrase came from the env.

Every persona's onchain SOL transfer is built, signed via the upstream `@open-wallet-standard/core` keystore, and broadcast by this fork. `SOLANA_RPC_URL` is honored upstream (`cli/utils/chain/registry.js:67`) so the same fork serves devnet or mainnet without code changes.

```
agent decides "send 0.005 SOL"
   ↓
node packages/zerion-fork/cli/zerion.js send SOL 0.005 --to <addr> --chain solana --wallet <ephemeral>
   ↓
forked CLI builds SystemProgram.transfer → OWS signs with persona keypair → broadcasts to SOLANA_RPC_URL
   ↓
parse signature from stdout JSON → emit { type: "tx", via: "zerion-cli" } to events.jsonl
```

---

## Testing any Solana dApp

`/register` accepts any URL. The agent runtime injects a `window.phantom.solana` stub via Playwright's `addInitScript` so the target dApp's wallet adapter discovers the persona's pubkey as if Phantom were installed. The agent navigates the dApp normally; the real onchain action happens out-of-band through the forked Zerion CLI.

Most production Solana dApps default to mainnet and may refuse a devnet wallet. The reliable demo path is the bundled `demo-target/`. Full arbitrary-URL coverage is a v2 roadmap item.

---

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Optional | Enables real Claude Sonnet 4.5 mode. Without it, scripted fixtures drive the agents. |
| `SOLANA_RPC_URL` | Optional | Defaults to `https://api.devnet.solana.com`. |
| `TREASURY_KEYPAIR_PATH` | Yes | JSON secret-key file. Gitignored. Written by `pnpm setup:treasury`. |
| `TREASURY_PUBKEY` | Auto | Written to `.env.local` by `pnpm setup:treasury`. |
| `USDG_MINT` | Auto | Written to `.env.local` by `pnpm deploy:usdg`. |
| `MIMIX_PASSPHRASE` | Yes | Passphrase for the OWS-encrypted persona keystore inside the forked CLI. |
| `MIMIX_TURN_BUDGET` | Optional | Per-persona turn cap (default `10`). Personas that exceed it land in `capped` status with an "Upgrade plan" CTA. |
| `NEXT_PUBLIC_DEBUG_MODE` | Optional | When `true`, exposes a "Skip payment (debug)" button on `/pay`. |
| `MIMIX_FAKE_LLM` | Optional | Force scripted mode even when `ANTHROPIC_API_KEY` is set. |

---

## Example transactions (Solana devnet)

| What | Tx |
|---|---|
| First Zerion CLI send | [`3dsvt9f5…VCu5`](https://solscan.io/tx/3dsvt9f5unUtaMqPVDkUNKCWZtjDiFAmYftSbDGZd59HD5bTm126huDKEeWvWtVtov6zo7kamM1kyrUGozsWVCu5?cluster=devnet) |
| Funding transfer — treasury → persona | [`65XgJwmp…1KS7`](https://solscan.io/tx/65XgJwmpfC4YVT1PTug11DSCh94k7vTFqMuKYHxzu58zNmE6XYEk6UjYr3K3e1kpmiYZYhbiZZcrNqL8YHqN1KS7?cluster=devnet) |
| End-to-end UI run — Nora persona send | [`5VtUHx21…tRLgu`](https://solscan.io/tx/5VtUHx21UwCGBpqT9pYkneqNEdgesawoCSLBgSgaQyaA4famqhGo3r39x4rTE4xbWXfRea5feGyAhHjaxL6tRLgu?cluster=devnet) |

All signed by an ephemeral persona keypair created by the forked Zerion CLI and funded from the operator treasury (`373pSVQQq4jfyYJ7hUmMrbkzHKSxcdJ8wg7dzSYQPJtC`). USDG-mock SPL mint: `7NfA9TQgb5RLEAiPHxgR9tQ97gtJ47Vfkc1CYVkMxZW2`.

---

Built with [Claude Code](https://claude.com/claude-code). MIT — see `LICENSE`.
