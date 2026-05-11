import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listAllCards,
  listBetaPersonas,
  listLivePersonas,
  loadLivePersona,
  loadPersona,
} from "./index.js";

test("lists exactly 3 live personas", () => {
  const live = listLivePersonas().sort();
  assert.deepEqual(live, ["degen-dan", "newbie-nora", "whale-walter"]);
});

test("lists exactly 5 beta personas", () => {
  const beta = listBetaPersonas().sort();
  assert.deepEqual(beta, [
    "cross-chain-cody",
    "mobile-maya",
    "paranoid-pat",
    "stablecoin-sam",
    "yield-hunter-yuki",
  ]);
});

test("loadLivePersona returns full schema for a live one", () => {
  const nora = loadLivePersona("newbie-nora");
  assert.equal(nora.status, "live");
  assert.equal(nora.wallet.network, "devnet");
  assert.equal(nora.wallet.chain, "solana");
  assert.ok(nora.policy.max_spend_per_tx_usd > 0);
  assert.ok(nora.policy.allowed_actions.includes("send"));
  assert.ok(nora.policy.forbidden_actions.includes("bridge"));
  assert.ok(nora.journey_goal.length > 50);
});

test("loadLivePersona throws for a beta id", () => {
  assert.throws(() => loadLivePersona("mobile-maya"));
});

test("loadPersona works for beta cards (card-only fields)", () => {
  const maya = loadPersona("mobile-maya");
  assert.equal(maya.status, "beta");
  assert.equal(maya.id, "mobile-maya");
  assert.equal(maya.price_usdg, 5);
});

test("listAllCards returns 8 cards", () => {
  const cards = listAllCards();
  assert.equal(cards.length, 8);
  const live = cards.filter((c) => c.status === "live").length;
  const beta = cards.filter((c) => c.status === "beta").length;
  assert.equal(live, 3);
  assert.equal(beta, 5);
});
