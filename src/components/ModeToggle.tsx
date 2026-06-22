import type { Mode } from "../types";

const OPTIONS: { value: Mode; label: string; hint: string }[] = [
  { value: "instabuy", label: "Insta-buy", hint: "buy ingredients instantly · sell instantly" },
  { value: "buyorder", label: "Buy order", hint: "order huntable shards · sell via order" },
];

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-ink-900 p-1">
      {OPTIONS.map((o) => {
        const active = o.value === mode;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            title={o.hint}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              active ? "bg-accent text-white shadow-glow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
