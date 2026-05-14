"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const DEMO_TARGET_URL =
  process.env.NEXT_PUBLIC_DEFAULT_TARGET_URL || "https://demo-target.vercel.app/?test=1";

export default function RegisterPage() {
  const router = useRouter();
  const [url, setUrl] = useState(DEMO_TARGET_URL);
  const [name, setName] = useState("DemoPay");
  const [description, setDescription] = useState("A Solana SOL-payment dApp.");

  useEffect(() => {
    const cached = localStorage.getItem("mimix.draft_run");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.url) setUrl(parsed.url);
        if (parsed.name) setName(parsed.name);
        if (parsed.description) setDescription(parsed.description);
      } catch {}
    }
  }, []);

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("mimix.draft_run", JSON.stringify({ url, name, description }));
    router.push("/personas");
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold mb-2">Register your dApp</h1>
      <p className="text-slate-600 mb-8">Any Solana dApp URL. For the demo, point at the hosted DemoPay.</p>

      <form onSubmit={handleContinue} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">dApp URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
          <button
            type="button"
            onClick={() => setUrl(DEMO_TARGET_URL)}
            className="text-xs text-slate-500 underline mt-1"
          >
            Use the hosted DemoPay
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Name <span className="text-slate-400">(≤ 60 chars)</span></label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description <span className="text-slate-400">(≤ 280 chars)</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-semibold"
        >
          Continue → Pick personas
        </button>
      </form>
    </div>
  );
}
