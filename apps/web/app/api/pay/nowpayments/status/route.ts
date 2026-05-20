import { NextRequest, NextResponse } from "next/server";
import { getInvoice } from "@mimix/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("invoice_id");
  if (!id) {
    return NextResponse.json({ error: "missing_invoice_id" }, { status: 400 });
  }
  const inv = await getInvoice(id);
  if (!inv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    status: inv.status,
    run_id: inv.run_id,
    access_token: inv.access_token,
    amount_usd: inv.amount_usd,
  });
}
