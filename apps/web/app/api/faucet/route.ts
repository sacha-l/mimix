import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = process.env.MIMIX_ROOT || resolve(process.cwd(), "../..");
const FAUCET_USDG_AMOUNT = 100;
const FAUCET_SOL_AMOUNT = 0.05;
const USDG_DECIMALS = 6;

function loadTreasury(): Keypair {
  const inline = process.env.TREASURY_KEYPAIR_JSON;
  if (inline) {
    const raw = JSON.parse(inline);
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const path = process.env.TREASURY_KEYPAIR_PATH || "./treasury-keypair.json";
  const fullPath = path.startsWith("/") ? path : `${ROOT}/${path}`;
  if (!existsSync(fullPath)) {
    throw new Error(`Treasury keypair not found at ${fullPath}`);
  }
  const raw = JSON.parse(readFileSync(fullPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export async function POST(req: NextRequest) {
  let body: { pubkey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.pubkey || typeof body.pubkey !== "string") {
    return NextResponse.json({ error: "missing_pubkey" }, { status: 400 });
  }

  let recipient: PublicKey;
  try {
    recipient = new PublicKey(body.pubkey);
  } catch {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  const mintAddress = process.env.USDG_MINT;
  if (!mintAddress) {
    return NextResponse.json({ error: "usdg_mint_not_configured" }, { status: 500 });
  }

  const conn = new Connection(
    process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"),
    "confirmed",
  );

  let treasury: Keypair;
  try {
    treasury = loadTreasury();
  } catch (err) {
    return NextResponse.json({ error: "treasury_load_failed", message: (err as Error).message }, { status: 500 });
  }

  try {
    // 1. SOL drip (covers ATA rent + a few tx fees on the user's side).
    const lamports = Math.round(FAUCET_SOL_AMOUNT * 1_000_000_000);
    const solTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: recipient,
        lamports,
      }),
    );
    const solSig = await sendAndConfirmTransaction(conn, solTx, [treasury], {
      commitment: "confirmed",
    });

    // 2. USDG mint to the recipient's ATA.
    const mint = new PublicKey(mintAddress);
    const ata = await getOrCreateAssociatedTokenAccount(
      conn,
      treasury,
      mint,
      recipient,
    );
    const usdgSig = await mintTo(
      conn,
      treasury,
      mint,
      ata.address,
      treasury,
      FAUCET_USDG_AMOUNT * 10 ** USDG_DECIMALS,
    );

    return NextResponse.json({
      ok: true,
      sol: { signature: solSig, amount_sol: FAUCET_SOL_AMOUNT },
      usdg: { signature: usdgSig, amount: FAUCET_USDG_AMOUNT, ata: ata.address.toBase58() },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "faucet_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
