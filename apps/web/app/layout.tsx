import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mimix",
  description: "Autonomous Solana agent-personas that test your dApp.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const hasLlmKey = !!process.env.ANTHROPIC_API_KEY && process.env.MIMIX_FAKE_LLM !== "1";
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
            <a href="/" className="font-bold text-lg">Mimix</a>
            <nav className="text-sm text-slate-600 space-x-4">
              <a href="/personas" className="hover:text-slate-900">Personas</a>
              <a href="/register" className="hover:text-slate-900">Start a run</a>
            </nav>
          </div>
        </header>

        {hasLlmKey ? (
          <div className="bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-900">
            <div className="max-w-6xl mx-auto px-6 py-2">
              🤖 <strong>LLM mode active</strong> — personas are exploring with Claude Sonnet 4.5. Per-run token usage shown on the report.
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
            <div className="max-w-6xl mx-auto px-6 py-2">
              🎭 <strong>Scripted demo mode</strong> — personas follow hand-authored action scripts on the reference dApp. Add{" "}
              <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> to{" "}
              <code className="bg-amber-100 px-1 rounded">.env.local</code> for real Claude-driven exploration on any dApp. The hosted version (coming soon) will bundle inference, curated personas, and reports as a service.
            </div>
          </div>
        )}

        <main className="max-w-6xl mx-auto px-6 py-12">{children}</main>
        <footer className="max-w-6xl mx-auto px-6 py-12 text-xs text-slate-400">
          Solana devnet · Real onchain transactions via forked Zerion CLI
        </footer>
      </body>
    </html>
  );
}
