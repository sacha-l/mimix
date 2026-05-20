import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./lib/prisma";

/**
 * Auth.js v5 — Google OAuth + email magic-link. Sessions live in Postgres
 * via the Prisma adapter so we can revoke from the DB. User rows are seeded
 * with `status: PENDING` (Prisma default) — the operator approves via
 * /admin/users before they can do anything beyond /waitlist.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    // Magic-link reuses the existing SMTP config — same as run/report emails.
    Nodemailer({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        auth: {
          user: process.env.SMTP_USER || "",
          pass: process.env.SMTP_PASS || "",
        },
      },
      from: process.env.SMTP_FROM || process.env.SMTP_USER || "mimix@localhost",
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    async session({ session, user }) {
      // Surface id + status to client/server callers of `auth()`.
      if (session.user) {
        (session.user as any).id = user.id;
        (session.user as any).status = (user as any).status;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Notify the operator (best-effort).
      const op = process.env.MIMIX_OPERATOR_EMAIL;
      if (!op) return;
      try {
        const { sendSignupNotificationEmail } = await import("@mimix/orchestrator");
        await sendSignupNotificationEmail({
          newUserEmail: user.email || "(no email)",
          newUserName: user.name || undefined,
        });
      } catch (err) {
        console.error("[auth] signup notification failed:", err);
      }
    },
  },
});
