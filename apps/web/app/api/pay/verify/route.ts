import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { signature, expected_amount_usdg } = body;

  if (!signature) {
    return NextResponse.json({ verified: false, reason: "missing_signature" }, { status: 400 });
  }

  const treasuryPubkey = process.env.TREASURY_PUBKEY || process.env.NEXT_PUBLIC_TREASURY_PUBKEY;
  const usdgMint = process.env.USDG_MINT || process.env.NEXT_PUBLIC_USDG_MINT;
  if (!treasuryPubkey || !usdgMint) {
    return NextResponse.json(
      { verified: false, reason: "treasury_not_configured" },
      { status: 500 },
    );
  }

  const conn = new Connection(
    process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"),
    "confirmed",
  );

  try {
    const tx = await conn.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) {
      return NextResponse.json({ verified: false, reason: "tx_not_found" });
    }
    if (tx.meta?.err) {
      return NextResponse.json({ verified: false, reason: "tx_failed" });
    }

    // Look for a token transfer instruction with the right mint to the treasury
    const instructions = tx.transaction.message.instructions as any[];
    for (const ix of instructions) {
      if (ix.program === "spl-token" && (ix.parsed?.type === "transfer" || ix.parsed?.type === "transferChecked")) {
        const info = ix.parsed.info;
        const dest = info.destination;
        // Resolve destination ATA -> compare owner
        try {
          const destAccount = await conn.getParsedAccountInfo(new PublicKey(dest));
          const parsed: any = destAccount.value?.data;
          if (parsed?.parsed?.info?.owner === treasuryPubkey && parsed?.parsed?.info?.mint === usdgMint) {
            const amount = info.tokenAmount?.uiAmount ?? parseFloat(info.amount) / 1e6;
            if (typeof expected_amount_usdg === "number" && amount < expected_amount_usdg) {
              return NextResponse.json({ verified: false, reason: "amount_too_low", amount });
            }
            return NextResponse.json({ verified: true, amount });
          }
        } catch { /* keep scanning */ }
      }
    }

    return NextResponse.json({ verified: false, reason: "no_matching_transfer" });
  } catch (err: any) {
    return NextResponse.json({ verified: false, reason: "rpc_error", message: err.message }, { status: 500 });
  }
}
