/**
 * Integration smoke test: create a fresh Zerion wallet, fund it from treasury,
 * send 0.001 SOL back to a destination address via the forked Zerion CLI.
 * Requires devnet treasury already funded (run setup-treasury + airdrop first).
 */
import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
loadDotenv({ path: resolve(ROOT, ".env.local") });
loadDotenv({ path: resolve(ROOT, ".env") });
process.env.MIMIX_ROOT = ROOT;

import { createWallet, sendSol } from "./zerion.js";
import { fundFromTreasury } from "./funding.js";

async function main() {
  const walletName = `mimix-smoke-${Date.now()}`;
  console.log(`Creating wallet ${walletName}...`);
  const wallet = await createWallet(walletName);
  console.log(`  sol address: ${wallet.solAddress}`);

  console.log(`Funding with 0.02 SOL from treasury...`);
  const fundResult = await fundFromTreasury(wallet.solAddress, 0.02);
  console.log(`  funded: ${fundResult.signature}`);

  // Send 0.001 SOL back to treasury (or any destination).
  const treasuryPubkey = process.env.TREASURY_PUBKEY;
  if (!treasuryPubkey) throw new Error("TREASURY_PUBKEY not set");

  console.log(`Sending 0.001 SOL via Zerion CLI to ${treasuryPubkey}...`);
  const sendResult = await sendSol({
    walletName,
    to: treasuryPubkey,
    amountSol: 0.001,
  });
  console.log(`  zerion tx: ${sendResult.signature}`);
  console.log(`  status: ${sendResult.status}`);

  if (sendResult.status !== "success") {
    throw new Error("Zerion send did not succeed");
  }

  console.log("OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
