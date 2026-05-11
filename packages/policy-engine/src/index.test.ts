import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAction } from "./index.js";
import type { PersonaPolicy, PolicyCheckContext, AgentAction } from "@mimix/persona-types";

const basePolicy: PersonaPolicy = {
  max_spend_per_tx_usd: 5,
  max_total_spend_usd: 10,
  allowed_actions: ["view", "click", "type", "connect_wallet", "sign", "send", "abandon", "complete"],
  forbidden_actions: ["stake", "leverage", "approve_unlimited"],
  allowed_chains: ["solana-devnet"],
  session_duration_min: 5,
};

const ctx = (overrides: Partial<PolicyCheckContext> = {}): PolicyCheckContext => ({
  spentSoFar: 0,
  sessionElapsedMs: 0,
  chain: "solana-devnet",
  ...overrides,
});

test("allows action in allowlist on allowed chain within budget", () => {
  const action: AgentAction = { type: "click", selector: "button" };
  assert.deepEqual(checkAction(basePolicy, action, ctx()), { allowed: true });
});

test("blocks action in forbidden list (even if it would also be in allowlist)", () => {
  const policy = { ...basePolicy, forbidden_actions: ["click"] };
  const result = checkAction(policy, { type: "click", selector: "x" }, ctx());
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.match(result.reason, /forbidden_action:click/);
});

test("blocks action not in allowlist", () => {
  const policy = { ...basePolicy, allowed_actions: ["view"] };
  const result = checkAction(policy, { type: "click", selector: "x" }, ctx());
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.match(result.reason, /action_not_in_allowlist:click/);
});

test("blocks send when amount exceeds per-tx cap", () => {
  const action: AgentAction = { type: "send", amount_sol: 1, to: "addr", estimated_usd: 7 };
  const result = checkAction(basePolicy, action, ctx());
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.match(result.reason, /spend_per_tx_exceeded/);
});

test("blocks send when cumulative spend exceeds total cap", () => {
  const action: AgentAction = { type: "send", amount_sol: 1, to: "addr", estimated_usd: 4 };
  const result = checkAction(basePolicy, action, ctx({ spentSoFar: 7 }));
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.match(result.reason, /total_spend_exceeded/);
});

test("allows send within both caps", () => {
  const action: AgentAction = { type: "send", amount_sol: 0.01, to: "addr", estimated_usd: 2 };
  assert.deepEqual(checkAction(basePolicy, action, ctx({ spentSoFar: 3 })), { allowed: true });
});

test("blocks action on chain not in allowed_chains", () => {
  const action: AgentAction = { type: "click", selector: "x" };
  const result = checkAction(basePolicy, action, ctx({ chain: "ethereum" }));
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.match(result.reason, /chain_not_allowed:ethereum/);
});

test("blocks any action once session duration exceeded", () => {
  const action: AgentAction = { type: "view" };
  const result = checkAction(basePolicy, action, ctx({ sessionElapsedMs: 6 * 60_000 }));
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.reason, "session_duration_exceeded");
});

test("non-send actions are not gated by spend caps", () => {
  const action: AgentAction = { type: "view" };
  assert.deepEqual(
    checkAction(basePolicy, action, ctx({ spentSoFar: 999 })),
    { allowed: true },
  );
});

test("abandon and complete are checked against allowlist normally", () => {
  const policy = { ...basePolicy, allowed_actions: ["click"] };
  const result = checkAction(policy, { type: "abandon", reason: "x" }, ctx());
  assert.equal(result.allowed, false);
});
