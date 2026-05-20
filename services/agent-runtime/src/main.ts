/**
 * Agent runtime entry point. Spawned as a Node child process by the orchestrator
 * with env vars: RUN_ID, PERSONA_ID, TARGET_URL, RUN_DIR, MIMIX_ROOT.
 *
 * The runtime is sequential and self-contained per persona-run: create a
 * Zerion wallet, fund it from treasury, launch Playwright, loop on LLM
 * decisions + policy checks, execute real Zerion-routed onchain sends,
 * write a report fragment, exit.
 */
import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MIMIX_ROOT || resolve(__dirname, "../../..");
loadDotenv({ path: resolve(ROOT, ".env.local") });
loadDotenv({ path: resolve(ROOT, ".env") });
process.env.MIMIX_ROOT = ROOT;

import { loadLivePersona } from "@mimix/personas";
import { checkAction } from "@mimix/policy-engine";
import type { AgentAction, TargetKind } from "@mimix/persona-types";
import { createWallet, sendSol } from "./zerion.js";
import { fundFromTreasury } from "./funding.js";
import { EventLog } from "./events.js";
import { LlmClient, type LlmAction } from "./llm.js";
import { launchBrowser, injectPhantomStub, takeScreenshotBase64 } from "./browser.js";

// Per-persona turn budget — this is the soft cap that maps to the user's
// pricing tier ($5 USDG = TURN_BUDGET turns of agent exploration). When
// exceeded the runtime stops, asks the LLM for observations from the
// partial transcript, and writes a capped report fragment with an
// "Upgrade plan" CTA hint.
const TURN_BUDGET = parseInt(process.env.MIMIX_TURN_BUDGET || "10", 10);
const HARD_TURN_CEILING = 30;
const MAX_TURNS = Math.min(TURN_BUDGET, HARD_TURN_CEILING);
const MAX_WALL_CLOCK_MS = 10 * 60_000;
const SOL_USD_ESTIMATE = 200;

type RunOpts = {
  runId: string;
  personaId: string;
  targetUrl: string;
  runDir: string;
  targetKind: TargetKind;
  goal?: string;
};

