import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import type { RunState, TargetKind } from "@mimix/persona-types";

import { prisma } from "./prisma";
import {
  sendRunStartedEmail,
  sendReportReadyEmail,
} from "./email";
import { isSignatureConsumed, consumeSignature } from "./payments";

// Re-exports
export { prisma } from "./prisma";
export { saveInvoice, getInvoice, updateInvoice } from "./invoices";
export type { InvoiceRecord, InvoiceRunInput } from "./invoices";
export { sendSignupNotificationEmail, sendUserApprovedEmail } from "./email";
export { isSignatureConsumed, consumeSignature } from "./payments";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MIMIX_ROOT || resolve(__dirname, "../../..");
const DATA_ROOT = process.env.MIMIX_DATA_ROOT || ROOT;

/**
 * Run metadata lives in Postgres (Run table). Run *artifacts* (events.jsonl,
 * screenshots, report fragments) live on disk under DATA_ROOT/runs/{id}/ —
 * they're large or append-only so the DB isn't the right home.
 */

export type CreateRunInput = {
  ownerId: string;
  targetUrl: string;
  targetName: string;
  targetDescription: string;
  targetKind?: TargetKind;
  personas: string[];
  paymentSignature: string;
  paymentVerified: boolean;
  goal?: string;
};

export type CreateRunResult = {
  runId: string;
  runDir: string;
  accessToken: string;
};

/**
 * Verify access to a run. Owners (signed-in matching userId) skip the
 * token check; an unauthenticated viewer needs the share-link token.
 * Legacy file-system runs (no DB row) are no longer readable here.
 */
export async function verifyRunAccess(
  runId: string,
  providedToken: string | null,
  userId: string | null,
): Promise<"ok" | "missing" | "invalid" | "not-found"> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { ownerId: true, accessToken: true },
  });
  if (!run) return "not-found";
  if (userId && run.ownerId === userId) return "ok";
  if (!providedToken) return "missing";
  return providedToken === run.accessToken ? "ok" : "invalid";
}

export async function createRun(input: CreateRunInput): Promise<CreateRunResult> {
  if (!input.personas.length) {
    throw new Error("createRun: at least one persona is required");
  }

  // Payment-replay guard.
  const sig = input.paymentSignature;
  const isRealPayment =
    input.paymentVerified && !!sig && sig !== "debug-skip" && sig !== "mcp";
  if (isRealPayment && (await isSignatureConsumed(sig))) {
    throw new Error("createRun: payment signature already used for another run");
  }

  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const runDir = join(DATA_ROOT, "runs", runId);
  mkdirSync(runDir, { recursive: true });

  const targetKind: TargetKind = input.targetKind || "web";
  const accessToken = randomBytes(32).toString("hex");

  // Initial agents map — all pending.
  const agents = Object.fromEntries(
    input.personas.map((p) => [p, { status: "pending", events_count: 0 }]),
  );

  await prisma.run.create({
    data: {
      id: runId,
      ownerId: input.ownerId,
      targetUrl: input.targetUrl,
      targetName: input.targetName,
      targetDescription: input.targetDescription,
      targetKind,
      personas: input.personas,
      goal: input.goal,
      status: "running",
      agents: agents as any,
      accessToken,
      paymentSignature: sig || null,
      paymentVerified: input.paymentVerified,
    },
  });

  if (isRealPayment) {
    await consumeSignature(sig, runId);
  }

  // Operator notification (best-effort).
  const requester = await prisma.user.findUnique({
    where: { id: input.ownerId },
    select: { email: true },
  });
  sendRunStartedEmail({
    requesterEmail: requester?.email || undefined,
    target: { url: input.targetUrl, name: input.targetName },
    personas: input.personas,
    goal: input.goal,
    runId,
  }).catch((err) => console.error(`[orchestrator] run-started email failed:`, err));

  // Fire-and-forget — sequential agent execution
  runAgentsSequentially(runId, runDir, input.personas, input.targetUrl, targetKind, input.goal).catch(
    async (err) => {
      console.error(`[orchestrator] run ${runId} failed:`, err);
      try {
        await prisma.run.update({
          where: { id: runId },
          data: { status: "failed", completedAt: new Date() },
        });
      } catch {}
    },
  );

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
    await updateAgent(runId, personaId, { status: "running", events_count: 0 });

    await spawnAgent(runId, personaId, targetUrl, runDir, targetKind, goal);

    const fragment = readReportFragment(runDir, personaId);
    const outcome: "complete" | "abandoned" | "capped" | "failed" =
      fragment?.outcome === "completed"
        ? "complete"
        : fragment?.outcome === "abandoned"
          ? "abandoned"
          : fragment?.capped
            ? "capped"
            : "failed";

    await updateAgent(runId, personaId, {
      status: outcome,
      events_count: countEvents(runDir, personaId),
    });
  }

  // All agents done.
  const finalRun = await prisma.run.update({
    where: { id: runId },
    data: { status: "complete", completedAt: new Date() },
    include: { owner: true },
  });

  // Report-ready email to the requester (best-effort).
  if (finalRun.owner?.email) {
    sendReportReadyEmail({
      requesterEmail: finalRun.owner.email,
      runId,
      target: { url: finalRun.targetUrl, name: finalRun.targetName },
      accessToken: finalRun.accessToken,
    }).catch((err) =>
      console.error(`[orchestrator] report-ready email failed:`, err),
    );
  }
}

async function updateAgent(
  runId: string,
  personaId: string,
  patch: { status: string; events_count: number },
): Promise<void> {
  const run = await prisma.run.findUnique({ where: { id: runId }, select: { agents: true } });
  const agents = ((run?.agents as any) || {}) as Record<string, { status: string; events_count: number }>;
  agents[personaId] = patch;
  await prisma.run.update({ where: { id: runId }, data: { agents: agents as any } });
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

// ─────────────────────────────────────────────────────────────────────
// Wire-shape helpers (API response building)
// ─────────────────────────────────────────────────────────────────────

/**
 * Build the API-shape RunState that the web UI consumes.
 * Reads metadata from Postgres + report fragments from the runs/{id}/ dir.
 */
export async function getRunStateForApi(runId: string): Promise<
  | (RunState & { report_fragments: any[]; access_token?: string })
  | null
> {
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) return null;
  const runDir = join(DATA_ROOT, "runs", runId);

  const fragments: any[] = [];
  for (const pid of run.personas) {
    const fp = join(runDir, `report-${pid}.json`);
    if (existsSync(fp)) {
      try {
        fragments.push(JSON.parse(readFileSync(fp, "utf8")));
      } catch {}
    }
  }

  const state: RunState & { report_fragments: any[]; access_token?: string } = {
    id: run.id,
    created_at: run.createdAt.toISOString(),
    target_dapp: {
      url: run.targetUrl,
      name: run.targetName,
      description: run.targetDescription,
    },
    target_kind: run.targetKind as TargetKind,
    personas: run.personas,
    // payment.amount_usdg is legacy naming — values are USDC now.
    payment: {
      amount_usdg: run.personas.length * 9,
      tx_signature: run.paymentSignature || "",
      verified: run.paymentVerified,
    },
    status: run.status as RunState["status"],
    agents: (run.agents as any) || {},
    report_fragments: fragments,
  };
  return state;
}

/** Returns events.jsonl path for the SSE route. */
export function runEventsFile(runId: string): string {
  return join(DATA_ROOT, "runs", runId, "events.jsonl");
}
