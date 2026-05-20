"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const DEMO_TARGET_URL =
  process.env.NEXT_PUBLIC_DEFAULT_TARGET_URL || "https://demo-target.vercel.app/?test=1";

const APP_TYPES = ["DeFi", "Wallet", "NFT / Gaming", "Consumer", "Other"];
const ROLES = ["Founder", "Engineer", "Designer", "Product", "Other"];

export default function RegisterPage() {
  const router = useRouter();
  const [url, setUrl] = useState(DEMO_TARGET_URL);
  const [name, setName] = useState("DemoPay");
  const [description, setDescription] = useState("A SOL-payment demo app.");
  const [targetKind, setTargetKind] = useState<"web" | "solana">("web");
  const [email, setEmail] = useState("");
  const [goal, setGoal] = useState("");
  const [appType, setAppType] = useState(APP_TYPES[0]);
  const [role, setRole] = useState(ROLES[0]);
  const [heardFrom, setHeardFrom] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem("mimix.draft_run");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.url) setUrl(parsed.url);
        if (parsed.name) setName(parsed.name);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.targetKind === "web" || parsed.targetKind === "solana") setTargetKind(parsed.targetKind);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.goal) setGoal(parsed.goal);
      } catch {}
    }
  }, []);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Best-effort registration — never block the run flow on the user store.
    try {
      await fetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          goal,
          questionnaire: { app_type: appType, role, heard_from: heardFrom },
        }),
      });
    } catch (err) {
      console.warn("user registration failed (continuing anyway):", err);
    }
    localStorage.setItem(
      "mimix.draft_run",
      JSON.stringify({ url, name, description, targetKind, email, goal }),
    );
    router.push("/personas");
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold mb-2">Register your app</h1>
      <p className="text-slate-600 mb-8">Any app URL. For the demo, point at the hosted DemoPay.</p>

      <form onSubmit={handleContinue} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">What are you testing?</label>
          <select
            value={targetKind}
            onChange={(e) => setTargetKind(e.target.value as "web" | "solana")}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          >
            <option value="web">A web app</option>
            <option value="solana">A Solana dApp (adds a funded test wallet)</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Web apps are browsed as-is. Solana dApps get a funded devnet wallet and a real onchain leg.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">App URL</label>
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

        <hr className="border-slate-200" />

        <div>
          <label className="block text-sm font-medium mb-1">Your email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
          <p className="text-xs text-slate-500 mt-1">We email you when your report is ready.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">What do you want to learn from this test?</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            required
            placeholder="e.g. Does the signing flow scare off first-time users?"
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">App type</label>
            <select
              value={appType}
              onChange={(e) => setAppType(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            >
              {APP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Your role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">How did you hear about Mimix? <span className="text-slate-400">(optional)</span></label>
          <input
            type="text"
            value={heardFrom}
            onChange={(e) => setHeardFrom(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white py-3 rounded-lg font-semibold"
        >
          {submitting ? "Saving…" : "Continue → Pick personas"}
        </button>
      </form>
    </div>
  );
}
