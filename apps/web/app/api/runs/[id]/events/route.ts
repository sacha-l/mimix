import { existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { resolve, join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = resolve(process.cwd(), "../..");

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const eventsFile = join(ROOT, "runs", params.id, "events.jsonl");

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      let position = 0;
      let buffer = "";

      const tick = async () => {
        if (cancelled) return;

        if (!existsSync(eventsFile)) {
          controller.enqueue(encoder.encode(`: waiting\n\n`));
          setTimeout(tick, 500);
          return;
        }

        const size = statSync(eventsFile).size;
        if (size > position) {
          const fd = openSync(eventsFile, "r");
          const buf = Buffer.alloc(size - position);
          readSync(fd, buf, 0, size - position, position);
          closeSync(fd);
          position = size;
          buffer += buf.toString("utf8");

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line) continue;
            controller.enqueue(encoder.encode(`data: ${line}\n\n`));
          }
        }

        // Check if run is complete
        try {
          const runJson = JSON.parse(
            require("node:fs").readFileSync(join(ROOT, "runs", params.id, "run.json"), "utf8"),
          );
          if (runJson.status === "complete" || runJson.status === "failed") {
            controller.enqueue(encoder.encode(`event: done\ndata: ${runJson.status}\n\n`));
            controller.close();
            return;
          }
        } catch {}

        setTimeout(tick, 500);
      };

      tick();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
