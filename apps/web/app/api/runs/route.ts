import { NextRequest, NextResponse } from "next/server";
import { createRun } from "@mimix/orchestrator";
import { loadPersona } from "@mimix/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { target_dapp_url, target_name, target_description, personas, payment_signature, payment_verified } = body;

  if (!Array.isArray(personas) || personas.length === 0) {
    return NextResponse.json({ error: "personas required" }, { status: 400 });
  }
  if (!target_dapp_url) {
    return NextResponse.json({ error: "target_dapp_url required" }, { status: 400 });
  }

  // Reject beta personas
  for (const pid of personas) {
    try {
      const p = loadPersona(pid);
      if (p.status === "beta") {
        return NextResponse.json({ error: `persona ${pid} is beta` }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: `unknown persona ${pid}` }, { status: 400 });
    }
  }

  const result = createRun({
    targetUrl: target_dapp_url,
    targetName: target_name || "Untitled",
    targetDescription: target_description || "",
    personas,
    paymentSignature: payment_signature || "debug-skip",
    paymentVerified: !!payment_verified,
  });

  return NextResponse.json({ run_id: result.runId });
}
