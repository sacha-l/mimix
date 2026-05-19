import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./fs-atomic";

/**
 * Payment-replay guard. A real payment signature unlocks exactly one run;
 * consumed signatures are recorded so the same payment can't be reused.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MIMIX_ROOT || resolve(__dirname, "../../..");
const STORE = join(ROOT, "payments", "consumed.json");

function load(): Record<string, string> {
  if (!existsSync(STORE)) return {};
  try {
    return JSON.parse(readFileSync(STORE, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function isSignatureConsumed(sig: string): boolean {
  return sig in load();
}

export function consumeSignature(sig: string, runId: string): void {
  mkdirSync(dirname(STORE), { recursive: true });
  const store = load();
  store[sig] = runId;
  writeFileAtomic(STORE, JSON.stringify(store, null, 2));
}
