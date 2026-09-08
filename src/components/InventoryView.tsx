import { useMemo, useState } from "react";
import type { Bazaar, FusionData, Mode, SpikeInfo } from "../types";
import { rankInventoryFusions, buildTree } from "../services/calc";
import { ShardIcon } from "./ShardIcon";
import { RARITY_TEXT } from "../lib/rarity";
import { ShardSearch } from "./ShardSearch";
import { TreeNodeView } from "./TreeNodeView";
import { coins, pct } from "../lib/format";

interface Props {
  data: FusionData;
  bazaar: Bazaar;
  mode: Mode;
  penalty: number;
  spikes: Record<string, SpikeInfo>;
  dumped: ReadonlySet<string>;
  inventory: Record<string, number>;
  setInventory: (next: Record<string, number>) => void;
  buyMissing: boolean;
  setBuyMissing: (v: boolean) => void;
}

export function InventoryView({
  data,
  bazaar,
  mode,
  penalty,
  spikes,
  dumped,
  inventory,
  setInventory,
  buyMissing,
  setBuyMissing,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const owned = useMemo(
    () => new Set(Object.keys(inventory).filter((id) => inventory[id] > 0)),
    [inventory],
  );

  const { list, calc } = useMemo(
    () =>
      rankInventoryFusions(
        data,
        bazaar,
        mode,
        penalty,
        inventory,
        buyMissing,
        dumped,
      ),
    [data, bazaar, mode, penalty, inventory, buyMissing, dumped],
  );

  const setQty = (id: string, qty: number) => {
    const next = { ...inventory };
    if (qty <= 0) delete next[id];
    else next[id] = qty;
    setInventory(next);
  };

  const ownedIds = [...owned];

  return (
    <div className="grid gap-4">
      {/* inventory editor */}
      <aside className="space-y-3">
        <div className="card p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            Your shards
          </h2>
          <ShardSearch
            data={data}
            exclude={owned}
            onPick={(id) => setQty(id, 1)}
          />

          <div className="mt-3 space-y-1.5">
            {ownedIds.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-slate-500">
                Add the shards you have (e.g. from hunting) to see the most
                profitable things to fuse them into.
              </p>
            )}
            {ownedIds.map((id) => {
              const m = data.shards[id];
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-white/5 bg-ink-900/50 px-2 py-1.5"
                >
                  <ShardIcon id={id} rarity={m.rarity} size={28} />
                  <span
                    className={`flex-1 truncate text-sm font-medium ${RARITY_TEXT[m.rarity]}`}
                  >
                    {m.name}
                  </span>
                  <button
                    onClick={() => setQty(id, inventory[id] - 1)}
                    className="h-6 w-6 rounded-md border border-white/10 bg-ink-950 text-slate-300 hover:bg-ink-800"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={inventory[id]}
                    onChange={(e) =>
                      setQty(
                        id,
                        Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      )
                    }
                    className="num w-16 rounded-md border border-white/10 bg-ink-950 px-1.5 py-1 text-center text-sm text-slate-100 focus:border-accent/50 focus:outline-none"
                  />
                  <button
                    onClick={() => setQty(id, inventory[id] + 1)}
                    className="h-6 w-6 rounded-md border border-white/10 bg-ink-950 text-slate-300 hover:bg-ink-800"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setQty(id, 0)}
                    className="ml-0.5 text-slate-600 hover:text-loss"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {ownedIds.length > 0 && (
            <button
              onClick={() => setInventory({})}
              className="mt-2 text-xs text-slate-500 hover:text-slate-300"
            >
              Clear all
            </button>
          )}
        </div>

        <label
          className="card flex cursor-pointer items-start gap-2.5 p-3"
          title="If off, only fusions makeable purely from your shards are shown. If on, missing shards are bought (priced by the global mode) to complete fusions."
        >
          <input
            type="checkbox"
            checked={buyMissing}
            onChange={(e) => setBuyMissing(e.target.checked)}
            className="mt-0.5 accent-accent"
          />
          <span className="text-sm text-slate-300">
            Buy missing shards
            <span className="mt-0.5 block text-xs text-slate-500">
              {buyMissing
                ? `Top up from bazaar (${mode === "instabuy" ? "insta-buy" : "buy order"}) to complete fusions.`
                : "Only use what you have — no purchases."}
            </span>
          </span>
        </label>
      </aside>

      {/* results */}
      <main className="min-w-0">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-200">
            Best fusions from your shards
          </h2>
          <span className="text-xs text-slate-500">
            {list.length} option{list.length === 1 ? "" : "s"} · revenue at sell
            order
          </span>
        </div>

        {ownedIds.length === 0 ? (
          <div className="card flex h-48 items-center justify-center text-sm text-slate-500">
            Add shards on the left to begin.
          </div>
        ) : list.length === 0 ? (
          <div className="card flex h-48 items-center justify-center px-6 text-center text-sm text-slate-500">
            Nothing profitable can be fused from these shards
            {!buyMissing && " — try enabling “Buy missing shards”"}.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {list.map((r, i) => {
              const isOpen = expanded === r.target.id;
              const tree = isOpen
                ? buildTree(r.target.id, r.recipe, data, calc, r.maxUnits)
                : null;
              const profitColor =
                r.totalProfit >= 0 ? "text-gain" : "text-loss";
              return (
                <div
                  key={r.target.id}
                  className={`rounded-xl border ${isOpen ? "border-accent/50 bg-accent/5" : "border-white/5 bg-ink-850/50"}`}
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.target.id)}
                    className="grid w-full grid-cols-[24px_1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="text-right text-xs font-semibold text-slate-500">
                      {i + 1}
                    </span>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ShardIcon
                        id={r.target.id}
                        rarity={r.target.rarity}
                        size={38}
                      />
                      <div className="min-w-0">
                        <div
                          className={`truncate font-semibold ${RARITY_TEXT[r.target.rarity]}`}
                        >
                          {r.target.name}
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            make ×{r.maxUnits}
                          </span>
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {coins(r.perUnitProfit)}/ea ·{" "}
                          {pct(
                            r.sellPerUnit > 0
                              ? (r.perUnitProfit / r.sellPerUnit) * 100
                              : 0,
                          )}{" "}
                          of sale
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`num text-sm font-bold ${profitColor}`}>
                        {coins(r.totalProfit)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-600">
                        total profit
                      </div>
                    </div>
                    <span className="text-slate-600">{isOpen ? "▲" : "▼"}</span>
                  </button>

                  {isOpen && tree && (
                    <div className="border-t border-white/5 px-3 py-3">
                      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Mini label="Make" value={`×${r.maxUnits}`} />
                        <Mini
                          label="Total profit"
                          value={coins(r.totalProfit)}
                          cls={profitColor}
                        />
                        <Mini
                          label="Buy cost"
                          value={coins(
                            r.buyPerUnit.reduce((s, b) => s + b.cost, 0),
                          )}
                        />
                        <Mini
                          label="Revenue"
                          value={coins(r.sellPerUnit * r.maxUnits)}
                        />
                      </div>

                      <div className="mb-3 flex flex-wrap gap-3 text-xs">
                        <div>
                          <div className="mb-1 uppercase tracking-wide text-slate-500">
                            Uses your shards
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {r.consumed.map((c) => (
                              <Chip
                                key={c.id}
                                id={c.id}
                                qty={c.qty}
                                data={data}
                                tone="own"
                              />
                            ))}
                          </div>
                        </div>
                        {r.buyPerUnit.length > 0 && (
                          <div>
                            <div className="mb-1 uppercase tracking-wide text-slate-500">
                              You buy
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {r.buyPerUnit.map((b) => (
                                <Chip
                                  key={b.id}
                                  id={b.id}
                                  qty={b.qty}
                                  data={data}
                                  tone="buy"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-white/5 bg-ink-900/40 p-2.5">
                        <TreeNodeView
                          node={tree}
                          data={data}
                          bazaar={bazaar}
                          mode={mode}
                          spikes={spikes}
                          owned={owned}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function Mini({
  label,
  value,
  cls = "text-slate-100",
}: {
  label: string;
  value: string;
  cls?: string;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-ink-900/60 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`num text-sm font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function Chip({
  id,
  qty,
  data,
  tone,
}: {
  id: string;
  qty: number;
  data: FusionData;
  tone: "own" | "buy";
}) {
  const m = data.shards[id];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 ${
        tone === "own"
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-sky-500/20 bg-sky-500/5"
      }`}
      title={m.name}
    >
      <ShardIcon id={id} rarity={m.rarity} size={20} />
      <span className="text-xs text-slate-300">
        {m.name} <span className="num text-slate-500">×{Math.ceil(qty)}</span>
      </span>
    </span>
  );
}
