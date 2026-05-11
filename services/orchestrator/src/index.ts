import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunState } from "@mimix/persona-types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");

export type CreateRunInput = {
  targetUrl: string;
  targetName: string;
  targetDescription: string;
  personas: string[];
  paymentSignature: string;
  paymentVerified: boolean;
};

export type CreateRunResult = {
  runId: string;
  runDir: string;
};

function readRunState(runDir: string): RunState {
  return JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
}

function writeRunState(runDir: string, state: RunState): void {
  writeFileSync(join(runDir, "run.json"), JSON.stringify(state, null, 2));
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
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const runDir = join(ROOT, "runs", runId);
  mkdirSync(runDir, { recursive: true });

  const state: RunState = {
    id: runId,
    created_at: new Date().toISOString(),
    target_dapp: {
      url: input.targetUrl,
      name: input.targetName,
      description: input.targetDescription,
    },
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
  writeRunState(runDir, state);

  // Fire-and-forget — sequential agent execution
  runAgentsSequentially(runId, runDir, input.personas, input.targetUrl).catch((err) => {
    console.error(`[orchestrator] run ${runId} failed:`, err);
    try {
      const s = readRunState(runDir);
      s.status = "failed";
      writeRunState(runDir, s);
    } catch {}
  });

  return { runId, runDir };
}

async function runAgentsSequentially(
  runId: string,
  runDir: string,
  personas: string[],
  targetUrl: string,
): Promise<void> {
  for (const personaId of personas) {
    let state = readRunState(runDir);
    state.agents[personaId] = { status: "running", events_count: 0 };
    writeRunState(runDir, state);

    await spawnAgent(runId, personaId, targetUrl, runDir);

    // Read report fragment to determine outcome
    const fragment = readReportFragment(runDir, personaId);
    const outcome: "complete" | "abandoned" | "failed" =
      fragment?.outcome === "completed" ? "complete"
        : fragment?.outcome === "abandoned" ? "abandoned"
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
): Promise<number> {
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
        RUN_DIR: runDir,
        MIMIX_ROOT: ROOT,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (d) => {
      process.stderr.write(`[${personaId}/out] ${d.toString()}`);
    });
    proc.stderr.on("data", (d) => {
      process.stderr.write(`[${personaId}/err] ${d.toString()}`);
    });

    proc.on("close", (code) => resolveExec(code ?? 1));
  });
}
