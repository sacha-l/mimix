import { NextResponse } from "next/server";
import { verifyRunAccess, getRunStateForApi } from "@mimix/orchestrator";
import { auth } from "../../../../auth";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function buildAggregate(fragments: Fragment[]) {
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
  return {
    total_personas: total,
    completed,
    abandoned,
    capped,
    completion_rate: completionRate,
    user_ready_score: Math.round(completionRate * 100),
    total_tx_count: totalTxs,
    policy_block_count: 0, // policy_block events are no longer counted here
    budget_exceeded_count: 0,
    abandon_reason_histogram: abandonReasonHistogram,
    top_observations: topObservations,
  };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const token =
    url.searchParams.get("token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    null;

  // Owner-or-token gate. Owner is determined by Auth.js session.
  const session = await auth();
  let userId: string | null = null;
  if (session?.user?.email) {
    const u = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    userId = u?.id ?? null;
  }
  const access = await verifyRunAccess(params.id, token, userId);
  if (access === "not-found") {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (access !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const state = await getRunStateForApi(params.id);
  if (!state) return NextResponse.json({ error: "run not found" }, { status: 404 });
  const fragments = state.report_fragments as Fragment[];
  const aggregate = buildAggregate(fragments);

  return NextResponse.json({ ...state, aggregate });
}
