import { PrismaClient } from "@prisma/client";

/**
 * Single shared Prisma client for the whole Next.js server process.
 * Stored on globalThis under a stable key so apps/web and the orchestrator
 * package use the same instance (one connection pool, not two).
 */
const globalForPrisma = globalThis as unknown as { mimixPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.mimixPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.mimixPrisma = prisma;