async function run(opts: RunOpts): Promise<number> {
  mkdirSync(opts.runDir, { recursive: true });

  const persona = loadLivePersona(opts.personaId);
  const eventLog = new EventLog(opts.runDir, opts.personaId);
  eventLog.emit({ type: "action", action: "view", reasoning: "agent starting" });

  const isSolana = opts.targetKind === "solana";

  // 1. Solana targets get a funded Zerion wallet (SOL for the Zerion-routed
  // send + USDG for the balance the dApp sees). Web targets need none of this.
  let walletName = "";
  let solAddress: string | undefined;
  if (isSolana) {
    walletName = `${opts.runId}-${opts.personaId}`;
    const wallet = await createWallet(walletName);
    solAddress = wallet.solAddress;
    await fundFromTreasury(
      wallet.solAddress,
      persona.wallet.starting_balance_sol,
      persona.wallet.starting_balance_usdg,
    );
  }

  // 2. Launch browser; inject the mock Phantom only for Solana targets.
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  if (isSolana && solAddress) {
    await injectPhantomStub(page, { solAddress });
  }

  // Navigate. The Solana demo target gets ?test=1&agent= activation params;
  // a real customer URL is loaded untouched so we don't mutate their app.
  let navUrl = opts.targetUrl;
  if (isSolana) {
    const u = new URL(opts.targetUrl);
    u.searchParams.set("test", "1");
    u.searchParams.set("agent", opts.personaId);
    navUrl = u.toString();
  }
  await page.goto(navUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // 3. LLM loop
  const llm = new LlmClient(persona, opts.targetUrl, {
    targetKind: opts.targetKind,
    goal: opts.goal,
  });
  const sessionStart = Date.now();
  let spentSoFar = 0;
  let lastBlock: string | undefined;
  let outcome: "completed" | "abandoned" | "failed" = "failed";
  let abandonReason: string | undefined;
  const completedSteps: string[] = [];
  let failedStep: string | undefined;
  const txSignatures: string[] = [];
  const recentActions: { action: string; selector?: string; reasoning?: string }[] = [];
  let turnsUsed = 0;
  let capped = false;

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    turnsUsed = turn;
    const elapsed = Date.now() - sessionStart;
    if (elapsed > MAX_WALL_CLOCK_MS) {
      eventLog.emit({ type: "error", message: "wall_clock_exceeded" });
      failedStep = "wall_clock";
      break;
    }

    const shotPath = eventLog.screenshotPath(turn);
    let shotB64: string;
    try {
      shotB64 = await takeScreenshotBase64(page, shotPath);
      eventLog.emit({ type: "screenshot", path: shotPath });
    } catch (err) {
      eventLog.emit({ type: "error", message: `screenshot_failed: ${(err as Error).message}` });
      failedStep = "screenshot";
      break;
    }

    let llmAction: LlmAction;
    try {
      llmAction = await llm.nextAction({
        screenshotBase64: shotB64,
        recentActions: recentActions.slice(-5),
        policyBudget: {
          spent_so_far_usd: spentSoFar,
          max_total_usd: persona.policy.max_total_spend_usd,
          session_elapsed_ms: elapsed,
          session_max_ms: persona.policy.session_duration_min * 60_000,
        },
        lastBlock,
      });
    } catch (err) {
      eventLog.emit({ type: "error", message: `llm_error: ${(err as Error).message}` });
      failedStep = "llm";
      break;
    }
    lastBlock = undefined;

    // Build the typed AgentAction for the policy check
    const typedAction = toAgentAction(llmAction);

    const policyResult = checkAction(persona.policy, typedAction, {
      spentSoFar,
      sessionElapsedMs: elapsed,
      chain: "solana-devnet",
    });
    if (!policyResult.allowed) {
      eventLog.emit({
        type: "policy_block",
        attempted: llmAction.type,
        reason: policyResult.reason,
      });
      lastBlock = policyResult.reason;
      recentActions.push({ action: `BLOCKED:${llmAction.type}`, reasoning: policyResult.reason });
      continue;
    }

    // Execute
    if (llmAction.type === "abandon") {
      eventLog.emit({ type: "abandon", reason: llmAction.abandon_reason, step: completedSteps.at(-1) });
      outcome = "abandoned";
      abandonReason = llmAction.abandon_reason;
      break;
    }
    if (llmAction.type === "complete") {
      eventLog.emit({ type: "complete" });
      outcome = "completed";
      break;
    }
    if (llmAction.type === "send") {
      if (!isSolana) {
        eventLog.emit({
          type: "policy_block",
          attempted: "send",
          reason: "send_unavailable_for_web_target",
        });
        lastBlock = "send is unavailable — this run is testing a web app, not a wallet flow";
        recentActions.push({ action: "BLOCKED:send", reasoning: "no wallet on a web target" });
        continue;
      }
      try {
        const sendRes = await sendSol({
          walletName,
          to: llmAction.send_to,
          amountSol: llmAction.send_amount_sol,
        });
        spentSoFar += llmAction.send_amount_sol * SOL_USD_ESTIMATE;
        txSignatures.push(sendRes.signature);
        eventLog.emit({
          type: "tx",
          chain: "solana-devnet",
          signature: sendRes.signature,
          via: "zerion-cli",
          result: sendRes.status,
        });
        completedSteps.push("send");
        recentActions.push({ action: "send", reasoning: llmAction.reasoning });
      } catch (err) {
        eventLog.emit({ type: "error", message: `zerion_send_failed: ${(err as Error).message}` });
        failedStep = "send";
        recentActions.push({ action: "send_failed", reasoning: (err as Error).message });
      }
      continue;
    }

    // click / type / view / connect_wallet / sign
    if (llmAction.type === "click" || llmAction.type === "connect_wallet" || llmAction.type === "sign") {
      const selector = (llmAction as any).selector;
      if (selector) {
        try {
          await page.locator(selector).first().click({ timeout: 5000 });
          completedSteps.push(`click:${selector}`);
        } catch (err) {
          eventLog.emit({ type: "error", message: `click_failed:${selector}` });
          recentActions.push({ action: "click_failed", selector, reasoning: llmAction.reasoning });
          continue;
        }
      }
    } else if (llmAction.type === "type") {
      try {
        await page.locator(llmAction.selector).first().fill(llmAction.value, { timeout: 5000 });
        completedSteps.push(`type:${llmAction.selector}`);
      } catch (err) {
        eventLog.emit({ type: "error", message: `type_failed:${llmAction.selector}` });
        recentActions.push({ action: "type_failed", selector: llmAction.selector, reasoning: llmAction.reasoning });
        continue;
      }
    }

    eventLog.emit({
      type: "action",
      action: llmAction.type as any,
      selector: (llmAction as any).selector,
      reasoning: llmAction.reasoning,
    });
    recentActions.push({
      action: llmAction.type,
      selector: (llmAction as any).selector,
      reasoning: llmAction.reasoning,
    });
  }

  // Detect cap: loop completed all MAX_TURNS iterations without the
  // outcome being explicitly set to completed/abandoned.
  if (outcome === "failed" && !failedStep && turnsUsed >= MAX_TURNS) {
    capped = true;
    eventLog.emit({
      type: "budget_exceeded",
      turns_used: turnsUsed,
      suggested_tier: "pro",
    });
  }

  // 4. Wrap up — ask LLM for observations
  let observations: string[] = [];
  let wrapUpError: string | undefined;
  try {
    const transcript = recentActions.map((a, i) => `${i + 1}. ${a.action}: ${a.reasoning || ""}`).join("\n");
    observations = await llm.askObservations(transcript);
    for (const obs of observations) {
      eventLog.emit({ type: "observation", text: obs });
    }
  } catch (err) {
    wrapUpError = (err as Error).message;
    eventLog.emit({ type: "error", message: `observations_failed: ${wrapUpError}` });
  }

  await browser.close();

  eventLog.writeReportFragment({
    persona: opts.personaId,
    outcome,
    abandon_reason: abandonReason,
    completed_steps: completedSteps,
    failed_step: failedStep,
    observations,
    wrap_up_error: wrapUpError,
    tx_signatures: txSignatures,
    capped,
    turns_used: turnsUsed,
    turn_budget: MAX_TURNS,
    llm_usage: {
      input_tokens: llm.totalInputTokens,
      output_tokens: llm.totalOutputTokens,
      cached_tokens: llm.totalCachedTokens,
    },
  });

  return outcome === "completed" ? 0 : 0; // both exit 0; orchestrator reads outcome from fragment
}

