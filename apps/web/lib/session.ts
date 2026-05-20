import { redirect } from "next/navigation";
import { auth } from "../auth";
import { prisma } from "./prisma";

/**
 * Gate for protected pages. Redirects unauthenticated visitors to /signin
 * and approved-but-pending users to /waitlist. Returns the fresh DB user
 * so callers don't need a second prisma query.
 */
export async function requireApproved() {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) redirect("/signin");
  if (user.status !== "APPROVED") redirect("/waitlist");
  return { session, user };
}

/** Lighter variant — auth required but status not checked. For /signin etc. */
export async function requireSignedIn() {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) redirect("/signin");
  return { session, user };
}

/** Admin gate — operator-only via ADMIN_EMAIL env. */
export async function requireAdmin() {
  const { session, user } = await requireSignedIn();
  if (user.email !== process.env.ADMIN_EMAIL) redirect("/dashboard");
  return { session, user };
}
