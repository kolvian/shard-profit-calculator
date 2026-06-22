import type { SpikeInfo } from "../types";

const HISTORY_URL = (tag: string) => `https://sky.coflnet.com/api/bazaar/${tag}/history`;

interface HistoryPoint {
  buy: number; // insta-buy price at that time (sell-order side)
  sell: number; // insta-sell price at that time (buy-order side)
  timestamp: string;
}

// PUMP: flag the OUTPUT when its live buy price is >= +30% above its recent median.
const PUMP_THRESHOLD = 0.3;
// DUMP: exclude a buy-order INPUT when its live sell price is <= 50% of its recent median.
const DUMP_THRESHOLD = 0.5;

const WINDOW_DAYS = 7;
const MIN_POINTS = 3;
const FALLBACK_POINTS = 14;

interface Baselines {
  buy: number; // median insta-buy price
  sell: number; // median insta-sell price (buy-order cost baseline)
}

const baselineCache = new Map<string, Baselines | null>(); // null = no usable history
const inflight = new Map<string, Promise<Baselines | null>>();
const dumpedCache = new Map<string, boolean>(); // synchronous read for the cost engine

// Coflnet rate-limits at 30 requests / 10s — stay under it globally.
const RL_LIMIT = 25;
const RL_WINDOW = 10_000;
const recentCalls: number[] = [];
async function rateGate(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (recentCalls.length && now - recentCalls[0] > RL_WINDOW) recentCalls.shift();
    if (recentCalls.length < RL_LIMIT) {
      recentCalls.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, RL_WINDOW - (now - recentCalls[0]) + 50));
  }
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Fetch (once) and cache the recent buy/sell baselines for a product. */
async function getBaselines(internalId: string): Promise<Baselines | null> {
  if (baselineCache.has(internalId)) return baselineCache.get(internalId)!;
  const existing = inflight.get(internalId);
  if (existing) return existing;

  const p = (async (): Promise<Baselines | null> => {
    try {
      await rateGate();
      const res = await fetch(HISTORY_URL(internalId));
      if (!res.ok) throw new Error(String(res.status));
      const points: HistoryPoint[] = await res.json();
      const cutoff = Date.now() - WINDOW_DAYS * 86400 * 1000;
      const within = points.filter((pt) => {
        const t = Date.parse(pt.timestamp);
        return Number.isFinite(t) && t >= cutoff;
      });
      // sparse/daily data → fall back to the most recent N points
      const window = within.length >= MIN_POINTS ? within : points.slice(0, FALLBACK_POINTS);
      const buys = window.map((p) => p.buy).filter((x) => typeof x === "number" && x > 0);
      const sells = window.map((p) => p.sell).filter((x) => typeof x === "number" && x > 0);
      if (buys.length < MIN_POINTS && sells.length < MIN_POINTS) {
        baselineCache.set(internalId, null);
        return null;
      }
      const b = { buy: median(buys), sell: median(sells) };
      baselineCache.set(internalId, b);
      return b;
    } catch {
      return null; // don't cache transient errors — allow retry
    } finally {
      inflight.delete(internalId);
    }
  })();

  inflight.set(internalId, p);
  return p;
}

/**
 * Compares LIVE prices against recent baselines to detect manipulation:
 *  - pump  : live buy price well above its recent median (output looks too valuable)
 *  - dump  : live sell price well below its recent median (buy-order input looks too cheap)
 * History is fetched once and cached; the live comparison is recomputed each call
 * so it stays fresh across bazaar refreshes.
 */
export async function getSpike(
  internalId: string,
  currentBuy: number,
  currentSell: number,
): Promise<SpikeInfo> {
  const base = await getBaselines(internalId);
  if (!base) {
    dumpedCache.set(internalId, false);
    return { status: "nodata" };
  }
  const { buy: buyBaseline, sell: sellBaseline } = base;

  const curBuy = currentBuy > 0 ? currentBuy : buyBaseline;
  const pumpPct = buyBaseline > 0 ? (curBuy - buyBaseline) / buyBaseline : 0;
  const pumped = pumpPct >= PUMP_THRESHOLD;

  const dumpPct = sellBaseline > 0 && currentSell > 0 ? (currentSell - sellBaseline) / sellBaseline : 0;
  const dumped = sellBaseline > 0 && currentSell > 0 && currentSell <= (1 - DUMP_THRESHOLD) * sellBaseline;
  dumpedCache.set(internalId, dumped);

  return {
    status: pumped ? "spike" : "ok",
    changePct: pumpPct,
    baseline: buyBaseline,
    current: curBuy,
    dumped,
    dumpPct,
    sellBaseline,
    sellCurrent: currentSell,
  };
}

/** Synchronous read for the cost engine: is this product's buy-order price crashed? */
export function isDumped(internalId: string): boolean {
  return dumpedCache.get(internalId) ?? false;
}
