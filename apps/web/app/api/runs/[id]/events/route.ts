import { existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { verifyRunAccess, runEventsFile, prisma } from "@mimix/orchestrator";
import { auth } from "../../../../../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // EventSource can't set headers, so the token rides as a query param.
  const token = new URL(req.url).searchParams.get("token");

  // Owner-or-token gate.
  const session = await auth();
  let userId: string | null = null;
  if (session?.user?.email) {
    const u = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    userId = u?.id ?? null;
  }
  const access = await verifyRunAccess(params.id, token, userId);
  if (access === "not-found") return new Response("run not found", { status: 404 });
  if (access !== "ok") return new Response("unauthorized", { status: 401 });

  const eventsFile = runEventsFile(params.id);
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

        // Check if run is complete in the DB.
        try {
          const run = await prisma.run.findUnique({
            where: { id: params.id },
            select: { status: true },
          });
          if (run && (run.status === "complete" || run.status === "failed")) {
            controller.enqueue(encoder.encode(`event: done\ndata: ${run.status}\n\n`));
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
