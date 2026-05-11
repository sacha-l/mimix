# Mimix

> A marketplace of autonomous onchain agent-personas that test Solana dApps like real users. Builders register any Solana dApp URL, pick personas, pay in mock USDG on devnet, and Mimix spawns agents — each with its own funded devnet wallet, scoped policy, and behavior profile — that navigate the target dApp in a headless browser and execute real signed onchain transactions through a forked Zerion CLI. The output is a structured UX report with verifiable Solscan links.

Built for the Frontier hackathon — Zerion Track (primary) and Visa Frontier / Superteam Germany Track (opportunistic).

---

## Architecture

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

The agent observes the dApp's UI through screenshots and tool-use structured output. Its *onchain* action — the SOL transfer — always goes through the forked Zerion CLI, regardless of what the target dApp itself does. This is what satisfies the Zerion bounty's "execute at least one real onchain transaction" requirement.

---

## Quickstart

Prerequisites: Node ≥ 20, pnpm 10, the Solana CLI (only used to airdrop the treasury), and an Anthropic API key.

```bash
pnpm install
pnpm exec playwright install chromium

# 1. Set up an empty treasury keypair (~/.config/...)
pnpm setup:treasury
# → outputs the treasury pubkey

# 2. Airdrop devnet SOL to the treasury (one-time)
solana airdrop 2 <treasury-pubkey> --url https://api.devnet.solana.com

# 3. Deploy the mock USDG SPL token (idempotent)
pnpm deploy:usdg
# → writes USDG_MINT + TREASURY_PUBKEY to .env.local

# 4. Add your Anthropic key to .env.local
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local

# 5. Run everything
pnpm dev               # Next.js on :3000
# In another terminal:
cd demo-target && pnpm dev   # reference target on :3001
```

Open http://localhost:3000 → Start a run → pick at least one live persona → Skip payment (debug) → watch agents work the demo target → Generate report.

Without `ANTHROPIC_API_KEY`, Mimix automatically runs in scripted-LLM mode — the pipeline still spawns Playwright + executes a real Zerion-routed devnet SOL transfer, but the action sequence is deterministic instead of persona-driven. Add the key to unlock real exploration.

### Env vars

| Var | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (for persona-driven mode) | Claude Sonnet 4.5 inference; scripted fallback otherwise |
| `SOLANA_RPC_URL` | Yes | Defaults to `https://api.devnet.solana.com` |
| `TREASURY_KEYPAIR_PATH` | Yes | Path to a JSON secret-key file; gitignored |
| `TREASURY_PUBKEY` | Auto-set | Written by `pnpm setup:treasury` |
| `USDG_MINT` | Auto-set | Written by `pnpm deploy:usdg` |
| `MIMIX_PASSPHRASE` | Yes | Passphrase for the OWS-encrypted persona keystore inside the forked CLI |
| `NEXT_PUBLIC_DEBUG_MODE` | Optional | When `true`, exposes "Skip payment" on `/pay` for live judging |
| `MIMIX_FAKE_LLM` | Optional | Force scripted mode even when an Anthropic key is present |

---

## Persona marketplace

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

Each live persona has a YAML in `packages/personas/live/` with a `wallet`, `policy`, `behavior`, and `journey_goal`. The orchestrator rejects beta personas at `POST /api/runs` with a 400.

## How the policy engine works

`@mimix/policy-engine` exports a pure function that gates every agent action:

```ts
function checkAction(
  policy: PersonaPolicy,
  action: AgentAction,
  context: { spentSoFar: number; sessionElapsedMs: number; chain: string },
): { allowed: true } | { allowed: false; reason: string }
```

Five gates per call: chain ∈ `allowed_chains`, action type ∈ `allowed_actions` and ∉ `forbidden_actions`, per-tx spend ≤ `max_spend_per_tx_usd`, cumulative spend ≤ `max_total_spend_usd`, session elapsed < `session_duration_min`. Blocked actions emit a `policy_block` event with the reason and the runtime re-prompts the LLM for an alternative.

Example: Newbie Nora's policy (`packages/personas/live/newbie-nora.yaml`):

```yaml
policy:
  max_spend_per_tx_usd: 2
  max_total_spend_usd: 4
  allowed_actions: [view, click, type, connect_wallet, sign, send, abandon, complete]
  forbidden_actions: [stake, leverage, lend, bridge, approve_unlimited]
  allowed_chains: [solana-devnet]
  session_duration_min: 5
```

10/10 unit tests in `packages/policy-engine/src/index.test.ts`.

## How Zerion CLI is forked

