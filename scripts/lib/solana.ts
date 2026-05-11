import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

export function getConnection(): Connection {
  const url = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
  return new Connection(url, "confirmed");
}

export function loadOrCreateKeypair(path: string): Keypair {
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

export function loadKeypair(path: string): Keypair {
  if (!existsSync(path)) {
    throw new Error(`Keypair not found at ${path}. Run setup:treasury first.`);
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function loadTreasury(): Keypair {
  const path = process.env.TREASURY_KEYPAIR_PATH;
  if (!path) throw new Error("TREASURY_KEYPAIR_PATH not set");
  return loadKeypair(path);
}

export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / 1_000_000_000;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * 1_000_000_000);
}
