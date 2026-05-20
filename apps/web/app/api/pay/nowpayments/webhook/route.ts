import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { createRun, getInvoice, updateInvoice } from "@mimix/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * NowPayments IPN signs the body with HMAC-SHA512 over the JSON with
 * keys sorted alphabetically at every level. Recreate that exactly.
 */
function sortedStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(sortedStringify).join(",") + "]";
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys.map((k) => JSON.stringify(k) + ":" + sortedStringify(obj[k])).join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

export async function POST(req: NextRequest) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ipn_secret_not_configured" }, { status: 500 });
  }

  const raw = await req.text();
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const provided = req.headers.get("x-nowpayments-sig") || "";
  const expected = createHmac("sha512", secret)
    .update(sortedStringify(parsed))
    .digest("hex");
  if (provided !== expected) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  const status = parsed.payment_status as string;
  const orderId = parsed.order_id as string;
  if (!orderId) {
    return NextResponse.json({ error: "no_order_id" }, { status: 400 });
  }

  // Only finished payments unlock a run. Other statuses (waiting, confirming,
  // sending, partially_paid, failed, refunded, expired) just acknowledge.
  if (status !== "finished") {
    return NextResponse.json({ ok: true, ignored: status });
  }

  const invoice = getInvoice(orderId);
  if (!invoice) {
    return NextResponse.json({ error: "unknown_invoice" }, { status: 404 });
  }
  // Idempotent — NowPayments retries the webhook.
  if (invoice.status === "paid" && invoice.run_id) {
    return NextResponse.json({ ok: true, idempotent: true, run_id: invoice.run_id });
  }

  try {
    const result = createRun({
      ...invoice.run_input,
      paymentSignature: `nowpay:${parsed.payment_id || orderId}`,
      paymentVerified: true,
    });
    updateInvoice(orderId, {
      status: "paid",
      run_id: result.runId,
      access_token: result.accessToken,
    });
    return NextResponse.json({ ok: true, run_id: result.runId });
  } catch (err) {
    updateInvoice(orderId, { status: "failed" });
    return NextResponse.json(
      { error: "create_run_failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
