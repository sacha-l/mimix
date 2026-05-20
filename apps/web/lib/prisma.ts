// Re-export the orchestrator's Prisma singleton so apps/web and the
// orchestrator share one connection pool inside the Next.js process.
export { prisma } from "@mimix/orchestrator";
