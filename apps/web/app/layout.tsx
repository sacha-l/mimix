import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mimix",
  description: "Autonomous Solana agent-personas that test your dApp.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <main className="max-w-6xl mx-auto px-6 py-12">{children}</main>
        <footer className="max-w-6xl mx-auto px-6 py-12 text-xs text-slate-400">
          Solana devnet · Real onchain transactions via forked Zerion CLI
        </footer>
      </body>
    </html>
  );
}
