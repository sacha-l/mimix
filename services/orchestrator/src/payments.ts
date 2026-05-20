import { prisma } from "./prisma";

/**
 * Payment-replay guard, backed by Postgres. A real payment signature unlocks
 * exactly one run; consumed signatures are recorded so the same payment
 * can't be reused.
 */

export async function isSignatureConsumed(sig: string): Promise<boolean> {
  const row = await prisma.consumedSignature.findUnique({ where: { signature: sig } });
  return row !== null;
}

export async function consumeSignature(sig: string, runId: string): Promise<void> {
  await prisma.consumedSignature.upsert({
    where: { signature: sig },
    create: { signature: sig, runId },
    update: {}, // idempotent — re-running with the same sig is a no-op
  });
}
