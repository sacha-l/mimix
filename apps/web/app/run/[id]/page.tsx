"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type RunEvent = any;
type RunState = {
  id: string;
  personas: string[];
  status: string;
  agents: Record<string, { status: string; events_count: number }>;
  target_dapp: { url: string; name: string };
};

const COLORS: Record<string, string> = {
  action: "text-slate-600",
  screenshot: "text-slate-400",
  tx: "text-emerald-700 font-medium",
  policy_block: "text-orange-600",
  abandon: "text-red-600 font-medium",
  observation: "text-purple-700",
  complete: "text-emerald-700 font-medium",
  error: "text-red-500",
};

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<RunState | null>(null);
  const [eventsByPersona, setEventsByPersona] = useState<Record<string, RunEvent[]>>({});
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/runs/${id}`).then((r) => r.json()).then(setState);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const evtSource = new EventSource(`/api/runs/${id}/events`);
    evtSource.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        setEventsByPersona((prev) => ({
          ...prev,
          [ev.persona]: [...(prev[ev.persona] || []), ev],
        }));
      } catch {}
    };
    evtSource.addEventListener("done", () => {
      setDone(true);
      evtSource.close();
      fetch(`/api/runs/${id}`).then((r) => r.json()).then(setState);
    });
    evtSource.onerror = () => {
      // SSE retries automatically; but if run is already done we can close
    };
    return () => evtSource.close();
  }, [id]);

  if (!state) return <div>Loading…</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Run {id}</h1>
          <p className="text-sm text-slate-500">{state.target_dapp.name} — {state.target_dapp.url}</p>
        </div>
        <div className="text-sm">
          Status: <span className="font-semibold">{state.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {state.personas.map((personaId) => {
          const events = eventsByPersona[personaId] || [];
          const agent = state.agents[personaId];
          return (
            <div key={personaId} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="font-semibold">{personaId}</div>
                <span className={`text-xs px-2 py-1 rounded ${agent?.status === "complete" ? "bg-emerald-100 text-emerald-800" :
                  agent?.status === "abandoned" ? "bg-red-100 text-red-800" :
                  agent?.status === "running" ? "bg-blue-100 text-blue-800" :
                  agent?.status === "failed" ? "bg-orange-100 text-orange-800" :
                  "bg-slate-100 text-slate-600"}`}>
                  {agent?.status || "pending"}
                </span>
              </div>
              <div className="h-96 overflow-y-auto bg-slate-50 rounded p-2 text-xs font-mono space-y-1">
                {events.length === 0 && <div className="text-slate-400">No events yet</div>}
                {events.map((ev, i) => (
                  <div key={i} className={COLORS[ev.type] || "text-slate-500"}>
                    <span className="text-slate-300">{new Date(ev.ts).toLocaleTimeString()}</span>{" "}
                    <strong>{ev.type}</strong>{" "}
                    {ev.type === "action" && `${ev.action}${ev.selector ? ` ${ev.selector}` : ""}`}
                    {ev.type === "tx" && (
                      <a
                        href={`https://solscan.io/tx/${ev.signature}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {ev.signature.slice(0, 8)}…
                      </a>
                    )}
                    {ev.type === "policy_block" && `${ev.attempted}: ${ev.reason}`}
                    {ev.type === "abandon" && ev.reason}
                    {ev.type === "observation" && <em>“{ev.text}”</em>}
                    {ev.type === "error" && ev.message}
                    {ev.reasoning && <div className="text-slate-500 pl-3">// {ev.reasoning}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {done && (
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push(`/report/${id}`)}
            data-testid="generate-report"
            className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-lg font-semibold"
          >
            Generate report →
          </button>
        </div>
      )}
    </div>
  );
}
