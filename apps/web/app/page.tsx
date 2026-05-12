export default function LandingPage() {
  return (
    <div className="py-16">
      <h1 className="text-5xl font-bold tracking-tight mb-4">
        Test your Solana dApp with real users on demand.
      </h1>
      <p className="text-xl text-slate-600 mb-8 max-w-2xl">
        AI personas hit your dApp with a real browser, a real wallet, and real
        onchain transactions. Get persona-voice UX feedback in minutes.
      </p>
      <div className="flex gap-4">
        <a
          href="/register"
          className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-semibold"
        >
          Start a run
        </a>
        <a
          href="/personas"
          className="border border-slate-300 hover:border-slate-400 px-6 py-3 rounded-lg font-semibold"
        >
          Browse personas
        </a>
      </div>

      <section className="mt-20 grid grid-cols-3 gap-6">
        <div>
          <div className="text-2xl mb-2">🎭</div>
          <h3 className="font-semibold mb-1">8 distinct personas</h3>
          <p className="text-sm text-slate-600">
            Each agent has its own scoped policy, behavior profile, and onchain wallet.
          </p>
        </div>
        <div>
          <div className="text-2xl mb-2">⛓️</div>
          <h3 className="font-semibold mb-1">Real onchain execution</h3>
          <p className="text-sm text-slate-600">
            Every transaction is signed and broadcast through the forked Zerion CLI,
            not simulated.
          </p>
        </div>
        <div>
          <div className="text-2xl mb-2">📊</div>
          <h3 className="font-semibold mb-1">UX report</h3>
          <p className="text-sm text-slate-600">
            Persona-voice observations, completed steps, abandonment reasons, Solscan links.
          </p>
        </div>
      </section>
    </div>
  );
}
