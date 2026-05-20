import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./fs-atomic";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MIMIX_ROOT || resolve(__dirname, "../../..");
const USERS_DIR = join(ROOT, "users");

export type Questionnaire = {
  app_type: string;
  role: string;
  heard_from: string;
};

export type UserRecord = {
  email: string;
  first_seen: string;
  last_seen: string;
  run_count: number;
  goal: string;
  questionnaire: Questionnaire;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function userPath(email: string): string {
  const hash = createHash("sha256").update(normalizeEmail(email)).digest("hex");
  return join(USERS_DIR, `${hash}.json`);
}

export function getUser(email: string): UserRecord | null {
  const p = userPath(email);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as UserRecord;
  } catch {
    return null;
  }
}

/**
 * Upsert a user record. Returns whether this email had never been seen
 * before — the caller uses that to treat the request as a first-time
 * registration.
 */
export function registerUser(input: {
  email: string;
  goal: string;
  questionnaire: Questionnaire;
}): { firstTime: boolean } {
  mkdirSync(USERS_DIR, { recursive: true });
  const now = new Date().toISOString();
  const existing = getUser(input.email);
  const record: UserRecord = existing
    ? { ...existing, last_seen: now, goal: input.goal, questionnaire: input.questionnaire }
    : {
        email: normalizeEmail(input.email),
        first_seen: now,
        last_seen: now,
        run_count: 0,
        goal: input.goal,
        questionnaire: input.questionnaire,
      };
  writeFileAtomic(userPath(input.email), JSON.stringify(record, null, 2));
  return { firstTime: !existing };
}

/** Increment a user's run counter. No-op if the user was never registered. */
export function recordRunForUser(email: string): void {
  const existing = getUser(email);
  if (!existing) return;
  existing.run_count += 1;
  existing.last_seen = new Date().toISOString();
  writeFileAtomic(userPath(email), JSON.stringify(existing, null, 2));
}
