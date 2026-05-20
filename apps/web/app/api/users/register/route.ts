import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Update the signed-in user's `goal` + `questionnaire` (set on /register
 * before kicking off a run). The user's email + identity comes from the
 * Auth.js session — this endpoint never creates or authenticates a user.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const goal = typeof body.goal === "string" ? body.goal : "";
  const questionnaire = body.questionnaire || {};

  const updated = await prisma.user.update({
    where: { email: session.user.email },
    data: {
      goal,
      questionnaire: {
        app_type: questionnaire?.app_type || "",
        role: questionnaire?.role || "",
        heard_from: questionnaire?.heard_from || "",
      },
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
