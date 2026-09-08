import { useEffect, useMemo, useState } from "react";
import type {
  Bazaar,
  FusionData,
  PinnedFusion,
  PinnedNode,
  SpikeInfo,
} from "../types";
import { combinePins, pricePin } from "../services/pins";
import { coins } from "../lib/format";
import { QuantityInput } from "./QuantityInput";
import { TreeNodeView } from "./TreeNodeView";

const amount = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 6 });
const cost = (value: number) =>
  Number.isFinite(value) ? coins(value) : "Unavailable";
const modeName = (mode: string) =>
  mode === "instabuy" ? "Insta-buy" : "Buy order";
interface Props {
  pins: PinnedFusion[];
  data: FusionData;
  bazaar: Bazaar;
  spikes: Record<string, SpikeInfo>;
  requestHistory: (ids: string[], priority?: number) => void;
  setQuantity: (id: string, raw: string) => void;
  remove: (id: string) => void;
}
export function PinnedTrees(props: Props) {
  const { pins, data, bazaar, spikes } = props;
  const priced = useMemo(
    () => pins.map((p) => pricePin(p, data, bazaar, spikes)),
    [pins, data, bazaar, spikes],
  );
  const total = useMemo(() => combinePins(priced), [priced]);
  return (
    <section aria-label="Pinned fusion trees" className="space-y-3">
      <div className="px-1">
        <h2 className="font-semibold text-slate-200">
          Pinned trees ({pins.length})
        </h2>
        <p className="text-xs text-slate-500">
          Saved paths · live ingredient prices
        </p>
      </div>
      {!pins.length && (
        <p className="p-4 text-sm text-slate-400">
          Open a fusion and pin its tree to keep it here.
        </p>
      )}
      {pins.map((pin, i) => (
        <PinnedCard key={pin.id} {...props} pin={pin} priced={priced[i]} />
      ))}
      {pins.length > 0 && (
        <div className="card space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-200">
            Combined shopping list
          </h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              Ingredients{" "}
              <strong className="num text-slate-100">
                {cost(total.ingredientCost)}
              </strong>
            </span>
            <span>
              Fusion fees{" "}
              <strong className="num text-slate-100">{cost(total.fees)}</strong>
            </span>
          </div>
          {!Number.isFinite(total.ingredientCost) && (
            <p className="text-xs text-warn">
              Some ingredients cannot currently be priced or bought in the saved
              mode. The total is unavailable.
            </p>
          )}
          {total.ingredients.length === 0 && (
            <p className="text-xs text-slate-500">
              No ingredients needed at zero quantity.
            </p>
          )}
          {total.ingredients.map((row) => (
            <div key={row.id} className="border-t border-white/5 pt-2 text-sm">
              <div className="flex justify-between gap-2">
                <span>
                  {data.shards[row.id].name} ×{amount(row.quantity)}
                </span>
                <span className="num">{cost(row.cost)}</span>
              </div>
              {row.modes.map((m) => (
                <div
                  key={m.mode}
                  className="flex justify-between text-xs text-slate-500"
                >
                  <span>
                    {modeName(m.mode)} · ×{amount(m.quantity)}
                  </span>
                  <span>{cost(m.cost)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function PinnedCard({
  pin,
  priced,
  data,
  bazaar,
  spikes,
  requestHistory,
  setQuantity,
  remove,
}: Props & { pin: PinnedFusion; priced: ReturnType<typeof pricePin> }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const ids = new Set<string>();
    const collect = (node: PinnedNode) => {
      ids.add(data.shards[node.id].internal_id);
      node.children?.forEach(collect);
    };
    collect(pin.tree);
    requestHistory([...ids], 1);
  }, [expanded, pin.tree, data, requestHistory]);
  const name = data.shards[pin.shardId].name;
  return (
    <article
      aria-label={`Pinned ${name} ${modeName(pin.mode)}`}
      className="card space-y-3 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-100">{name}</h3>
          <p className="text-xs text-slate-500">
            {modeName(pin.mode)} · {coins(pin.penalty)} fee/craft
          </p>
        </div>
        <button
          onClick={() => remove(pin.id)}
          aria-label={`Remove ${name} ${modeName(pin.mode)}`}
          className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
        >
          Remove
        </button>
      </div>
      <QuantityInput
        value={pin.quantityInput}
        onChange={(raw) => setQuantity(pin.id, raw)}
        label={`Pinned ${name} quantity`}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>
          Ingredients{" "}
          <strong className="num text-slate-200">
            {cost(priced.ingredientCost)}
          </strong>
        </span>
        <span>
          Fusion fees{" "}
          <strong className="num text-slate-200">{cost(priced.fees)}</strong>
        </span>
      </div>
      <button
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="text-sm text-accent-soft"
      >
        {expanded ? "Hide" : "View"} {name} ingredients & tree
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-white/5 pt-3">
          {priced.ingredients.length ? (
            priced.ingredients.map((i) => (
              <div
                key={i.id}
                className="flex justify-between gap-2 text-xs text-slate-300"
              >
                <span>
                  {data.shards[i.id].name} ×{amount(i.quantity)}
                </span>
                <span>{cost(i.cost)}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500">
              No ingredients needed at zero quantity.
            </p>
          )}
          {priced.tree.qtyNeeded > 0 && (
            <TreeNodeView
              node={priced.tree}
              data={data}
              bazaar={bazaar}
              mode={pin.mode}
              spikes={spikes}
            />
          )}
        </div>
      )}
    </article>
  );
}
