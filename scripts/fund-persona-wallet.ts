/**
 * Funds a persona's Zerion-managed Solana wallet with devnet SOL transferred
 * from the treasury. Called by the agent runtime once per persona-run.
 *
 * Usage:
 *   tsx scripts/fund-persona-wallet.ts <persona-sol-pubkey> <sol-amount>
 *
 * Devnet faucet is rate-limited, so we always source from treasury — which
 * the operator pre-funds via `solana airdrop` once.
 */
import {
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getConnection, loadTreasury, solToLamports, lamportsToSol } from "./lib/solana.js";

export async function fundPersonaWallet(toPubkey: string, amountSol: number) {
  const conn = getConnection();
  const treasury = loadTreasury();
  const lamports = solToLamports(amountSol);

  const treasuryBalance = await conn.getBalance(treasury.publicKey);
  if (treasuryBalance < lamports + 5_000) {
    throw new Error(
      `Treasury has ${lamportsToSol(treasuryBalance)} SOL, needs at least ${amountSol + 0.000005} SOL. ` +
      `Airdrop more: solana airdrop 2 ${treasury.publicKey.toBase58()} --url ${conn.rpcEndpoint}`,
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

async function main() {
  const [toPubkey, amountStr] = process.argv.slice(2);
  if (!toPubkey || !amountStr) {
    console.error("Usage: tsx scripts/fund-persona-wallet.ts <pubkey> <sol-amount>");
    process.exit(1);
  }
  const result = await fundPersonaWallet(toPubkey, parseFloat(amountStr));
  console.log(JSON.stringify(result, null, 2));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
