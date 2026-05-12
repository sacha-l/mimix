import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = resolve(process.cwd(), "../..");

type Fragment = {
  persona: string;
  outcome: "completed" | "abandoned" | "failed";
  abandon_reason?: string;
  completed_steps: string[];
  failed_step?: string;
  observations: string[];
  tx_signatures: string[];
  capped?: boolean;
  turns_used?: number;
  turn_budget?: number;
};

function countEventsByType(runDir: string): Record<string, number> {
  const f = join(runDir, "events.jsonl");
  if (!existsSync(f)) return {};
  const counts: Record<string, number> = {};
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const ev = JSON.parse(line);
      counts[ev.type] = (counts[ev.type] || 0) + 1;
    } catch {}
  }
  return counts;
}

function buildAggregate(fragments: Fragment[], eventCounts: Record<string, number>) {
  const total = fragments.length;
  const completed = fragments.filter((f) => f.outcome === "completed").length;
  const abandoned = fragments.filter((f) => f.outcome === "abandoned").length;
  const capped = fragments.filter((f) => f.capped === true).length;
  const totalTxs = fragments.reduce((acc, f) => acc + (f.tx_signatures?.length || 0), 0);

  const abandonHist: Record<string, number> = {};
  for (const f of fragments) {
    if (f.outcome === "abandoned" && f.abandon_reason) {
      abandonHist[f.abandon_reason] = (abandonHist[f.abandon_reason] || 0) + 1;
    }
  }
  const abandonReasonHistogram = Object.entries(abandonHist)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));

  const topObservations = fragments.flatMap((f) =>
    (f.observations || []).map((text) => ({ persona: f.persona, text })),
  );

  const completionRate = total > 0 ? completed / total : 0;
  const userReadyScore = Math.round(completionRate * 100);

  return {
    total_personas: total,
    completed,
    abandoned,
    capped,
    completion_rate: completionRate,
    user_ready_score: userReadyScore,
    total_tx_count: totalTxs,
    policy_block_count: eventCounts.policy_block || 0,
    budget_exceeded_count: eventCounts.budget_exceeded || 0,
    abandon_reason_histogram: abandonReasonHistogram,
    top_observations: topObservations,
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const runDir = join(ROOT, "runs", params.id);
  const runFile = join(runDir, "run.json");
  if (!existsSync(runFile)) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  const state = JSON.parse(readFileSync(runFile, "utf8"));

  const fragments: Fragment[] = [];
  for (const pid of state.personas as string[]) {
    const fp = join(runDir, `report-${pid}.json`);
    if (existsSync(fp)) {
      try { fragments.push(JSON.parse(readFileSync(fp, "utf8"))); } catch {}
    }
  }

  const eventCounts = countEventsByType(runDir);
  const aggregate = buildAggregate(fragments, eventCounts);

  return NextResponse.json({ ...state, report_fragments: fragments, aggregate });
}
