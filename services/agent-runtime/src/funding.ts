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

function getConnection(): Connection {
  const url = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
  return new Connection(url, "confirmed");
}

function loadTreasury(): Keypair {
  const path = process.env.TREASURY_KEYPAIR_PATH;
  if (!path) throw new Error("TREASURY_KEYPAIR_PATH not set");
  // Path is typically relative to project root; resolve from MIMIX_ROOT if set,
  // otherwise the current working directory.
  const root = process.env.MIMIX_ROOT || process.cwd();
  const fullPath = path.startsWith("/") ? path : `${root}/${path}`;
  if (!existsSync(fullPath)) {
    throw new Error(`Treasury keypair not found at ${fullPath} (path=${path}, root=${root})`);
  }
  const raw = JSON.parse(readFileSync(fullPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export async function fundFromTreasury(toPubkey: string, amountSol: number) {
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

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: new PublicKey(toPubkey),
      lamports,
    }),
  );

  const signature = await sendAndConfirmTransaction(conn, tx, [treasury], {
    commitment: "confirmed",
  });

  return { signature, amountSol, toPubkey };
}

export async function getBalance(pubkey: string): Promise<number> {
  const conn = getConnection();
  const lamports = await conn.getBalance(new PublicKey(pubkey));
  return lamports / 1_000_000_000;
}
