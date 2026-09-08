import { useEffect, useMemo, useState } from "react";
import type {
  Bazaar,
  CalcResult,
  FusionData,
  FusionProfit,
  Mode,
  SpikeInfo,
  TreeNode,
} from "../types";
import { buildTree, billOfMaterials, countFusions } from "../services/calc";
import { ShardIcon } from "./ShardIcon";
import { RARITY_TEXT } from "../lib/rarity";
import { TreeNodeView } from "./TreeNodeView";
import { isHuntable } from "../services/data";
import { coins, coinsFull, pct, perWeek } from "../lib/format";

interface Props {
  fp: FusionProfit;
  data: FusionData;
  bazaar: Bazaar;
  calc: CalcResult;
  mode: Mode;
  penalty: number;
  onClose: () => void;
  spikes: Record<string, SpikeInfo>;
  requestHistory: (ids: string[], priority?: number) => void;
}

function collectIds(node: TreeNode, acc = new Set<string>()): Set<string> {
  acc.add(node.id);
  node.children?.forEach((c) => collectIds(c, acc));
  return acc;
}

export function FusionDetail({
  fp,
  data,
  bazaar,
  calc,
  mode,
  penalty,
  onClose,
  spikes,
  requestHistory,
}: Props) {
  const t = fp.target;
  const [qty, setQty] = useState(fp.outputQuantity);

  const tree = useMemo(
    () => buildTree(t.id, fp.recipe, data, calc, qty),
    [t.id, fp.recipe, data, calc, qty],
  );

  const bom = useMemo(() => {
    const entries = [...billOfMaterials(tree).entries()].map(([id, q]) => ({
      id,
      qty: q,
      unitCost: calc.minCosts.get(id) ?? Infinity,
    }));
    entries.sort((a, b) => b.qty * b.unitCost - a.qty * a.unitCost);
    return entries;
  }, [tree, calc]);

  const internalIds = useMemo(() => {
    const ids = collectIds(tree);
    ids.add(t.id);
    return [...ids].map((id) => data.shards[id].internal_id);
  }, [tree, t.id, data]);

  useEffect(() => {
    requestHistory([t.internal_id], 0);
    requestHistory(internalIds, 1);
  }, [t.internal_id, internalIds, requestHistory]);
  const targetSpike = spikes[t.internal_id];

  const [a, b] = fp.recipe.inputs;
  const totalCost = fp.fusionCostPerUnit * qty;
  const totalRevenue = fp.sellPerUnit * qty;
  const totalProfit = totalRevenue - totalCost;
  const profitColor = totalProfit >= 0 ? "text-gain" : "text-loss";

  const totalFusions = useMemo(() => countFusions(tree), [tree]);
  const fees = totalFusions * penalty;

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-start gap-3 border-b border-white/5 p-4">
        <ShardIcon id={t.id} rarity={t.rarity} size={58} />
        <div className="min-w-0 flex-1">
          <div className={`text-xl font-bold ${RARITY_TEXT[t.rarity]}`}>
            {t.name}
          </div>
          <div className="text-xs text-slate-500">
            {t.rarity} · {t.family.replace(" Family", "")} · {t.internal_id}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-slate-500 hover:bg-white/5 hover:text-slate-200"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* quantity selector */}
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-ink-900/60 px-3 py-2.5">
          <span className="text-sm font-medium text-slate-300">
            Quantity wanted
          </span>
          <div className="flex items-center gap-1.5">
            <QtyBtn onClick={() => setQty((q) => Math.max(1, q - 1))}>−</QtyBtn>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) =>
                setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))
              }
              className="num w-20 rounded-lg border border-white/10 bg-ink-950 px-2 py-1.5 text-center text-sm text-slate-100 focus:border-accent/50 focus:outline-none"
            />
            <QtyBtn onClick={() => setQty((q) => q + 1)}>+</QtyBtn>
            <button
              onClick={() => setQty(fp.outputQuantity)}
              className="ml-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300"
              title="Reset to one fusion"
            >
              ×{fp.outputQuantity}
            </button>
          </div>
        </div>

        {/* summary cards (scaled to quantity) */}
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Total cost"
            value={coins(totalCost)}
            sub={`${coinsFull(totalCost)} coins`}
          />
          <Stat
            label="Net revenue"
            value={coins(totalRevenue)}
            sub={`${coinsFull(totalRevenue)} coins`}
          />
          <Stat
            label="Total profit"
            value={coins(totalProfit)}
            valueClass={profitColor}
            sub={`${coinsFull(totalProfit)} coins`}
          />
          <Stat
            label="Margin"
            value={pct(fp.marginPct)}
            valueClass={profitColor}
            sub={`for ×${qty}`}
          />
        </div>

        {/* final fusion recipe */}
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/5 bg-ink-900/60 px-3 py-3">
          <Ingredient id={a} qty={data.shards[a].fuse_amount} data={data} />
          <span className="text-slate-600">+</span>
          <Ingredient id={b} qty={data.shards[b].fuse_amount} data={data} />
          <span className="px-1 text-lg text-accent-soft">→</span>
          <Ingredient id={t.id} qty={fp.outputQuantity} data={data} />
        </div>

        {/* economics note */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
          <span className="pill bg-white/5">
            sell @ sell order · {coins(fp.sellPerUnit)}/ea
          </span>
          <span className="pill bg-white/5">
            ⚒ ~{Math.ceil(totalFusions)} fusions
            {penalty > 0 ? ` · fees ${coins(fees)}` : ""}
          </span>
          <span className="pill bg-white/5">
            demand {perWeek(fp.buyMovingWeek)}
          </span>
          <span className="pill bg-white/5">
            supply {perWeek(fp.sellMovingWeek)}
          </span>
          {targetSpike?.status === "spike" && (
            <span className="pill bg-warn/15 text-warn">
              ⚠ output pumped {pct(targetSpike.changePct! * 100)} vs recent
              median — profit may be unreal
            </span>
          )}
        </div>

        {/* total ingredients (bill of materials) */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">
              Total ingredients{" "}
              <span className="text-slate-500">(for ×{qty})</span>
            </h3>
            <span className="text-xs text-slate-500">
              {bom.length} base shards
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {bom.map((it) => {
              const m = data.shards[it.id];
              const sp = spikes[m.internal_id];
              return (
                <div
                  key={it.id}
                  className="flex items-center gap-2 rounded-lg border border-white/5 bg-ink-900/50 px-2.5 py-1.5"
                >
                  <ShardIcon id={it.id} rarity={m.rarity} size={30} />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`flex items-center gap-1 truncate text-sm font-medium ${RARITY_TEXT[m.rarity]}`}
                    >
                      {m.name}
                      {isHuntable(it.id, bazaar[m.internal_id]) && (
                        <span className="text-[10px] text-emerald-400/70">
                          ⛏
                        </span>
                      )}
                      {sp?.status === "spike" && (
                        <span
                          className="text-[10px] text-warn"
                          title={`pumped ${pct(sp.changePct! * 100)} vs recent median`}
                        >
                          ⚠
                        </span>
                      )}
                    </div>
                    <div className="num text-[11px] text-slate-500">
                      {coins(it.qty * it.unitCost)}
                    </div>
                  </div>
                  <span className="num shrink-0 text-sm font-semibold text-slate-300">
                    ×{Math.ceil(it.qty)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* fusion tree */}
        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">
              Cheapest fusion path
            </h3>
            <span className="text-xs text-slate-500">
              {mode === "instabuy"
                ? "buy any shard instantly"
                : "buy huntable shards only, fuse the rest"}
            </span>
          </div>
          <div className="rounded-xl border border-white/5 bg-ink-900/40 p-3">
            <TreeNodeView
              node={tree}
              data={data}
              bazaar={bazaar}
              mode={mode}
              spikes={spikes}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function QtyBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="h-8 w-8 rounded-lg border border-white/10 bg-ink-950 text-slate-300 hover:bg-ink-800"
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass = "text-slate-100",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-ink-900/60 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`num text-lg font-bold ${valueClass}`}>{value}</div>
      {sub && <div className="num text-[11px] text-slate-600">{sub}</div>}
    </div>
  );
}

function Ingredient({
  id,
  qty,
  data,
}: {
  id: string;
  qty: number;
  data: FusionData;
}) {
  const m = data.shards[id];
  return (
    <div className="flex flex-col items-center gap-1">
      <ShardIcon id={id} rarity={m.rarity} size={46} />
      <span className="text-[11px] text-slate-400">×{qty}</span>
    </div>
  );
}
