import type { Bazaar, FusionData, Mode, SpikeInfo, TreeNode } from "../types";
import { ShardIcon, RARITY_TEXT } from "./ShardIcon";
import { coins, pct } from "../lib/format";
import { isHuntable } from "../services/data";

interface Props {
  node: TreeNode;
  data: FusionData;
  bazaar: Bazaar;
  mode: Mode;
  spikes: Record<string, SpikeInfo>;
  owned?: Set<string>;
  depth?: number;
}

export function TreeNodeView({ node, data, bazaar, mode, spikes, owned, depth = 0 }: Props) {
  const meta = data.shards[node.id];
  const internalId = meta.internal_id;
  const spike = spikes[internalId];
  const fusions = node.recipe ? Math.ceil(node.qtyNeeded / node.recipe.outputQuantity) : 0;

  return (
    <div className={depth > 0 ? "ml-3.5 border-l border-white/10 pl-3.5" : ""}>
      <div className="flex items-center gap-2.5 py-1.5">
        <ShardIcon id={node.id} rarity={meta.rarity} size={34} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`truncate text-sm font-semibold ${RARITY_TEXT[meta.rarity]}`}>
              {meta.name}
            </span>
            <span className="num text-xs text-slate-500">×{Math.ceil(node.qtyNeeded)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {node.method === "fuse" && (
              <span className="pill bg-accent/15 text-accent-soft">
                ⚒ fuse {fusions}×{node.recipe!.outputQuantity > 1 ? ` → ×${node.recipe!.outputQuantity} ea` : ""}
              </span>
            )}
            {node.method === "buy" &&
              (owned?.has(node.id) ? (
                <span className="pill bg-emerald-500/15 text-emerald-300">▪ your shard (free)</span>
              ) : (
                <span className="pill bg-sky-500/15 text-sky-300">
                  {mode === "instabuy" ? "insta-buy" : "buy order"} @ {coins(node.unitCost)} ={" "}
                  {coins(node.qtyNeeded * node.unitCost)}
                </span>
              ))}
            {node.method === "buy" && isHuntable(node.id, bazaar[internalId]) && (
              <span className="pill bg-emerald-500/10 text-emerald-300/90" title="Obtained by hunting">
                huntable
              </span>
            )}
            {node.method === "unobtainable" && (
              <span className="pill bg-loss/15 text-loss">unobtainable in this mode</span>
            )}
            {spike?.status === "spike" && (
              <span
                className="pill bg-warn/15 text-warn"
                title={`Price pumped ${pct(spike.changePct! * 100)} above its recent median — possible manipulation`}
              >
                ⚠ pump {pct(spike.changePct! * 100)}
              </span>
            )}
            {spike?.dumped && (
              <span
                className="pill bg-loss/15 text-loss"
                title={`Buy-order price crashed ${pct(spike.dumpPct! * 100)} below its recent median — excluded from buy-order cost`}
              >
                ⬇ crashed {pct(spike.dumpPct! * 100)}
              </span>
            )}
            {spike?.status === "loading" && (
              <span className="pill bg-white/5 text-slate-500">checking price…</span>
            )}
          </div>
        </div>
      </div>

      {node.children && (
        <div>
          {node.children.map((c, i) => (
            <TreeNodeView
              key={`${c.id}-${i}`}
              node={c}
              data={data}
              bazaar={bazaar}
              mode={mode}
              spikes={spikes}
              owned={owned}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
