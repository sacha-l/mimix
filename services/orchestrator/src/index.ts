import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import type { RunState, TargetKind } from "@mimix/persona-types";
import { recordRunForUser } from "./users";
import { sendRunStartedEmail, sendReportReadyEmail } from "./email";
import { isSignatureConsumed, consumeSignature } from "./payments";
import { writeFileAtomic } from "./fs-atomic";

export { registerUser, getUser, recordRunForUser } from "./users";
export type { UserRecord, Questionnaire } from "./users";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MIMIX_ROOT || resolve(__dirname, "../../..");

export type CreateRunInput = {
  targetUrl: string;
  targetName: string;
  targetDescription: string;
  targetKind?: TargetKind;
  personas: string[];
  paymentSignature: string;
  paymentVerified: boolean;
  requesterEmail?: string;
  goal?: string;
};

export type CreateRunResult = {
  runId: string;
  runDir: string;
  /** Token the client must present to read this run. Returned exactly once. */
  accessToken: string;
};

/**
 * Validate that `providedToken` matches the run's stored access_token.
 * Legacy runs (created before tokens existed) are accessible without one.
 */
export function verifyRunAccess(
  runId: string,
  providedToken: string | null,
): "ok" | "missing" | "invalid" | "not-found" {
  const runFile = join(ROOT, "runs", runId, "run.json");
  if (!existsSync(runFile)) return "not-found";
  try {
    const state = JSON.parse(readFileSync(runFile, "utf8")) as RunState;
    if (!state.access_token) return "ok";
    if (!providedToken) return "missing";
    return providedToken === state.access_token ? "ok" : "invalid";
  } catch {
    return "not-found";
  }
}

function readRunState(runDir: string): RunState {
  return JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
}

function writeRunState(runDir: string, state: RunState): void {
  writeFileAtomic(join(runDir, "run.json"), JSON.stringify(state, null, 2));
}

