import type {
  Bazaar,
  CalcResult,
  FusionData,
  FusionProfit,
  Mode,
  Recipe,
  RecipeChoice,
  TreeNode,
} from "../types";
import { isHuntable } from "./data";
import { isDumped } from "./history";

/**
 * Cost to acquire ONE of a shard *directly* (no fusion), under the chosen mode.
 *
 *  - instabuy: pay the bazaar insta-buy price (any tradeable shard).
 *  - buyorder: only HUNTABLE (basic) shards can realistically be bought via a
 *    buy order — priced at the top buy-order price (≈ insta-sell price).
 *    Fusion-only shards return Infinity, forcing the calculator to fuse down to
 *    huntable leaves. This is the rule the user asked for.
 */
function directCost(id: string, mode: Mode, bazaar: Bazaar, data: FusionData): number {
  const entry = bazaar[data.shards[id].internal_id];
  if (!entry) return Infinity;
  if (mode === "instabuy") {
    return entry.buyPrice > 0 ? entry.buyPrice : Infinity;
  }
  // buyorder
  if (!isHuntable(id, entry)) return Infinity;
  // exclude shards whose buy-order price is manipulated low (crashed) — buying
  // them would understate the real cost. Forces fusion / marks infeasible.
  if (isDumped(data.shards[id].internal_id)) return Infinity;
  return entry.sellPrice > 0 ? entry.sellPrice : Infinity;
}

/**
 * Cheapest cost to obtain every shard, considering direct purchase vs fusing.
 * Bellman-Ford-style worklist relaxation (handles the shared sub-recipe graph,
 * converges because fuse_amount/outputQuantity >= 1 so cycles never reduce cost).
 */
export function computeMinCosts(
  data: FusionData,
  bazaar: Bazaar,
  mode: Mode,
  craftPenalty = 0,
): CalcResult {
  const { shards, recipes } = data;
  const ids = Object.keys(shards);

  const minCosts = new Map<string, number>();
  const choices = new Map<string, RecipeChoice>();

  const dependents: Record<string, Set<string>> = {};
  for (const id of ids) dependents[id] = new Set();
  for (const out of ids) {
    for (const r of recipes[out] || []) {
      dependents[r.inputs[0]].add(out);
      dependents[r.inputs[1]].add(out);
    }
  }

  for (const id of ids) {
    minCosts.set(id, directCost(id, mode, bazaar, data));
    choices.set(id, { recipe: null });
  }

  const queue: string[] = [...ids];
  const inQueue = new Set<string>(ids);
  const tol = 1e-6;
  let guard = 0;
  const maxIter = ids.length * 1000;

  while (queue.length && guard++ < maxIter) {
    const out = queue.shift()!;
    inQueue.delete(out);
    const cur = minCosts.get(out)!;
    let best = cur;
    let bestRecipe = choices.get(out)!.recipe;

    for (const r of recipes[out] || []) {
      const c1 = minCosts.get(r.inputs[0])!;
      const c2 = minCosts.get(r.inputs[1])!;
      if (!isFinite(c1) || !isFinite(c2)) continue;
      const f1 = shards[r.inputs[0]].fuse_amount;
      const f2 = shards[r.inputs[1]].fuse_amount;
      const cost = (c1 * f1 + c2 * f2 + craftPenalty) / r.outputQuantity;
      if (cost < best - tol) {
        best = cost;
        bestRecipe = r;
      }
    }

    if (best < cur - tol) {
      minCosts.set(out, best);
      choices.set(out, { recipe: bestRecipe });
      for (const dep of dependents[out]) {
        if (!inQueue.has(dep)) {
          queue.push(dep);
          inQueue.add(dep);
        }
      }
    }
  }

  return { minCosts, choices };
}

/** Best (cheapest) fusion recipe to PRODUCE a target, ignoring the option of buying it. */
export function bestRecipeFor(
  target: string,
  data: FusionData,
  calc: CalcResult,
  craftPenalty = 0,
): { recipe: Recipe; costPerUnit: number } | null {
  const { shards, recipes } = data;
  let best: { recipe: Recipe; costPerUnit: number } | null = null;
  for (const r of recipes[target] || []) {
    const c1 = calc.minCosts.get(r.inputs[0])!;
    const c2 = calc.minCosts.get(r.inputs[1])!;
    if (!isFinite(c1) || !isFinite(c2)) continue;
    const f1 = shards[r.inputs[0]].fuse_amount;
    const f2 = shards[r.inputs[1]].fuse_amount;
    const costPerUnit = (c1 * f1 + c2 * f2 + craftPenalty) / r.outputQuantity;
    if (!best || costPerUnit < best.costPerUnit) best = { recipe: r, costPerUnit };
  }
  return best;
}

