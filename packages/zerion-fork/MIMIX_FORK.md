# Mimix fork of zerion-ai

This directory is a fork of [zeriontech/zerion-ai](https://github.com/zeriontech/zerion-ai), required by the Zerion Frontier hackathon track.

**Upstream HEAD at fork time:** `a0518ca5f92d7da50beb7fb9801efd82d8ac30e4` (cloned 2026-05-12)

## Modifications

All Mimix-specific changes are clearly marked with a `Mimix fork:` comment.

### 1. `cli/utils/common/prompt.js` — `MIMIX_PASSPHRASE` env-var bypass

The upstream CLI requires an interactive TTY for passphrase entry. Mimix's agent runtime is non-interactive (Node child process spawned by the orchestrator) and persona wallets are ephemeral (created and destroyed per run). We added an env-var bypass for `readPassphrase` so the runtime can drive the CLI programmatically.

### 2. `cli/commands/wallet/create.js` — skip backup acknowledgement under env-var auth

When the passphrase is supplied via `MIMIX_PASSPHRASE`, the "Type YES to confirm" backup acknowledgement is skipped. The operator already managed the secret out-of-band; the interactive guard rail does not apply.

## Verified working

Phase 0 spike of 2026-05-12 produced a real signed onchain transaction on Solana devnet using this fork:

- Tx: `3dsvt9f5unUtaMqPVDkUNKCWZtjDiFAmYftSbDGZd59HD5bTm126huDKEeWvWtVtov6zo7kamM1kyrUGozsWVCu5`
- Solscan: https://solscan.io/tx/3dsvt9f5unUtaMqPVDkUNKCWZtjDiFAmYftSbDGZd59HD5bTm126huDKEeWvWtVtov6zo7kamM1kyrUGozsWVCu5?cluster=devnet

Command used:

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com \
  MIMIX_PASSPHRASE=*** \
  node cli/zerion.js send SOL 0.01 --to <addr> --chain solana --wallet mimix-test
```

## Devnet capabilities

| Operation | Devnet works? | Notes |
|---|---|---|
| `wallet create` | ✓ | Local OWS-encrypted keystore, no Zerion API |
| `agent create-token` | ✓ | Local, no Zerion API |
| `send SOL` | ✓ | Pure RPC call, honors `SOLANA_RPC_URL` |
| `send <SPL token>` | ✗ | Upstream limitation: Solana send only supports native SOL |
| `swap solana` | ✗ | Requires Zerion API (mainnet-only) |
| `bridge` | ✗ | Same Zerion-API constraint as swap |

Mimix's agent action is therefore `send SOL` on devnet — a real signed onchain transaction routed through the forked Zerion CLI's execution pipeline. The Zerion bounty's requirement "at least one real onchain transaction" is satisfied; the "all swaps must route through Zerion API" sub-clause is vacuously satisfied (we do not perform swaps).
