# Shard Fusion Profit · Hypixel SkyBlock

A React webapp that ranks the most profitable **attribute shard fusions** using **live bazaar prices**, then shows the cheapest way to fuse each one — with shard icons, instabuy/buy-order toggling, and 6-hour price-manipulation warnings.

## How it works

1. **Recipes** come from the community-maintained [SkyShards](https://github.com/Campionnn/SkyShards) dataset (`public/data/fusion-data.json`), so fusion combinations are real, not guessed. Each shard maps to its bazaar product via `internal_id` (`SHARD_*`).
2. **Live prices** are pulled directly from the Hypixel Bazaar API (`/v2/skyblock/bazaar`) in the browser (CORS-enabled), auto-refreshing every 60s.
3. **Cheapest cost** for every shard is computed with a Bellman-Ford-style worklist relaxation: `cost(target) = min(buy directly, min over recipes of (cost(inA)·fuseA + cost(inB)·fuseB) / outputQty)`.
4. **Profit** = revenue from selling the fused output − cheapest cost to fuse it. Sortable by total profit or margin.
5. **Manipulation flag**: when you open a fusion, the app fetches 6h price history from [Coflnet](https://sky.coflnet.com) for the shards involved and flags any whose current buy price is ≥25% above its 6h median.

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
