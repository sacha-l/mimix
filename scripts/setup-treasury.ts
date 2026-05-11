/**
 * Idempotent setup of the Mimix treasury wallet on Solana devnet.
 * - Loads or generates the treasury keypair at TREASURY_KEYPAIR_PATH.
 * - Prints the pubkey + devnet balance so the operator can airdrop.
 * - Does NOT auto-airdrop: the devnet faucet is heavily rate-limited and
 *   one shared rate-limit-aware airdrop attempt per run is safer than a
 *   loop that locks the operator out for the day.
 */
import { getConnection, loadOrCreateKeypair, lamportsToSol } from "./lib/solana.js";

async function main() {
  const path = process.env.TREASURY_KEYPAIR_PATH || "./treasury-keypair.json";
  const kp = loadOrCreateKeypair(path);
  const conn = getConnection();
  const balance = await conn.getBalance(kp.publicKey);

  console.log(JSON.stringify({
    treasury: {
      keypairPath: path,
      pubkey: kp.publicKey.toBase58(),
      balanceSol: lamportsToSol(balance),
      rpcUrl: conn.rpcEndpoint,
    },
    next_step: balance < 100_000_000
      ? `Airdrop devnet SOL: solana airdrop 2 ${kp.publicKey.toBase58()} --url ${conn.rpcEndpoint}`
      : "Treasury funded. Run: pnpm deploy:usdg",
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
