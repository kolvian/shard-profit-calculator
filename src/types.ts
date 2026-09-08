// ---- Static dataset (vendored from the community SkyShards dataset) ----

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface ShardMeta {
  id: string; // e.g. "C1"
  name: string; // e.g. "Grove"
  family: string; // e.g. "Elemental Family"
  type: string; // e.g. "Global"
  rarity: Rarity;
  fuse_amount: number; // how many of THIS shard a fusion consumes when used as an input
  internal_id: string; // bazaar product id, e.g. "SHARD_GROVE"
}

// recipes[outputId] = list of ways to produce it
export interface Recipe {
  inputs: [string, string]; // two input shard ids
  outputQuantity: number; // how many of the output are produced per fusion
}

export interface FusionData {
  shards: Record<string, ShardMeta>;
  recipes: Record<string, Recipe[]>;
}

// ---- Bazaar (Hypixel API v2) ----

export interface BazaarEntry {
  buyPrice: number; // insta-buy unit price (what you pay to buy NOW)
  sellPrice: number; // insta-sell unit price (what you get selling NOW)
  buyVolume: number;
  sellVolume: number;
  buyMovingWeek: number; // demand: units bought over last week
  sellMovingWeek: number; // supply: units sold over last week
}

export type Bazaar = Record<string, BazaarEntry>; // keyed by internal_id (SHARD_*)

// ---- Acquisition mode ----

export type Mode = "instabuy" | "buyorder";

// ---- Calculation results ----

export interface RecipeChoice {
  recipe: Recipe | null; // null => acquire directly (buy from bazaar / hunt)
}

export interface CalcResult {
  minCosts: Map<string, number>; // cheapest cost to OBTAIN 1 of shard (min of direct-buy vs fuse)
  choices: Map<string, RecipeChoice>;
}

export interface TreeNode {
  id: string;
  qtyNeeded: number; // how many of this shard are needed at this position in the tree
  method: "fuse" | "buy" | "unobtainable";
  unitCost: number; // cheapest cost for ONE of this shard
  // for fuse:
  recipe?: Recipe;
  children?: TreeNode[];
}

export interface FusionProfit {
  target: ShardMeta;
  recipe: Recipe; // the chosen cheapest top-level fusion recipe
  fusionCostPerUnit: number; // cost to fuse-produce one target shard
  sellPerUnit: number; // revenue per target shard (per mode)
  // per single fusion craft (which yields recipe.outputQuantity targets):
  craftCost: number;
  craftRevenue: number;
  craftProfit: number;
  marginPct: number; // craftProfit / craftCost * 100
  outputQuantity: number;
  sellMovingWeek: number; // liquidity of the OUTPUT shard
  buyMovingWeek: number;
}

// ---- Inventory mode ("fuse what I have") ----

export interface InventoryOpts {
  owned: Set<string>; // shard ids the player owns (treated as free / sunk cost)
  allowBuy: boolean; // may we buy non-owned shards to complete fusions?
}

export interface InventoryResult {
  target: ShardMeta;
  recipe: Recipe; // cheapest top-level recipe (owned shards free)
  perUnitCost: number; // bought-shard cost + fusion fees per output (owned free)
  sellPerUnit: number; // sell-order value per output
  perUnitProfit: number;
  maxUnits: number; // how many you can make, limited by your owned shards
  totalProfit: number;
  consumed: { id: string; qty: number }[]; // your shards used up (for maxUnits)
  buyPerUnit: { id: string; qty: number; cost: number }[]; // shards you'd buy (for maxUnits)
}

// ---- Price manipulation / spike detection (Coflnet history) ----

export interface SpikeInfo {
  status: "loading" | "ok" | "spike" | "nodata" | "error";
  // pump (output side): live buy price vs recent buy baseline
  changePct?: number;
  baseline?: number;
  current?: number;
  // dump (buy-order input side): live sell price vs recent sell baseline
  dumped?: boolean;
  dumpPct?: number;
  sellBaseline?: number;
  sellCurrent?: number;
}

// Saved quantities are per output unit, so editing a pin never replans its path.
export interface PinnedNode {
  id: string;
  quantityPerUnit: number;
  recipe?: Recipe;
  children?: [PinnedNode, PinnedNode];
}
export interface PinnedFusion {
  id: string;
  shardId: string;
  quantityInput: string;
  mode: Mode;
  penalty: number;
  tree: PinnedNode;
}
