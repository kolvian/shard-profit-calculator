import type { FusionData, FusionProfit, SpikeInfo } from "../types";
import { ShardIcon, RARITY_TEXT } from "./ShardIcon";
import { coins, pct, perWeek } from "../lib/format";

interface Props {
  fp: FusionProfit;
  data: FusionData;
  rank: number;
  selected: boolean;
  spike?: SpikeInfo;
  onSelect: () => void;
}

export function FusionRow({ fp, data, rank, selected, spike, onSelect }: Props) {
  const t = fp.target;
  const [a, b] = fp.recipe.inputs;
  const profitColor = fp.craftProfit >= 0 ? "text-gain" : "text-loss";
  const manipulated = spike?.status === "spike";

  return (
    <button
      onClick={onSelect}
      className={`group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition sm:grid-cols-[28px_minmax(0,1.6fr)_minmax(0,1fr)_repeat(3,minmax(0,0.9fr))] ${
        selected
          ? "border-accent/60 bg-accent/10 shadow-glow"
          : "border-white/5 bg-ink-850/50 hover:border-white/15 hover:bg-ink-800/70"
      }`}
    >
      {/* rank */}
      <span className="hidden text-right text-xs font-semibold text-slate-500 sm:block">{rank}</span>

      {/* target */}
      <div className="flex min-w-0 items-center gap-2.5">
        <ShardIcon id={t.id} rarity={t.rarity} size={38} />
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 truncate font-semibold ${RARITY_TEXT[t.rarity]}`}>
            <span className="truncate">{t.name}</span>
            {fp.outputQuantity > 1 && (
              <span className="text-xs font-normal text-slate-500">×{fp.outputQuantity}</span>
            )}
            {manipulated && (
              <span
                className="pill shrink-0 bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn"
                title={`Price pumped ${pct(spike!.changePct! * 100)} above its recent median — possible manipulation`}
              >
                ⚠ manipulated
              </span>
            )}
          </div>
          <div className="truncate text-xs text-slate-500">{t.family.replace(" Family", "")}</div>
        </div>
      </div>

      {/* recipe inputs */}
      <div className="hidden items-center gap-1 text-xs text-slate-400 sm:flex">
        <ShardIcon id={a} rarity={data.shards[a]?.rarity} size={22} />
        <span className="text-slate-600">+</span>
        <ShardIcon id={b} rarity={data.shards[b]?.rarity} size={22} />
      </div>

      {/* cost */}
      <div className="hidden text-right sm:block">
        <div className="num text-sm text-slate-300">{coins(fp.craftCost)}</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-600">cost</div>
      </div>

      {/* profit (always visible) */}
      <div className="text-right sm:order-none">
        <div className={`num text-sm font-semibold ${profitColor}`}>{coins(fp.craftProfit)}</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-600">profit</div>
      </div>

      {/* margin */}
      <div className="hidden text-right sm:block">
        <div className={`num text-sm font-medium ${profitColor}`}>{pct(fp.marginPct)}</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-600">
          {perWeek(fp.sellMovingWeek)}
        </div>
      </div>
    </button>
  );
}
