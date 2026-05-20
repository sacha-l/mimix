import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { saveInvoice } from "@mimix/orchestrator";
import { auth } from "../../../../../auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRICE_PER_PERSONA_USD = Number(process.env.MIMIX_PRICE_PER_PERSONA_USD) || 9;

export async function POST(req: NextRequest) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "nowpayments_not_configured" }, { status: 500 });
  }

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const owner = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!owner) {
    return NextResponse.json({ error: "user_not_found" }, { status: 401 });
  }
  if (owner.status !== "APPROVED") {
    return NextResponse.json({ error: "account_pending_approval" }, { status: 403 });
  }

  const body = await req.json();
  const {
    target_dapp_url,
    target_name,
    target_description,
    target_kind,
    personas,
    goal,
  } = body;

  if (!target_dapp_url || !Array.isArray(personas) || personas.length === 0) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  try {
    const u = new URL(target_dapp_url);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    return NextResponse.json({ error: "target_dapp_url must be a valid http(s) URL" }, { status: 400 });
  }

  const amount = personas.length * PRICE_PER_PERSONA_USD;
  const orderId = "mimix-" + randomBytes(12).toString("hex");
  const base =
    process.env.MIMIX_PUBLIC_URL || `https://${req.headers.get("host") || "localhost:3000"}`;

  // Persist pending invoice so the webhook can look it up when payment lands.
  await saveInvoice({
    invoice_id: orderId,
    amount_usd: amount,
    run_input: {
      ownerId: owner.id,
      targetUrl: target_dapp_url,
      targetName: target_name || "Untitled",
      targetDescription: target_description || "",
      targetKind: target_kind === "solana" ? "solana" : "web",
      personas,
      requesterEmail: owner.email,
      goal: typeof goal === "string" ? goal : undefined,
    },
  });

  // Create the hosted invoice on NowPayments. The payer picks chain + USDC
  // variant on the NowPayments page itself.
  const npRes = await fetch("https://api.nowpayments.io/v1/invoice", {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      price_amount: amount,
      price_currency: "usd",
      order_id: orderId,
      order_description: `Mimix: ${target_name || "run"} (${personas.length} persona${personas.length === 1 ? "" : "s"})`,
      ipn_callback_url: `${base}/api/pay/nowpayments/webhook`,
      success_url: `${base}/pay/success?invoice_id=${orderId}`,
      cancel_url: `${base}/pay`,
    }),
  });

  if (!npRes.ok) {
    const text = await npRes.text();
    return NextResponse.json(
      { error: "nowpayments_create_failed", detail: text },
      { status: 502 },
    );
  }
  const np = await npRes.json();
  return NextResponse.json({ invoice_id: orderId, invoice_url: np.invoice_url });
}
