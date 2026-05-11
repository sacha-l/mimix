/**
 * Deploys a mock USDG SPL token on Solana devnet and mints an initial
 * supply to the treasury. Idempotent: if USDG_MINT is already set in
 * .env.local, the script verifies it exists and exits without redeploying.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint,
} from "@solana/spl-token";
import { getConnection, loadTreasury } from "./lib/solana.js";

const ENV_FILE = ".env.local";
const INITIAL_SUPPLY = 1_000_000; // 1M USDG-mock with 6 decimals
const DECIMALS = 6;

function readEnvLocal(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const lines = readFileSync(ENV_FILE, "utf8").split("\n");
  const env: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function writeEnvLocal(env: Record<string, string>): void {
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  writeFileSync(ENV_FILE, lines.join("\n") + "\n");
}

async function main() {
  const conn = getConnection();
  const treasury = loadTreasury();

  const env = readEnvLocal();

  if (env.USDG_MINT) {
    try {
      const mintInfo = await getMint(conn, new PublicKey(env.USDG_MINT));
      console.log(JSON.stringify({
        usdg: {
          mint: env.USDG_MINT,
          decimals: mintInfo.decimals,
          status: "already_deployed",
        },
      }, null, 2));
      return;
    } catch {
      console.error(`USDG_MINT ${env.USDG_MINT} not found on chain, redeploying...`);
    }
  }

  console.error(`Creating USDG-mock mint with treasury=${treasury.publicKey.toBase58()}...`);
  const mint = await createMint(
    conn,
    treasury,
    treasury.publicKey,   // mint authority
    treasury.publicKey,   // freeze authority
    DECIMALS,
  );
  console.error(`Mint created: ${mint.toBase58()}`);

  const treasuryAta = await getOrCreateAssociatedTokenAccount(
    conn,
    treasury,
    mint,
    treasury.publicKey,
  );
  console.error(`Treasury USDG ATA: ${treasuryAta.address.toBase58()}`);

  await mintTo(
    conn,
    treasury,
    mint,
    treasuryAta.address,
    treasury,
    INITIAL_SUPPLY * 10 ** DECIMALS,
  );
  console.error(`Minted ${INITIAL_SUPPLY} USDG-mock to treasury`);

  env.USDG_MINT = mint.toBase58();
  env.TREASURY_PUBKEY = treasury.publicKey.toBase58();
  writeEnvLocal(env);

  console.log(JSON.stringify({
    usdg: {
      mint: mint.toBase58(),
      decimals: DECIMALS,
      initialSupply: INITIAL_SUPPLY,
      treasuryAta: treasuryAta.address.toBase58(),
      treasuryPubkey: treasury.publicKey.toBase58(),
      status: "deployed",
    },
    next_step: "Run: pnpm dev (starts the Mimix web app)",
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
