"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Fragment = {
  persona: string;
  outcome: "completed" | "abandoned" | "failed";
  abandon_reason?: string;
  completed_steps: string[];
  failed_step?: string;
  observations: string[];
  tx_signatures: string[];
  capped?: boolean;
  turns_used?: number;
  turn_budget?: number;
  llm_usage?: { input_tokens: number; output_tokens: number; cached_tokens: number };
};

type Aggregate = {
  total_personas: number;
  completed: number;
  abandoned: number;
  capped: number;
  completion_rate: number;
  user_ready_score: number;
  total_tx_count: number;
  policy_block_count: number;
  budget_exceeded_count: number;
  abandon_reason_histogram: { reason: string; count: number }[];
  top_observations: { persona: string; text: string }[];
};

type RunData = {
  id: string;
  personas: string[];
  status: string;
  target_dapp: { url: string; name: string };
  report_fragments: Fragment[];
  aggregate: Aggregate;
};

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<RunData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`report not found (${r.status})`);
        return r.json();
      })
      .then(setRun)
      .catch((e) => setError(e?.message || "failed to load report"));
  }, [id]);

  if (error) {
    return (
      <div>
        <p className="text-red-600 mb-2">Couldn&apos;t load this report: {error}</p>
        <a href="/register" className="underline">Start over</a>
      </div>
    );
  }
  if (!run) return <div>Loading…</div>;

  const fragments = run.report_fragments || [];
  const agg = run.aggregate;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mimix-report-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold">Report</h1>
          <p className="text-slate-500 text-sm">{run.target_dapp.name} — {run.target_dapp.url}</p>
        </div>
        <button
          onClick={exportJson}
          data-testid="export-json"
          className="border border-slate-300 hover:border-slate-400 px-4 py-2 rounded-lg text-sm"
        >
          Export JSON
        </button>
      </div>

      {/* Aggregate run summary */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">Run summary</h2>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <Stat value={agg.user_ready_score} label="user-ready score" />
          <Stat value={agg.total_personas} label="personas run" />
          <Stat value={agg.completed} label="completed" valueClass="text-emerald-600" />
          <Stat value={agg.abandoned} label="abandoned" valueClass="text-red-600" />
          <Stat value={agg.capped} label="capped" valueClass="text-orange-600" />
          <Stat value={agg.total_tx_count} label="real onchain txs" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium mb-2">Why personas abandoned</h3>
            {agg.abandon_reason_histogram.length === 0 ? (
              <div className="text-sm text-slate-400 italic">No personas abandoned.</div>
            ) : (
              <ul className="text-sm space-y-1">
                {agg.abandon_reason_histogram.map((row) => (
                  <li key={row.reason} className="flex justify-between border-b border-slate-100 py-1">
                    <span className="font-mono text-slate-700">{row.reason}</span>
                    <span className="font-semibold">×{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 text-xs text-slate-500">
              Policy blocks: <strong>{agg.policy_block_count}</strong>
              {agg.budget_exceeded_count > 0 && (
                <> · Cap hits: <strong className="text-orange-600">{agg.budget_exceeded_count}</strong></>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Top observations across personas</h3>
            {agg.top_observations.length === 0 ? (
              <div className="text-sm text-slate-400 italic">No observations yet.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {agg.top_observations.slice(0, 6).map((o, i) => (
                  <li key={i} className="border-l-2 border-purple-300 pl-3">
                    <span className="text-xs text-slate-500">{o.persona}: </span>
                    <em className="text-slate-700">"{o.text}"</em>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Per-persona */}
      <div className="space-y-6">
        {fragments.map((f) => {
          const outcomeColor =
            f.capped ? "bg-orange-100 text-orange-800" :
            f.outcome === "completed" ? "bg-emerald-100 text-emerald-800" :
            f.outcome === "abandoned" ? "bg-red-100 text-red-800" :
            "bg-slate-100 text-slate-800";
          return (
            <div key={f.persona} className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">{f.persona}</h2>
                <div className="flex items-center gap-2">
                  {f.capped && (
                    <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800 font-semibold">
                      {f.turns_used}/{f.turn_budget} turns — capped
                    </span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded font-semibold ${outcomeColor}`}>
                    {f.capped ? "capped" : f.outcome}
                    {f.abandon_reason && `: ${f.abandon_reason}`}
                  </span>
                </div>
              </div>

              {f.capped && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-sm flex justify-between items-center">
                  <div>
                    <strong className="text-orange-900">Persona hit its turn budget.</strong>
                    <span className="text-orange-700"> Observations below are based on the partial exploration.</span>
                  </div>
                  <a href="/pricing" className="text-xs underline text-orange-900 font-semibold whitespace-nowrap">
                    Upgrade plan →
                  </a>
                </div>
              )}

              {f.completed_steps.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium mb-1">Completed steps</div>
                  <ul className="text-sm text-slate-600 space-y-0.5">
                    {f.completed_steps.map((s, i) => (
                      <li key={i}>✓ {s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {f.failed_step && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-red-700">Failed step: {f.failed_step}</div>
                </div>
              )}

              {f.observations.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2">Observations (persona voice)</div>
                  <div className="space-y-2">
                    {f.observations.map((obs, i) => (
                      <blockquote
                        key={i}
                        className="border-l-2 border-purple-300 pl-3 text-sm text-slate-700 italic"
                      >
                        "{obs}"
                      </blockquote>
                    ))}
                  </div>
                </div>
              )}

              {f.tx_signatures.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Onchain transactions</div>
                  <ul className="text-xs space-y-0.5 font-mono">
                    {f.tx_signatures.map((sig) => (
                      <li key={sig}>
                        <a
                          href={`https://solscan.io/tx/${sig}?cluster=devnet`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline"
                        >
                          {sig}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {f.llm_usage && (f.llm_usage.input_tokens > 0 || f.llm_usage.output_tokens > 0) && (
                <div className="mt-4 text-xs text-slate-400 font-mono">
                  LLM: {f.llm_usage.input_tokens} in / {f.llm_usage.output_tokens} out
                  {f.llm_usage.cached_tokens > 0 && ` · cached: ${f.llm_usage.cached_tokens}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ value, label, valueClass }: { value: number; label: string; valueClass?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className={`text-2xl font-bold ${valueClass || ""}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
