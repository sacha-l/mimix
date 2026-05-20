import { writeFileSync, renameSync } from "node:fs";

/**
 * Write to a temp file then atomically rename it over the target, so a crash
 * mid-write can never leave a half-written (corrupt) JSON file behind.
 */
export function writeFileAtomic(path: string, data: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}
