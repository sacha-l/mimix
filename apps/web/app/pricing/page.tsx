type Tier = {
  name: string;
  tagline: string;
  price: string;
  unit: string;
  cta: string;
  ctaHref: string;
  ctaDisabled?: boolean;
  highlight?: boolean;
  features: { included: boolean; text: string }[];
};

const TIERS: Tier[] = [
  {
    name: "Preview",
    tagline: "Self-host the open-source demo.",
    price: "Free",
    unit: "forever",
    cta: "Try the demo",
    ctaHref: "/personas",
    features: [
      { included: true, text: "All 3 live personas (Nora, Walter, Dan)" },
      { included: true, text: "Reference DemoPay target app" },
      { included: true, text: "Hand-authored, scripted persona observations" },
      { included: true, text: "Full event log + report" },
      { included: false, text: "Real LLM-driven exploration" },
      { included: false, text: "Test your own app" },
    ],
  },
  {
    name: "Standard",
    tagline: "Real AI personas test your app.",
    price: "$9",
    unit: "USDC · per persona-run",
    cta: "Start a run",
    ctaHref: "/register",
    highlight: true,
    features: [
      { included: true, text: "Everything in Preview" },
      { included: true, text: "Real Claude Sonnet 4.6 exploration (vision + tool-use)" },
      { included: true, text: "20-turn budget per persona" },
      { included: true, text: "Test any web app — or a Solana devnet dApp" },
      { included: true, text: "Persona-voice observations generated per run" },
      { included: true, text: "Aggregate cross-persona summary report" },
      { included: true, text: "Report emailed when the run completes" },
      { included: false, text: "Deep exploration / priority queue" },
    ],
  },
  {
    name: "Pro",
    tagline: "Deep exploration for production launches.",
    price: "$29",
    unit: "USDC · per persona-run",
    cta: "Start a run",
    ctaHref: "/register",
    features: [
      { included: true, text: "Everything in Standard" },
      { included: true, text: "Claude Opus 4.7 — the deepest exploration" },
      { included: true, text: "40-turn budget per persona" },
      { included: true, text: "Priority queue" },
      { included: true, text: "Bring-your-own persona YAML" },
      { included: true, text: "Regression replay (re-run a test against new commits)" },
    ],
  },
];

export default function PricingPage() {
  return (
    <div>
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-3">Pricing</h1>
        <p className="text-slate-600">
          Self-host the open-source preview for free. Pay per persona-run when you want real
          AI-driven exploration. We bill in stablecoin onchain — no card, no SaaS subscription.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={[
              "rounded-2xl border bg-white p-6 flex flex-col",
              tier.highlight ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200",
            ].join(" ")}
          >
            {tier.highlight && (
              <div className="absolute -translate-y-9 self-start text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                Most popular
              </div>
            )}
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">{tier.name}</div>
            <div className="text-3xl font-bold mb-1">{tier.price}</div>
            <div className="text-xs text-slate-500 mb-3">{tier.unit}</div>
            <p className="text-sm text-slate-600 mb-5">{tier.tagline}</p>

            <ul className="space-y-2 text-sm mb-6 flex-1">
              {tier.features.map((f, i) => (
                <li key={i} className={f.included ? "text-slate-700" : "text-slate-400 line-through"}>
                  <span className="inline-block w-4">{f.included ? "✓" : "·"}</span> {f.text}
                </li>
              ))}
            </ul>

            <a
              href={tier.ctaDisabled ? undefined : tier.ctaHref}
              aria-disabled={tier.ctaDisabled}
              className={[
                "block text-center px-4 py-2 rounded-lg font-semibold text-sm",
                tier.ctaDisabled
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : tier.highlight
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "border border-slate-300 text-slate-700 hover:border-slate-400",
              ].join(" ")}
            >
              {tier.cta}
            </a>
          </div>
        ))}
      </div>

      <section className="mt-16 max-w-3xl mx-auto">
        <h2 className="text-xl font-semibold mb-3">Why per-run, not per-seat?</h2>
        <p className="text-sm text-slate-600 mb-4">
          A test run is the unit of value: builders want to know if real users can complete a journey
          on their dApp. Per-seat pricing rewards us for keeping customers logged in; per-run pricing
          rewards us for shipping reports that actually move the product. Settlement is in USDC on
          Solana — same chain you're testing on — so there's no off-ramp to a fiat invoicing system.
        </p>
        <h2 className="text-xl font-semibold mb-3 mt-8">Why a turn budget?</h2>
        <p className="text-sm text-slate-600">
          Each persona gets a finite number of LLM turns per run. When the budget is exceeded, the
          run gracefully ends, observations are still generated from the partial transcript, and the
          report shows the cap so you know what you got. Upgrading the tier raises the cap — it does
          not unlock hidden insights. We think this is a more honest pricing surface than a "number
          of seats" knob that obscures unit economics.
        </p>
      </section>
    </div>
  );
}
