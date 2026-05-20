import { prisma } from "./prisma";
import type { TargetKind } from "@mimix/persona-types";

/**
 * NowPayments invoice store, backed by Postgres. NowPayments creates a
 * hosted checkout BEFORE the run exists; on a successful IPN webhook we
 * look up the invoice by id and call createRun().
 */

export type InvoiceRunInput = {
  ownerId: string;
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
  created_at: Date;
  amount_usd: number;
  run_input: InvoiceRunInput;
  status: "pending" | "paid" | "failed";
  run_id?: string;
  access_token?: string;
};

function toRecord(row: any): InvoiceRecord {
  return {
    invoice_id: row.id,
    created_at: row.createdAt,
    amount_usd: Number(row.amountUsd),
    run_input: row.payload as InvoiceRunInput,
    status: row.status as InvoiceRecord["status"],
    run_id: row.runId ?? undefined,
    access_token: row.accessToken ?? undefined,
  };
}

export async function saveInvoice(input: {
  invoice_id: string;
  amount_usd: number;
  run_input: InvoiceRunInput;
}): Promise<InvoiceRecord> {
  const row = await prisma.invoice.upsert({
    where: { id: input.invoice_id },
    create: {
      id: input.invoice_id,
      ownerId: input.run_input.ownerId,
      amountUsd: input.amount_usd,
      status: "pending",
      payload: input.run_input as any,
    },
    update: {
      amountUsd: input.amount_usd,
      payload: input.run_input as any,
    },
  });
  return toRecord(row);
}

export async function getInvoice(invoiceId: string): Promise<InvoiceRecord | null> {
  const row = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  return row ? toRecord(row) : null;
}

export async function updateInvoice(
  invoiceId: string,
  patch: {
    status?: "pending" | "paid" | "failed";
    run_id?: string;
    access_token?: string;
  },
): Promise<InvoiceRecord | null> {
  const row = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.status === "paid" ? { paidAt: new Date() } : {}),
      ...(patch.run_id !== undefined ? { runId: patch.run_id } : {}),
      ...(patch.access_token !== undefined ? { accessToken: patch.access_token } : {}),
    },
  });
  return toRecord(row);
}
