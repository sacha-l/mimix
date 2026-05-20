"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Pending = {
  url: string;
  name: string;
  description: string;
  targetKind?: "web" | "solana";
  email?: string;
  goal?: string;
  personas: string[];
};

const PRICE_PER_PERSONA_USD = Number(process.env.NEXT_PUBLIC_PRICE_PER_PERSONA_USD) || 9;

export default function PayPage() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === "true";

  useEffect(() => {
    const cached = localStorage.getItem("mimix.pending_run");
    if (cached) {
      try {
        setPending(JSON.parse(cached));
      } catch {}
    }
  }, []);

  if (!pending) {
    return (
      <div>
        No pending run found. <a href="/register" className="underline">Start over</a>.
      </div>
    );
  }

  const personaCount = pending.personas?.length ?? 0;
  const amount = personaCount * PRICE_PER_PERSONA_USD;

  const handlePay = async () => {
    setError(null);
    setBusy("pay");
    try {
      const res = await fetch("/api/pay/nowpayments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_dapp_url: pending.url,
          target_name: pending.name,
          target_description: pending.description,
          target_kind: pending.targetKind,
          personas: pending.personas,
          requester_email: pending.email,
          goal: pending.goal,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.invoice_url) {
        throw new Error(data?.detail || data?.error || "checkout_create_failed");
      }
      localStorage.removeItem("mimix.pending_run");
      window.location.href = data.invoice_url;
    } catch (e: any) {
      setError(e?.message || "Could not start checkout");
      setBusy(null);
    }
  };

  const handleSkip = async () => {
    setError(null);
    setBusy("skip");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_dapp_url: pending.url,
          target_name: pending.name,
          target_description: pending.description,
          target_kind: pending.targetKind,
          personas: pending.personas,
          payment_signature: "debug-skip",
          payment_verified: false,
          requester_email: pending.email,
          goal: pending.goal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "create_run_failed");
      localStorage.removeItem("mimix.pending_run");
      const token = data.access_token ? `?token=${encodeURIComponent(data.access_token)}` : "";
      router.push(`/run/${data.run_id}${token}`);
    } catch (e: any) {
      setError(e?.message || "Could not start run");
      setBusy(null);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold mb-2">Pay</h1>
      <p className="text-slate-600 mb-6">
        ${amount} USDC for {personaCount} persona{personaCount === 1 ? "" : "s"} testing{" "}
        <span className="font-medium">{pending.name}</span>.
      </p>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Total</div>
        <div className="text-3xl font-bold mb-3">${amount} USDC</div>
        <ul className="text-sm text-slate-600 space-y-1 mb-5">
          <li>Pay from any wallet — Phantom, MetaMask, Coinbase Wallet, exchange withdrawal</li>
          <li>USDC on Solana, Ethereum, Base, Arbitrum, Optimism, or Polygon</li>
          <li>Funds land directly with the operator (non-custodial)</li>
        </ul>
        <button
          onClick={handlePay}
          disabled={!!busy}
          className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white py-3 rounded-lg font-semibold"
        >
          {busy === "pay" ? "Opening checkout…" : `Pay $${amount} USDC →`}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 mb-4 whitespace-pre-wrap">{error}</div>
      )}

      {debugMode && (
        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500 mb-2">Demo / first cohort:</p>
          <button
            onClick={handleSkip}
            disabled={!!busy}
            className="text-sm border border-slate-300 hover:border-slate-400 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {busy === "skip" ? "Starting…" : "Skip payment (debug)"}
          </button>
        </div>
      )}
    </div>
  );
}
