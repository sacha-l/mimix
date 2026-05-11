"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PayPage() {
  const router = useRouter();
  const [pending, setPending] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === "true";
  const treasuryPubkey = process.env.NEXT_PUBLIC_TREASURY_PUBKEY || "(set TREASURY_PUBKEY in .env.local)";
  const usdgMint = process.env.NEXT_PUBLIC_USDG_MINT || "(set USDG_MINT in .env.local)";

  useEffect(() => {
    const cached = localStorage.getItem("mimix.pending_run");
    if (cached) {
      try { setPending(JSON.parse(cached)); } catch {}
    }
  }, []);

  if (!pending) {
    return <div>No pending run found. <a href="/register" className="underline">Start over</a>.</div>;
  }

  const amount = (pending.personas?.length ?? 0) * 5;

  const handleSkipPayment = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_dapp_url: pending.url,
          target_name: pending.name,
          target_description: pending.description,
          personas: pending.personas,
          payment_signature: "debug-skip",
          payment_verified: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "create_run_failed");
      localStorage.removeItem("mimix.pending_run");
      router.push(`/run/${data.run_id}`);
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold mb-2">Pay with USDG</h1>
      <p className="text-slate-600 mb-8">Solana devnet. ${amount} USDG total for {pending.personas?.length} persona{pending.personas?.length === 1 ? "" : "s"}.</p>

      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <div className="text-sm text-slate-500 mb-1">Treasury address</div>
        <div className="font-mono text-xs break-all bg-slate-50 p-2 rounded mb-4" data-testid="treasury-address">
          {treasuryPubkey}
        </div>
        <div className="text-sm text-slate-500 mb-1">USDG mint</div>
        <div className="font-mono text-xs break-all bg-slate-50 p-2 rounded mb-4" data-testid="usdg-mint">
          {usdgMint}
        </div>
        <div className="text-sm text-slate-500 mb-1">Required amount</div>
        <div className="text-2xl font-semibold">{amount} USDG</div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-900">
        <strong>Devnet USDG flow:</strong> for a full demo you'd connect a Phantom wallet
        on devnet, transfer USDG to the treasury, and post the signature to
        <code className="mx-1 bg-amber-100 px-1 rounded">/api/pay/verify</code>.
        For live judging, use the debug skip below.
      </div>

      {debugMode && (
        <button
          onClick={handleSkipPayment}
          disabled={submitting}
          data-testid="skip-payment"
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-semibold disabled:opacity-50"
        >
          {submitting ? "Starting run..." : "Skip payment (debug) → Start run"}
        </button>
      )}

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
    </div>
  );
}
