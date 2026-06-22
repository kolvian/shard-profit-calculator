import type { Bazaar } from "../types";

const BAZAAR_URL = "https://api.hypixel.net/v2/skyblock/bazaar";

interface RawProduct {
  quick_status: {
    buyPrice: number;
    sellPrice: number;
    buyVolume: number;
    sellVolume: number;
    buyMovingWeek: number;
    sellMovingWeek: number;
  };
}

export interface BazaarSnapshot {
  bazaar: Bazaar;
  lastUpdated: number;
}

/** Fetch the full live bazaar and keep only SHARD_* products. */
export async function fetchBazaar(): Promise<BazaarSnapshot> {
  const res = await fetch(BAZAAR_URL);
  if (!res.ok) throw new Error(`Bazaar request failed: ${res.status}`);
  const json: {
    success: boolean;
    lastUpdated: number;
    products: Record<string, RawProduct>;
  } = await res.json();
  if (!json.success) throw new Error("Bazaar request returned success=false");

  const bazaar: Bazaar = {};
  for (const id in json.products) {
    if (!id.startsWith("SHARD_")) continue;
    const q = json.products[id].quick_status;
    bazaar[id] = {
      buyPrice: q.buyPrice,
      sellPrice: q.sellPrice,
      buyVolume: q.buyVolume,
      sellVolume: q.sellVolume,
      buyMovingWeek: q.buyMovingWeek,
      sellMovingWeek: q.sellMovingWeek,
    };
  }
  return { bazaar, lastUpdated: json.lastUpdated };
}
