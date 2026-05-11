import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = resolve(process.cwd(), "../..");

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const runFile = join(ROOT, "runs", params.id, "run.json");
  if (!existsSync(runFile)) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  const state = JSON.parse(readFileSync(runFile, "utf8"));

  // Aggregate report fragments if present
  const fragments: any[] = [];
  for (const pid of state.personas as string[]) {
    const fp = join(ROOT, "runs", params.id, `report-${pid}.json`);
    if (existsSync(fp)) {
      try { fragments.push(JSON.parse(readFileSync(fp, "utf8"))); } catch {}
    }
  }
  return NextResponse.json({ ...state, report_fragments: fragments });
}
