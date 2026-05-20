import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./fs-atomic";
import type { TargetKind } from "@mimix/persona-types";

/**
 * Pending-invoice store. NowPayments creates a hosted checkout BEFORE the
 * run exists; on a successful IPN webhook we look up the invoice and call
 * createRun(). Records live in `payments/invoices/{invoice_id}.json`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MIMIX_ROOT || resolve(__dirname, "../../..");
const DIR = join(ROOT, "payments", "invoices");

export type InvoiceRunInput = {
  targetUrl: string;
  targetName: string;
  targetDescription: string;
  targetKind: TargetKind;
  personas: string[];
  requesterEmail?: string;
  goal?: string;
};

export type InvoiceRecord = {
  invoice_id: string;
  created_at: string;
  amount_usd: number;
  run_input: InvoiceRunInput;
  status: "pending" | "paid" | "failed";
  /** Set after createRun fires on a successful webhook. */
  run_id?: string;
  access_token?: string;
};

function invoicePath(invoiceId: string): string {
  return join(DIR, `${invoiceId}.json`);
}

export function saveInvoice(rec: InvoiceRecord): void {
  mkdirSync(DIR, { recursive: true });
  writeFileAtomic(invoicePath(rec.invoice_id), JSON.stringify(rec, null, 2));
}

export function getInvoice(invoiceId: string): InvoiceRecord | null {
  const p = invoicePath(invoiceId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as InvoiceRecord;
  } catch {
    return null;
  }
}

export function updateInvoice(
  invoiceId: string,
  patch: Partial<InvoiceRecord>,
): InvoiceRecord | null {
  const rec = getInvoice(invoiceId);
  if (!rec) return null;
  const updated = { ...rec, ...patch };
  saveInvoice(updated);
  return updated;
}
