"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonaCard } from "@mimix/persona-types";

export default function PersonasPage() {
  const router = useRouter();
  const [cards, setCards] = useState<PersonaCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ url?: string; name?: string; description?: string } | null>(null);

  useEffect(() => {
    fetch("/api/personas").then((r) => r.json()).then((d) => setCards(d.personas));
    const cached = localStorage.getItem("mimix.draft_run");
    if (cached) {
      try { setDraft(JSON.parse(cached)); } catch {}
    }
  }, []);

  const toggle = (card: PersonaCard) => {
    if (card.status === "beta") {
      setToast("Beta — unlocks in v2");
      setTimeout(() => setToast(null), 2000);
      return;
    }
    const next = new Set(selected);
    if (next.has(card.id)) next.delete(card.id);
    else next.add(card.id);
    setSelected(next);
  };

  const total = selected.size * 5;

  const handleContinue = () => {
    if (selected.size === 0) return;
    localStorage.setItem(
      "mimix.pending_run",
      JSON.stringify({ ...draft, personas: Array.from(selected) }),
    );
    router.push("/pay");
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Persona marketplace</h1>
      <p className="text-slate-600 mb-8">$5 USDG per persona. 3 live, 5 beta.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => {
          const isSelected = selected.has(card.id);
          const isBeta = card.status === "beta";
          return (
            <button
              key={card.id}
              onClick={() => toggle(card)}
              data-testid={`persona-${card.id}`}
              className={[
                "text-left rounded-xl p-5 border-2 transition relative",
                isBeta
                  ? "border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed"
                  : isSelected
                  ? "border-slate-900 bg-white"
                  : "border-slate-200 bg-white hover:border-slate-400",
              ].join(" ")}
            >
              {isBeta && (
                <span className="absolute top-2 right-2 text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                  Beta
                </span>
              )}
              {!isBeta && isSelected && (
                <span className="absolute top-2 right-2 text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                  ✓
                </span>
              )}
              <div className="text-4xl mb-2">{card.avatar_emoji}</div>
              <div className="font-semibold">{card.display_name}</div>
              <div className="text-xs text-slate-500 mb-3">{card.tagline}</div>
              <div className="text-xs text-slate-600">
                <strong>Tests:</strong> {card.tests}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-10 flex justify-between items-center sticky bottom-4 bg-white border border-slate-200 rounded-xl p-4 shadow-lg">
        <div className="text-sm">
          {selected.size === 0
            ? "Select at least 1 live persona"
            : <>{selected.size} persona{selected.size > 1 ? "s" : ""} × $5 USDG = <strong>${total} USDG</strong></>}
        </div>
        <button
          onClick={handleContinue}
          disabled={selected.size === 0}
          className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue → Pay
        </button>
      </div>

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