`packages/zerion-fork/` is a real fork of [`zeriontech/zerion-ai`](https://github.com/zeriontech/zerion-ai) at upstream commit **`a0518ca5f92d7da50beb7fb9801efd82d8ac30e4`** (2026-05-12).

Mimix-specific modifications (see `packages/zerion-fork/MIMIX_FORK.md` for the full record):

1. `cli/utils/common/prompt.js` — honor `MIMIX_PASSPHRASE` env var when stdin is not a TTY, so the agent runtime can drive the CLI non-interactively.
2. `cli/commands/wallet/create.js` — skip the YES-confirmation backup prompt when the passphrase came from the env, since the operator already managed the secret out-of-band.

Every persona's onchain SOL transfer is built, signed (via the upstream `@open-wallet-standard/core` keystore), and broadcast to devnet by this fork. The agent runtime never touches raw key material — only Zerion CLI does. `SOLANA_RPC_URL` is honored upstream (`cli/utils/chain/registry.js:67`) so the same fork serves mainnet, devnet, or any other RPC.

```
agent decides "send 0.005 SOL"
   ↓
spawn(node packages/zerion-fork/cli/zerion.js send SOL 0.005 --to <addr> --chain solana --wallet <ephemeral>)
   ↓
forked CLI builds the SystemProgram.transfer tx → OWS signs with persona keypair → broadcasts to SOLANA_RPC_URL
   ↓
parse signature from stdout JSON → emit { type: "tx", via: "zerion-cli" } to events.jsonl
```

The Zerion `swap` and SPL `send` pathways require the Zerion API which is mainnet-only. Mimix uses native SOL transfers for its agent action, which exercises the same wallet + execution layer the swap pathway uses. The bounty's "all swaps must route through the Zerion API" sub-clause is vacuously satisfied — Mimix does not perform swaps.

## Test any Solana dApp

`/register` accepts any URL. The agent runtime injects a `window.phantom.solana` provider stub via Playwright's `addInitScript` before navigation, so the target dApp's wallet adapter discovers the persona's pubkey like a real Phantom install. The agent navigates the dApp's UI normally; the real onchain leg happens out-of-band via the forked Zerion CLI.

Caveat: many production dApps default to mainnet and may refuse devnet. The reliable demo path is the reference `demo-target/`. Full arbitrary-URL coverage is a v2 roadmap item.

## Mainnet payment path (Visa Frontier angle)

The demo settles in mock USDG on Solana devnet so judges don't need to fund a real wallet to walk the flow. In production the same path settles in real USDC on Solana mainnet — flip three constants:

- `SOLANA_RPC_URL=https://api.mainnet-beta.solana.com`
- `USDG_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (real USDC)
- Skip the `pnpm deploy:usdg` step

The frontend, payment-verify route, treasury accounting, and per-test billing logic are unchanged. The product is a B2B stablecoin payment use case (per-test SaaS settled onchain): the builder's `connect Phantom → send N USDC → start run` path is what we'd ship to mainnet on day one.

## Business plan (one paragraph)

Solana builders pay for human QA today (Discord bug-bounty hunters, $50-$200/run usability sessions). Mimix replaces that with persona agents that complete a test run for $5 of stablecoin per persona, sub-five-minutes, and produce a structured report with verifiable Solscan links so the builder can re-run regressions. Initial customers are early-stage Solana dApp founders shipping payment flows, wallet integrations, and stake/unstake UX. Margin scales with LLM cost compression (mostly via prompt caching of the static persona prefix) and persona breadth — every new persona is a YAML file plus a behavior profile, not a fresh agent stack.

---

## Verified onchain transactions on Solana devnet

| What | Tx |
|---|---|
| Phase 0 spike — first Zerion-routed send | [`3dsvt9f5...VCu5`](https://solscan.io/tx/3dsvt9f5unUtaMqPVDkUNKCWZtjDiFAmYftSbDGZd59HD5bTm126huDKEeWvWtVtov6zo7kamM1kyrUGozsWVCu5?cluster=devnet) |
| Agent-runtime smoke — wallet→treasury via Zerion | [`65XgJwmp...1KS7`](https://solscan.io/tx/65XgJwmpfC4YVT1PTug11DSCh94k7vTFqMuKYHxzu58zNmE6XYEk6UjYr3K3e1kpmiYZYhbiZZcrNqL8YHqN1KS7?cluster=devnet) |
| End-to-end UI flow — Nora-driven persona send | [`5VtUHx21...tRLgu`](https://solscan.io/tx/5VtUHx21UwCGBpqT9pYkneqNEdgesawoCSLBgSgaQyaA4famqhGo3r39x4rTE4xbWXfRea5feGyAhHjaxL6tRLgu?cluster=devnet) |

All three were signed by an ephemeral persona keypair created by the forked Zerion CLI, funded from the operator treasury (`373pSVQQq4jfyYJ7hUmMrbkzHKSxcdJ8wg7dzSYQPJtC`), and submitted to devnet via `SOLANA_RPC_URL`. USDG-mock SPL mint: `7NfA9TQgb5RLEAiPHxgR9tQ97gtJ47Vfkc1CYVkMxZW2`.

## Bounty submission checklist

### Zerion Track

- [x] `packages/zerion-fork/` is a real fork of `zeriontech/zerion-ai` (fork SHA `a0518ca5`)
- [x] Agent runs produce real signed Solana devnet tx signatures originating from the forked Zerion CLI
- [x] Per-persona scoped policy (`packages/personas/live/*.yaml`) enforced by `@mimix/policy-engine`; blocks emit `policy_block` events
- [x] Open source on GitHub, MIT license
- [x] README documents the fork commit, file paths of the modifications, and the live tx signatures
- [ ] Demo video — record `pnpm dev` flow showing register → personas → pay-skip → run dashboard → report with Solscan links

### Visa Frontier Track (Superteam Germany)

- [ ] Submit to Colosseum portal AND Superteam Earn
- [ ] Mark **GERMANY** as country on the Frontier submission
- [x] "Mainnet payment path" section above documents the production stablecoin flow
- [x] Business-plan paragraph included

---

## Acknowledgements

Architectural planning and implementation pairing done with [Claude Code](https://claude.com/claude-code) (Anthropic Opus 4.7, 1M-context). The forked CLI's onchain primitives are upstream Zerion code; Mimix's contribution is the agent loop, policy engine, persona library, orchestrator, and Next.js front end.

## License

MIT. See `LICENSE`.
