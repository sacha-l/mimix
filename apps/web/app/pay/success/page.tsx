"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function PaySuccessPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <PaySuccessInner />
    </Suspense>
  );
}

function PaySuccessInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const invoiceId = sp.get("invoice_id") || "";
  const [phase, setPhase] = useState<"polling" | "paid" | "failed" | "missing" | "timeout">("polling");

  useEffect(() => {
    if (!invoiceId) {
      setPhase("missing");
      return;
    }
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const res = await fetch(
          `/api/pay/nowpayments/status?invoice_id=${encodeURIComponent(invoiceId)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "paid" && data.run_id) {
          const t = data.access_token ? `?token=${encodeURIComponent(data.access_token)}` : "";
          router.replace(`/run/${data.run_id}${t}`);
          setPhase("paid");
          return;
        }
        if (data.status === "failed") {
          setPhase("failed");
          return;
        }
      } catch {
        // network blip — keep polling
      }
      // Up to ~3 minutes (90 × 2s). Most NowPayments confirmations land in 30s.
      if (tries < 90) setTimeout(poll, 2000);
      else setPhase("timeout");
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, router]);

  if (phase === "paid") return <div>Redirecting to your run…</div>;
  if (phase === "missing") {
    return (
      <div>
        <p className="text-red-600 mb-2">No invoice id in the URL.</p>
        <a href="/register" className="underline">Start over</a>
      </div>
    );
  }
  if (phase === "failed") {
    return (
      <div>
        <p className="text-red-600 mb-2">Payment did not go through.</p>
        <a href="/pay" className="underline">Try again</a>
      </div>
    );
  }
  if (phase === "timeout") {
    return (
      <div>
        <p className="text-amber-700 mb-2">
          Still waiting on confirmation. If you actually paid, the webhook will
          finish in the background — refresh in a minute.
        </p>
        <a href="/register" className="underline">Start over</a>
      </div>
    );
  }
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-2">Confirming payment…</h1>
      <p className="text-slate-600">
        Waiting for NowPayments to confirm your transaction. This usually takes 5–30
        seconds (longer for Ethereum L1).
      </p>
    </div>
  );
}