function toAgentAction(a: LlmAction): AgentAction {
  switch (a.type) {
    case "click": return { type: "click", selector: a.selector, reasoning: a.reasoning };
    case "type": return { type: "type", selector: a.selector, value: a.value, reasoning: a.reasoning };
    case "send": return { type: "send", amount_sol: a.send_amount_sol, to: a.send_to, estimated_usd: a.send_amount_sol * SOL_USD_ESTIMATE, reasoning: a.reasoning };
    case "view": return { type: "view" };
    case "connect_wallet": return { type: "connect_wallet", reasoning: a.reasoning };
    case "sign": return { type: "sign", reasoning: a.reasoning };
    case "abandon": return { type: "abandon", reason: a.abandon_reason };
    case "complete": return { type: "complete", reasoning: a.reasoning };
  }
}

// Entry point — read env, run.
const opts: RunOpts = {
  runId: process.env.RUN_ID || `dev-${Date.now()}`,
  personaId: process.env.PERSONA_ID || "newbie-nora",
  targetUrl: process.env.TARGET_URL || "https://demo-target.vercel.app/?test=1",
  runDir: process.env.RUN_DIR || resolve(ROOT, "runs", process.env.RUN_ID || `dev-${Date.now()}`),
  // Standalone-dev fallback is the Solana demo target; the orchestrator always
  // sets TARGET_KIND explicitly for real runs.
  targetKind: process.env.TARGET_KIND === "web" ? "web" : "solana",
  goal: process.env.MIMIX_GOAL || undefined,
};

run(opts).then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
