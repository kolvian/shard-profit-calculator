# Shard Fusion Profit · Hypixel SkyBlock

A React webapp that ranks the most profitable **attribute shard fusions** using **live bazaar prices**, then shows the cheapest way to fuse each one — with shard icons, instabuy/buy-order toggling, and 7-day price-manipulation warnings.

## How it works

1. **Recipes** come from the community-maintained [SkyShards](https://github.com/Campionnn/SkyShards) dataset (`public/data/fusion-data.json`), so fusion combinations are real, not guessed. Each shard maps to its bazaar product via `internal_id` (`SHARD_*`).
2. **Live prices** are pulled directly from the Hypixel Bazaar API (`/v2/skyblock/bazaar`) in the browser (CORS-enabled), auto-refreshing every 60s.
3. **Cheapest cost** for every shard is computed with a Bellman-Ford-style worklist relaxation: `cost(target) = min(buy directly, min over recipes of (cost(inA)·fuseA + cost(inB)·fuseB) / outputQty)`.
4. **Profit** = revenue from selling the fused output − cheapest cost to fuse it. Sortable by total profit or margin.
5. **Manipulation flag**: the app prioritizes selected and visible shards while fetching 7-day price history from [Coflnet](https://sky.coflnet.com) for dataset shards and flags any whose current buy price is ≥30% above its 7-day median.

## Acquisition modes

- **Insta-buy** — every ingredient is bought instantly at its bazaar buy price, output sold instantly (insta-sell). Realistic fast-flip numbers (thin margins).
- **Buy order** — only **huntable / basic shards** (hunting rate > 0) can be bought, at the buy-order price. Fusion-only shards are **decomposed down to huntable leaves**, because fuseable shards aren't realistic to acquire via buy orders. Output sold via sell order.

> Buy-order mode shows theoretical-maximum margins; thinly-traded leaves can look absurdly profitable. Use the demand filter and watch the spike warnings.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
```

## Data refresh

Bazaar prices are live. The fusion recipe dataset is a vendored snapshot (the upstream repo auto-updates it); re-pull `public/data/*.json` and `public/shardIcons/*` from SkyShards to update recipes/icons.

History requests run sequentially at most once per second, respecting both Coflnet rate windows (30/10 seconds and 100/minute) and shared cooldowns. Fresh baselines are cached locally for one hour; insufficient history for ten minutes. Live prices are still compared on every Bazaar refresh. Selected fusions, their ingredients, and visible rows share one warning map. Web Locks and localStorage coordinate requests across tabs where available; other traffic on the same IP can still trigger throttling. A cold sweep of 321 shards takes about 5.4 minutes or longer, while cached checks require no history request.
