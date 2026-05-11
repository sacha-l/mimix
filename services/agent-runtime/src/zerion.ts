/**
 * Wrapper around the forked Zerion CLI (packages/zerion-fork). The fork was
 * minimally modified to honor MIMIX_PASSPHRASE for non-interactive automation;
 * everything else is upstream behavior.
 *
 * One Zerion wallet is created per persona-run, funded from the treasury,
 * and discarded after the run completes.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ZERION_CLI = resolve(__dirname, "../../../packages/zerion-fork/cli/zerion.js");

type ExecResult = { stdout: string; stderr: string; code: number };

function runZerion(args: string[]): Promise<ExecResult> {
  return new Promise((resolveExec) => {
    const env = {
      ...process.env,
      SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      MIMIX_PASSPHRASE: process.env.MIMIX_PASSPHRASE || "mimix-dev",
    };
    const proc = spawn("node", [ZERION_CLI, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolveExec({ stdout, stderr, code: code ?? 1 }));
  });
}

function parseLastJson(stdout: string): unknown {
  // Zerion CLI emits multiple JSON blocks (wallet create + agent token); we
  // want the first JSON block (the wallet info) for create, or just the
  // single block otherwise. Strategy: extract all balanced top-level JSON
  // objects and let the caller pick.
  const blocks: unknown[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < stdout.length; i++) {
    const ch = stdout[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          blocks.push(JSON.parse(stdout.slice(start, i + 1)));
        } catch {
          // ignore malformed
        }
        start = -1;
      }
    }
  }
  return blocks[0];
}

function parseAllJson(stdout: string): unknown[] {
  const blocks: unknown[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < stdout.length; i++) {
    const ch = stdout[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          blocks.push(JSON.parse(stdout.slice(start, i + 1)));
        } catch {
          // ignore
        }
        start = -1;
      }
    }
  }
  return blocks;
}

export type ZerionWallet = {
  name: string;
  evmAddress: string;
  solAddress: string;
};

export async function createWallet(name: string): Promise<ZerionWallet> {
  const res = await runZerion(["wallet", "create", "--name", name]);
  if (res.code !== 0) {
    throw new Error(`zerion wallet create failed (${res.code}): ${res.stderr}\n${res.stdout}`);
  }
  const blocks = parseAllJson(res.stdout);
  const walletBlock = blocks.find((b: any) => b?.wallet?.solAddress) as
    | { wallet: { name: string; evmAddress: string; solAddress: string } }
    | undefined;
  if (!walletBlock) {
    throw new Error(`No wallet block in zerion output: ${res.stdout}`);
  }
  // Wallet creation auto-creates an agent token, but if a previous wallet
  // already had one, that one stays active. Explicitly switch so trading
  // commands target this wallet's token.
  const switchRes = await runZerion(["agent", "use-token", "--wallet", name]);
  if (switchRes.code !== 0) {
    throw new Error(`zerion agent use-token failed: ${switchRes.stderr}`);
  }
  return walletBlock.wallet;
}

/**
 * Switch the active Zerion agent token to the one bound to a specific wallet.
 * Useful when multiple wallets are present in the keystore.
 */
export async function useWalletToken(name: string): Promise<void> {
  const res = await runZerion(["agent", "use-token", "--wallet", name]);
  if (res.code !== 0) {
    throw new Error(`zerion agent use-token failed: ${res.stderr}`);
  }
}

export async function deleteWallet(name: string): Promise<void> {
  // upstream `wallet delete` requires a TTY confirmation. We leave the
  // ephemeral wallet in OWS storage; it has no funds remaining and gets
  // overwritten on next run with the same name.
  void name;
}

export type SendResult = {
  signature: string;
  status: "success" | "failure";
  from: string;
  to: string;
  amountSol: number;
};

export async function sendSol(params: {
  walletName: string;
  to: string;
  amountSol: number;
}): Promise<SendResult> {
  const res = await runZerion([
    "send",
    "SOL",
    String(params.amountSol),
    "--to",
    params.to,
    "--chain",
    "solana",
    "--wallet",
    params.walletName,
  ]);
  if (res.code !== 0) {
    throw new Error(`zerion send failed (${res.code}): ${res.stderr}\n${res.stdout}`);
  }
  const parsed = parseLastJson(res.stdout) as any;
  if (!parsed?.tx?.hash) {
    throw new Error(`No tx hash in zerion send output: ${res.stdout}`);
  }
  return {
    signature: parsed.tx.hash,
    status: parsed.tx.status === "success" ? "success" : "failure",
    from: parsed.send?.from || "",
    to: parsed.send?.to || params.to,
    amountSol: parseFloat(parsed.send?.amount || String(params.amountSol)),
  };
}

export { ZERION_CLI };
