import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunEvent } from "@mimix/persona-types";

export class EventLog {
  private filePath: string;
  private shotsDir: string;
  private count = 0;

  constructor(public runDir: string, public personaId: string) {
    this.filePath = join(runDir, "events.jsonl");
    this.shotsDir = join(runDir, "shots", personaId);
    mkdirSync(this.shotsDir, { recursive: true });
  }

  emit(event: Omit<RunEvent, "ts" | "persona">) {
    const full = {
      ts: new Date().toISOString(),
      persona: this.personaId,
      ...event,
    } as RunEvent;
    appendFileSync(this.filePath, JSON.stringify(full) + "\n");
    this.count++;
    return full;
  }

  get eventsCount(): number {
    return this.count;
  }

  screenshotPath(idx: number): string {
    return join(this.shotsDir, `${String(idx).padStart(4, "0")}.png`);
  }

  writeReportFragment(fragment: unknown): void {
    writeFileSync(join(this.runDir, `report-${this.personaId}.json`), JSON.stringify(fragment, null, 2));
  }
}