/**
 * Revenue from selling ONE of a shard.
 * Always uses the sell-order price (≈ lowest sell offer = bazaar buyPrice),
 * regardless of acquisition mode — you list the fused output and let it fill.
 */
export function sellValue(id: string, bazaar: Bazaar, data: FusionData): number {
  const entry = bazaar[data.shards[id].internal_id];
  if (!entry) return 0;
  return entry.buyPrice;
}

/** Rank every fuseable shard by the profit of fusing it and selling the result. */
export function rankFusionsFull(
  data: FusionData,
  bazaar: Bazaar,
  mode: Mode,
  craftPenalty = 0,
): { list: FusionProfit[]; calc: CalcResult } {
  const calc = computeMinCosts(data, bazaar, mode, craftPenalty);
  const list: FusionProfit[] = [];

  for (const id in data.shards) {
    const best = bestRecipeFor(id, data, calc, craftPenalty);
    if (!best) continue;
    const sell = sellValue(id, bazaar, data);
    if (sell <= 0) continue;
    const entry = bazaar[data.shards[id].internal_id];

    const qty = best.recipe.outputQuantity;
    const craftCost = best.costPerUnit * qty;
    const craftRevenue = sell * qty;
    const craftProfit = craftRevenue - craftCost;

    list.push({
      target: data.shards[id],
      recipe: best.recipe,
      fusionCostPerUnit: best.costPerUnit,
      sellPerUnit: sell,
      craftCost,
      craftRevenue,
      craftProfit,
      marginPct: craftCost > 0 ? (craftProfit / craftCost) * 100 : 0,
      outputQuantity: qty,
      sellMovingWeek: entry?.sellMovingWeek ?? 0,
      buyMovingWeek: entry?.buyMovingWeek ?? 0,
    });
  }

  list.sort((a, b) => b.craftProfit - a.craftProfit);
  return { list, calc };
}

/**
 * Build the cheapest-fusion tree to obtain `targetQty` of a target.
 * Quantities propagate through the tree (qtyNeeded = total of that shard needed).
 * The root is forced to use `rootRecipe`; children follow the cheapest choice.
 */
export function buildTree(
  target: string,
  rootRecipe: Recipe,
  data: FusionData,
  calc: CalcResult,
  targetQty: number,
): TreeNode {
  const { shards } = data;

  function node(id: string, qtyNeeded: number, forced: Recipe | null, visited: Set<string>): TreeNode {
    const unitCost = calc.minCosts.get(id)!;
    const choice = forced ? { recipe: forced } : calc.choices.get(id)!;

    // leaf: bought directly, unobtainable, or would create a cycle
    if (!choice.recipe || visited.has(id)) {
      return {
        id,
        qtyNeeded,
        method: isFinite(unitCost) ? "buy" : "unobtainable",
        unitCost,
      };
    }

    const r = choice.recipe;
    const fusions = qtyNeeded / r.outputQuantity; // how many times we run this fusion
    const nextVisited = new Set(visited).add(id);
    const [a, b] = r.inputs;
    return {
      id,
      qtyNeeded,
      method: "fuse",
      unitCost,
      recipe: r,
      children: [
        node(a, fusions * shards[a].fuse_amount, null, nextVisited),
        node(b, fusions * shards[b].fuse_amount, null, nextVisited),
      ],
    };
  }

  return node(target, targetQty, rootRecipe, new Set());
}

/** Total number of fusion operations in a tree (fractional; ceil for display). */
export function countFusions(node: TreeNode): number {
  if (node.method !== "fuse" || !node.recipe) return 0;
  const here = node.qtyNeeded / node.recipe.outputQuantity;
  return here + (node.children?.reduce((s, c) => s + countFusions(c), 0) ?? 0);
}

/** Flatten a tree into the total base shards you actually BUY (id -> total qty). */
export function billOfMaterials(node: TreeNode, acc = new Map<string, number>()): Map<string, number> {
  if (node.method !== "fuse") {
    acc.set(node.id, (acc.get(node.id) ?? 0) + node.qtyNeeded);
  }
  node.children?.forEach((c) => billOfMaterials(c, acc));
  return acc;
}
