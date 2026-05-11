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
  llm_usage?: { input_tokens: number; output_tokens: number; cached_tokens: number };
};

type RunData = {
  id: string;
  personas: string[];
  status: string;
  target_dapp: { url: string; name: string };
  report_fragments: Fragment[];
};

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<RunData | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${id}`).then((r) => r.json()).then(setRun);
  }, [id]);

  if (!run) return <div>Loading…</div>;

  const fragments = run.report_fragments || [];
  const completed = fragments.filter((f) => f.outcome === "completed").length;
  const abandoned = fragments.filter((f) => f.outcome === "abandoned").length;
  const totalTxs = fragments.reduce((acc, f) => acc + f.tx_signatures.length, 0);
  const userReadyScore = fragments.length > 0
    ? Math.round((completed / fragments.length) * 100)
    : 0;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ run, fragments }, null, 2)], { type: "application/json" });
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-3xl font-bold">{userReadyScore}</div>
          <div className="text-xs text-slate-500">user-ready score</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-3xl font-bold">{fragments.length}</div>
          <div className="text-xs text-slate-500">personas run</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-3xl font-bold text-emerald-600">{completed}</div>
          <div className="text-xs text-slate-500">completed</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-3xl font-bold text-red-600">{abandoned}</div>
          <div className="text-xs text-slate-500">abandoned</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-3xl font-bold">{totalTxs}</div>
          <div className="text-xs text-slate-500">real onchain txs</div>
        </div>
      </div>

      <div className="space-y-6">
        {fragments.map((f) => (
          <div key={f.persona} className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">{f.persona}</h2>
              <span className={`text-xs px-2 py-1 rounded font-semibold ${
                f.outcome === "completed" ? "bg-emerald-100 text-emerald-800" :
                f.outcome === "abandoned" ? "bg-red-100 text-red-800" :
                "bg-orange-100 text-orange-800"
              }`}>
                {f.outcome}
                {f.abandon_reason && `: ${f.abandon_reason}`}
              </span>
            </div>

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
                      “{obs}”
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
          </div>
        ))}
      </div>
    </div>
  );
}
