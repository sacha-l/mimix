/**
 * Mirrors scripts/fund-persona-wallet.ts but exported as a function for
 * in-process use by the agent runtime (avoids spawning tsx for every funding).
 */
import { readFileSync, existsSync } from "node:fs";
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

const USDG_DECIMALS = 6;

function getConnection(): Connection {
  const url = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
  return new Connection(url, "confirmed");
}

function loadTreasury(): Keypair {
  const inline = process.env.TREASURY_KEYPAIR_JSON;
  if (inline) {
    const raw = JSON.parse(inline);
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const path = process.env.TREASURY_KEYPAIR_PATH;
  if (!path) throw new Error("TREASURY_KEYPAIR_JSON or TREASURY_KEYPAIR_PATH must be set");
  const root = process.env.MIMIX_ROOT || process.cwd();
  const fullPath = path.startsWith("/") ? path : `${root}/${path}`;
  if (!existsSync(fullPath)) {
    throw new Error(`Treasury keypair not found at ${fullPath} (path=${path}, root=${root})`);
  }
  const raw = JSON.parse(readFileSync(fullPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export async function fundFromTreasury(
  toPubkey: string,
  amountSol: number,
  amountUsdg: number = 0,
) {
  const conn = getConnection();
  const treasury = loadTreasury();
  const lamports = Math.round(amountSol * 1_000_000_000);

  const treasuryBalance = await conn.getBalance(treasury.publicKey);
  if (treasuryBalance < lamports + 5_000) {
    throw new Error(
      `Treasury has ${treasuryBalance / 1e9} SOL, needs ${amountSol + 0.000005} SOL. ` +
      `Airdrop: solana airdrop 2 ${treasury.publicKey.toBase58()} --url ${conn.rpcEndpoint}`,
    );
  }

  // SOL transfer
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: new PublicKey(toPubkey),
      lamports,
    }),
  );
  const solSig = await sendAndConfirmTransaction(conn, tx, [treasury], {
    commitment: "confirmed",
  });

  let usdgSig: string | null = null;
  if (amountUsdg > 0) {
    const mintAddress = process.env.USDG_MINT;
    if (!mintAddress) {
      throw new Error("USDG_MINT not set — run `pnpm deploy:usdg` first");
    }
    const mint = new PublicKey(mintAddress);
    const recipient = new PublicKey(toPubkey);
    // Treasury pays rent for the ATA if it does not exist yet.
    const ata = await getOrCreateAssociatedTokenAccount(
      conn,
      treasury,
      mint,
      recipient,
    );
    usdgSig = await mintTo(
      conn,
      treasury,
      mint,
      ata.address,
      treasury,
      Math.round(amountUsdg * 10 ** USDG_DECIMALS),
    );
  }

  return { signature: solSig, usdgSignature: usdgSig, amountSol, amountUsdg, toPubkey };
}

export async function getBalance(pubkey: string): Promise<number> {
  const conn = getConnection();
  const lamports = await conn.getBalance(new PublicKey(pubkey));
  return lamports / 1_000_000_000;
}
