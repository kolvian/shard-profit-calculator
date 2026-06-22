import type { BazaarEntry, FusionData, Recipe, ShardMeta } from "../types";

const BASE = import.meta.env.BASE_URL;

interface RawFusionData {
  recipes: Record<string, Record<string, [string, string][]>>;
  shards: Record<string, Omit<ShardMeta, "id">>;
}

let cache: Promise<FusionData> | null = null;

/**
 * Loads and normalises the vendored fusion dataset.
 * - recipes:  { outputId: { qty: [[a,b], ...] } }  ->  { outputId: Recipe[] }
 * - shards:   adds the `id` field onto each shard meta
 */
export function loadFusionData(): Promise<FusionData> {
  if (cache) return cache;
  cache = (async () => {
    const [fusionRes, ratesRes] = await Promise.all([
      fetch(`${BASE}data/fusion-data.json`),
      fetch(`${BASE}data/rates.json`),
    ]);
    const raw: RawFusionData = await fusionRes.json();
    const rates: Record<string, number> = await ratesRes.json();

    const shards: Record<string, ShardMeta> = {};
    for (const id in raw.shards) {
      shards[id] = { ...raw.shards[id], id };
    }

    const recipes: Record<string, Recipe[]> = {};
    for (const outputId in raw.recipes) {
      const list: Recipe[] = [];
      const seen = new Set<string>();
      for (const qtyStr in raw.recipes[outputId]) {
        const outputQuantity = parseInt(qtyStr, 10);
        for (const inputs of raw.recipes[outputId][qtyStr]) {
          // dedupe order-insensitive pairs (dataset lists both [a,b] and [b,a])
          const key = [...inputs].sort().join("|") + "@" + outputQuantity;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!shards[inputs[0]] || !shards[inputs[1]]) continue; // skip malformed
          list.push({ inputs: [inputs[0], inputs[1]], outputQuantity });
        }
      }
      recipes[outputId] = list;
    }

    // record hunting rate so we can tell huntable (basic) shards from fusion-only ones
    for (const id in shards) {
      baseRate[id] = rates[id] ?? 0;
    }

    return { shards, recipes };
  })();
  return cache;
}

/** id -> hunting rate from rates.json (0 = not directly huntable). */
export const baseRate: Record<string, number> = {};

/**
 * Minimum 7d insta-sell volume as a fraction of 7d insta-buy volume for a shard
 * to count as realistically obtainable. If hunters aren't insta-selling enough
 * (sellMovingWeek < this × buyMovingWeek), buy orders won't fill, so we don't
 * treat it as huntable even when its hunting rate is > 0.
 */
export const HUNT_LIQUIDITY_RATIO = 0.5;

/** Is this shard realistically obtainable directly (huntable + liquid enough)? */
export function isHuntable(id: string, entry?: BazaarEntry): boolean {
  if ((baseRate[id] ?? 0) <= 0) return false;
  if (!entry) return true; // bazaar not loaded yet → fall back to rate only
  if (entry.buyMovingWeek <= 0) return true; // no demand to compare against
  return entry.sellMovingWeek >= HUNT_LIQUIDITY_RATIO * entry.buyMovingWeek;
}
