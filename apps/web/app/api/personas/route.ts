import { NextResponse } from "next/server";
import { listAllCards } from "@mimix/personas";

export const runtime = "nodejs";

export async function GET() {
  const cards = listAllCards();
  // Live cards first
  const sorted = [...cards].sort((a, b) => {
    if (a.status === b.status) return a.id.localeCompare(b.id);
    return a.status === "live" ? -1 : 1;
  });
  return NextResponse.json({ personas: sorted });
}
