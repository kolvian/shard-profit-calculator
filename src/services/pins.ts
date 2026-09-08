import type {
  Bazaar,
  FusionData,
  Mode,
  PinnedFusion,
  PinnedNode,
  SpikeInfo,
  TreeNode,
} from "../types";
import { isHuntable } from "./data";

export const PINS_KEY = "shard-fusion-pins-v1";
export function quantityInput(raw: string): string {
  if (!raw.trim()) return "";
  const n = Number(raw);
  return Number.isFinite(n)
    ? String(Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(n))))
    : "";
}
export const quantityValue = (raw: string) => Number(quantityInput(raw));
export const pinId = (id: string, mode: Mode) => `${id}:${mode}`;
export function snapshotPin(
  tree: TreeNode,
  raw: string,
  mode: Mode,
  penalty: number,
): PinnedFusion {
  const qty = quantityValue(raw);
  if (qty <= 0) throw new Error("A pin needs a positive quantity");
  const capture = (node: TreeNode): PinnedNode => ({
    id: node.id,
    quantityPerUnit: node.qtyNeeded / qty,
    ...(node.recipe && node.children
      ? {
          recipe: { ...node.recipe, inputs: [...node.recipe.inputs] },
          children: node.children.map(capture) as [PinnedNode, PinnedNode],
        }
      : {}),
  });
  return {
    id: pinId(tree.id, mode),
    shardId: tree.id,
    quantityInput: quantityInput(raw),
    mode,
    penalty,
    tree: capture(tree),
  };
}
export interface IngredientCost {
  id: string;
  mode: Mode;
  quantity: number;
  cost: number;
}
export interface PricedPin {
  tree: TreeNode;
  ingredients: IngredientCost[];
  ingredientCost: number;
  fees: number;
}
export function pricePin(
  pin: PinnedFusion,
  data: FusionData,
  bazaar: Bazaar,
  spikes: Record<string, SpikeInfo>,
): PricedPin {
  const qty = quantityValue(pin.quantityInput);
  const ingredients = new Map<string, IngredientCost>();
  let fees = 0;
  const visit = (node: PinnedNode): TreeNode => {
    const qtyNeeded = node.quantityPerUnit * qty;
    if (node.recipe && node.children) {
      const children = node.children.map(visit);
      fees += (qtyNeeded / node.recipe.outputQuantity) * pin.penalty;
      const cost =
        qtyNeeded === 0
          ? 0
          : children.reduce((s, c) => s + c.qtyNeeded * c.unitCost, 0) +
            (qtyNeeded / node.recipe.outputQuantity) * pin.penalty;
      return {
        id: node.id,
        qtyNeeded,
        method: "fuse",
        recipe: node.recipe,
        children,
        unitCost: qtyNeeded ? cost / qtyNeeded : 0,
      };
    }
    const meta = data.shards[node.id];
    const entry = bazaar[meta.internal_id];
    const price = pin.mode === "instabuy" ? entry?.buyPrice : entry?.sellPrice;
    const eligible =
      pin.mode === "instabuy" ||
      (isHuntable(node.id, entry) && !spikes[meta.internal_id]?.dumped);
    const unitCost =
      qtyNeeded === 0
        ? 0
        : eligible && price && Number.isFinite(price) && price > 0
          ? price
          : Infinity;
    if (qtyNeeded > 0) {
      const prev = ingredients.get(node.id);
      ingredients.set(node.id, {
        id: node.id,
        mode: pin.mode,
        quantity: (prev?.quantity ?? 0) + qtyNeeded,
        cost: (prev?.cost ?? 0) + qtyNeeded * unitCost,
      });
    }
    return {
      id: node.id,
      qtyNeeded,
      unitCost,
      method: Number.isFinite(unitCost) ? "buy" : "unobtainable",
    };
  };
  const tree = visit(pin.tree);
  return {
    tree,
    ingredients: [...ingredients.values()],
    ingredientCost: [...ingredients.values()].reduce(
      (sum, i) => sum + i.cost,
      0,
    ),
    fees,
  };
}
export function combinePins(priced: PricedPin[]) {
  const rows = new Map<
    string,
    { id: string; quantity: number; cost: number; modes: IngredientCost[] }
  >();
  for (const pin of priced)
    for (const ingredient of pin.ingredients) {
      const row = rows.get(ingredient.id) ?? {
        id: ingredient.id,
        quantity: 0,
        cost: 0,
        modes: [],
      };
      row.quantity += ingredient.quantity;
      row.cost += ingredient.cost;
      const mode = row.modes.find((m) => m.mode === ingredient.mode);
      if (mode) {
        mode.quantity += ingredient.quantity;
        mode.cost += ingredient.cost;
      } else row.modes.push({ ...ingredient });
      rows.set(row.id, row);
    }
  return {
    ingredients: [...rows.values()],
    ingredientCost: priced.reduce((s, p) => s + p.ingredientCost, 0),
    fees: priced.reduce((s, p) => s + p.fees, 0),
  };
}

export function restorePins(
  raw: string | null,
  data: FusionData,
): { pins: PinnedFusion[]; visible: boolean } {
  const empty = { pins: [], visible: true };
  try {
    const saved = JSON.parse(raw ?? "null");
    if (saved?.version !== 1 || !Array.isArray(saved.pins)) return empty;
    const seen = new Set<string>();
    const pins = saved.pins.filter((p: PinnedFusion) => {
      let nodes = 0;
      const validNode = (
        n: PinnedNode,
        expected: number,
        depth: number,
      ): boolean => {
        if (
          !n ||
          !data.shards[n.id] ||
          ++nodes > 10000 ||
          depth > 100 ||
          !Number.isFinite(n.quantityPerUnit) ||
          Math.abs(n.quantityPerUnit - expected) > 1e-8 * Math.max(1, expected)
        )
          return false;
        if (!n.recipe && !n.children) return true;
        const r = n.recipe;
        if (
          !r ||
          !Array.isArray(r.inputs) ||
          !Array.isArray(n.children) ||
          n.children.length !== 2
        )
          return false;
        if (
          !data.recipes[n.id]?.some(
            (candidate) =>
              candidate.outputQuantity === r.outputQuantity &&
              candidate.inputs.every((id, i) => id === r.inputs[i]),
          )
        )
          return false;
        return n.children.every(
          (child, i) =>
            child?.id === r.inputs[i] &&
            validNode(
              child,
              (expected / r.outputQuantity) * data.shards[child.id].fuse_amount,
              depth + 1,
            ),
        );
      };
      try {
        if (
          !p ||
          !data.shards[p.shardId] ||
          !["instabuy", "buyorder"].includes(p.mode) ||
          p.id !== pinId(p.shardId, p.mode) ||
          seen.has(p.id) ||
          typeof p.quantityInput !== "string" ||
          quantityInput(p.quantityInput) !== p.quantityInput ||
          !Number.isFinite(p.penalty) ||
          p.penalty < 0 ||
          p.tree?.id !== p.shardId ||
          !p.tree.recipe ||
          !validNode(p.tree, 1, 0)
        )
          return false;
        seen.add(p.id);
        return true;
      } catch {
        return false;
      }
    });
    return { pins, visible: saved.visible !== false };
  } catch {
    return empty;
  }
}