function readReportFragment(runDir: string, personaId: string): any | null {
  const p = join(runDir, `report-${personaId}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function createRun(input: CreateRunInput): CreateRunResult {
  if (!input.personas.length) {
    throw new Error("createRun: at least one persona is required");
  }

  // Payment-replay guard — a real payment signature unlocks one run only.
  const sig = input.paymentSignature;
  const isRealPayment =
    input.paymentVerified && !!sig && sig !== "debug-skip" && sig !== "mcp";
  if (isRealPayment && isSignatureConsumed(sig)) {
    throw new Error("createRun: payment signature already used for another run");
  }

  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const runDir = join(ROOT, "runs", runId);
  mkdirSync(runDir, { recursive: true });

  const targetKind: TargetKind = input.targetKind || "web";
  const accessToken = randomBytes(32).toString("hex");

  const state: RunState = {
    id: runId,
    created_at: new Date().toISOString(),
    target_dapp: {
      url: input.targetUrl,
      name: input.targetName,
      description: input.targetDescription,
    },
    target_kind: targetKind,
    access_token: accessToken,
    personas: input.personas,
    payment: {
      amount_usdg: input.personas.length * 5,
      tx_signature: input.paymentSignature,
      verified: input.paymentVerified,
    },
    status: "running",
    agents: Object.fromEntries(
      input.personas.map((p) => [p, { status: "pending" as const, events_count: 0 }]),
    ),
  };
  if (input.requesterEmail) {
    state.requester = { email: input.requesterEmail, goal: input.goal };
  }
  writeRunState(runDir, state);

  if (isRealPayment) {
    consumeSignature(sig, runId);
  }

  // Notify the operator and bump the user's run counter (best-effort).
  if (input.requesterEmail) {
    recordRunForUser(input.requesterEmail);
  }
  sendRunStartedEmail({
    requesterEmail: input.requesterEmail,
    target: { url: input.targetUrl, name: input.targetName },
    personas: input.personas,
    goal: input.goal,
    runId,
  }).catch((err) => console.error(`[orchestrator] run-started email failed:`, err));

  // Fire-and-forget — sequential agent execution
  runAgentsSequentially(runId, runDir, input.personas, input.targetUrl, targetKind, input.goal).catch((err) => {
    console.error(`[orchestrator] run ${runId} failed:`, err);
    try {
      const s = readRunState(runDir);
      s.status = "failed";
      writeRunState(runDir, s);
    } catch {}
  });

  return { runId, runDir, accessToken };
}

async function runAgentsSequentially(
  runId: string,
  runDir: string,
  personas: string[],
  targetUrl: string,
  targetKind: TargetKind,
  goal?: string,
): Promise<void> {
  for (const personaId of personas) {
    let state = readRunState(runDir);
    state.agents[personaId] = { status: "running", events_count: 0 };
    writeRunState(runDir, state);

    await spawnAgent(runId, personaId, targetUrl, runDir, targetKind, goal);

    // Read report fragment to determine outcome
    const fragment = readReportFragment(runDir, personaId);
    const outcome: "complete" | "abandoned" | "capped" | "failed" =
      fragment?.outcome === "completed" ? "complete"
        : fragment?.outcome === "abandoned" ? "abandoned"
          : fragment?.capped ? "capped"
            : "failed";

    state = readRunState(runDir);
    const eventsCount = countEvents(runDir, personaId);
    state.agents[personaId] = { status: outcome, events_count: eventsCount };
    writeRunState(runDir, state);
  }

  // All agents done
  const finalState = readRunState(runDir);
  finalState.status = "complete";
  writeRunState(runDir, finalState);

  // Notify the requester their report is ready (best-effort).
  if (finalState.requester?.email) {
    sendReportReadyEmail({
      requesterEmail: finalState.requester.email,
      runId,
      target: { url: finalState.target_dapp.url, name: finalState.target_dapp.name },
      accessToken: finalState.access_token,
    }).catch((err) => console.error(`[orchestrator] report-ready email failed:`, err));
  }
}

function countEvents(runDir: string, personaId: string): number {
  const f = join(runDir, "events.jsonl");
  if (!existsSync(f)) return 0;
  const lines = readFileSync(f, "utf8").split("\n").filter(Boolean);
  let count = 0;
  for (const line of lines) {
    try {
      const ev = JSON.parse(line);
      if (ev.persona === personaId) count++;
    } catch {}
  }
  return count;
}

function spawnAgent(
  runId: string,
  personaId: string,
  targetUrl: string,
  runDir: string,
  targetKind: TargetKind,
  goal?: string,
): Promise<number> {
  // Backstop timeout — a hung agent (stuck navigation, wedged LLM call)
  // must not hang the whole run. Sits above the agent's own wall-clock cap.
  const timeoutMs = Number(process.env.MIMIX_AGENT_TIMEOUT_MS) || 900_000;
  return new Promise((resolveExec) => {
    const agentMain = resolve(ROOT, "services/agent-runtime/src/main.ts");
    const tsx = resolve(ROOT, "node_modules/.bin/tsx");

    const proc = spawn(tsx, [agentMain], {
      cwd: ROOT,
      env: {
        ...process.env,
        RUN_ID: runId,
        PERSONA_ID: personaId,
        TARGET_URL: targetUrl,
        TARGET_KIND: targetKind,
        MIMIX_GOAL: goal || "",
        RUN_DIR: runDir,
        MIMIX_ROOT: ROOT,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveExec(code);
    };

    const timer = setTimeout(() => {
      console.error(
        `[orchestrator] agent ${personaId} exceeded ${timeoutMs}ms — killing`,
      );
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 5_000);
    }, timeoutMs);

    proc.stdout.on("data", (d) => {
      process.stderr.write(`[${personaId}/out] ${d.toString()}`);
    });
    proc.stderr.on("data", (d) => {
      process.stderr.write(`[${personaId}/err] ${d.toString()}`);
    });

    proc.on("close", (code) => finish(code ?? 1));
    proc.on("error", (err) => {
      console.error(`[orchestrator] agent ${personaId} spawn error:`, err);
      finish(1);
    });
  });
}
