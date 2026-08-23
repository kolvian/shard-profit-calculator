import { useMemo, useState } from "react";
import type { FusionData } from "../types";
import { ShardIcon, RARITY_TEXT } from "./ShardIcon";

interface Props {
  data: FusionData;
  exclude?: Set<string>;
  onPick: (id: string) => void;
  placeholder?: string;
}

export function ShardSearch({ data, exclude, onPick, placeholder = "Add a shard you own…" }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const all = useMemo(
    () =>
      Object.values(data.shards).sort((a, b) => a.name.localeCompare(b.name)),
    [data],
  );

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return all
      .filter((s) => s.name.toLowerCase().includes(query) && !exclude?.has(s.id))
      .slice(0, 8);
  }, [q, all, exclude]);

  const pick = (id: string) => {
    onPick(id);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) pick(matches[0].id);
        }}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent/50 focus:outline-none"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-ink-850 p-1 shadow-glow">
          {matches.map((s) => (
            <button
              key={s.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
            >
              <ShardIcon id={s.id} rarity={s.rarity} size={26} />
              <span className={`text-sm font-medium ${RARITY_TEXT[s.rarity]}`}>{s.name}</span>
              <span className="ml-auto text-xs text-slate-600">{s.family.replace(" Family", "")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
