import { useMemo, useState } from "react";
import { useAppData } from "./hooks/useAppData";
import { ModeToggle } from "./components/ModeToggle";
import { FusionRow } from "./components/FusionRow";
import { FusionDetail } from "./components/FusionDetail";
import { InventoryView } from "./components/InventoryView";
import { timeAgo } from "./lib/format";

type SortKey = "profit" | "margin";
type Tab = "browse" | "inventory";

export default function App() {
  const { mode, setMode, penalty, setPenalty, data, bazaar, ranked, spikes, lastUpdated, loading, refreshing, error, refresh } =
    useAppData();

  const [tab, setTab] = useState<Tab>("browse");
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [buyMissing, setBuyMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("profit");
  const [search, setSearch] = useState("");
  const [hideUnprofitable, setHideUnprofitable] = useState(true);
  const [minDemand, setMinDemand] = useState(0);

  const filtered = useMemo(() => {
    if (!ranked) return [];
    let l = ranked.list;
    const q = search.trim().toLowerCase();
    if (q) l = l.filter((fp) => fp.target.name.toLowerCase().includes(q));
    if (hideUnprofitable) l = l.filter((fp) => fp.craftProfit > 0);
    if (minDemand > 0) l = l.filter((fp) => fp.buyMovingWeek >= minDemand);
    l = [...l].sort((a, b) =>
      sort === "profit" ? b.craftProfit - a.craftProfit : b.marginPct - a.marginPct,
    );
    return l;
  }, [ranked, search, hideUnprofitable, minDemand, sort]);

  const selected = useMemo(
    () =>
      ranked && selectedId ? ranked.list.find((fp) => fp.target.id === selectedId) ?? null : null,
    [ranked, selectedId],
  );


  return (
    <div className="mx-auto min-h-screen max-w-7xl px-3 py-5 sm:px-6">
      {/* header */}
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-white">
            <span className="text-accent">◆</span> Shard Fusion Profit
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Live Hypixel SkyBlock bazaar · cheapest fusion path ·{" "}
            {ranked ? ranked.list.length : "…"} fuseable shards
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeToggle mode={mode} onChange={setMode} />
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 disabled:opacity-50"
          >
            {refreshing ? "↻ …" : "↻ Refresh"}
          </button>
        </div>
      </header>

      {/* tabs */}
      <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-ink-900 p-1">
        {([
          ["browse", "Browse fusions"],
          ["inventory", "My shards"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              tab === t ? "bg-accent text-white shadow-glow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          Failed to load data: {error}. The Hypixel/Coflnet APIs may be temporarily unavailable — try
          Refresh.
        </div>
      )}

      {loading && !ranked ? (
        <LoadingState />
      ) : tab === "inventory" ? (
        data && bazaar ? (
          <InventoryView
            data={data}
            bazaar={bazaar}
            mode={mode}
            penalty={penalty}
            spikes={spikes}
            inventory={inventory}
            setInventory={setInventory}
            buyMissing={buyMissing}
            setBuyMissing={setBuyMissing}
          />
        ) : (
          <LoadingState />
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(460px,580px)]">
          {/* list */}
          <main className="min-w-0">
            {/* controls */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search shard…"
                className="min-w-[140px] flex-1 rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent/50 focus:outline-none"
              />
              <div className="inline-flex rounded-xl border border-white/10 bg-ink-900 p-1">
                {(["profit", "margin"] as SortKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSort(k)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                      sort === k ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <select
                value={minDemand}
                onChange={(e) => setMinDemand(Number(e.target.value))}
                className="rounded-xl border border-white/10 bg-ink-900 px-2 py-2 text-sm text-slate-300 focus:outline-none"
                title="Minimum weekly buy demand for the output shard"
              >
                <option value={0}>Any demand</option>
                <option value={1000}>≥ 1k/wk</option>
                <option value={10000}>≥ 10k/wk</option>
                <option value={100000}>≥ 100k/wk</option>
              </select>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={hideUnprofitable}
                  onChange={(e) => setHideUnprofitable(e.target.checked)}
                  className="accent-accent"
                />
                Profitable only
              </label>
              <label
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-slate-300"
                title="Flat coin cost added per fusion craft — applies to the whole list and detail (e.g. your time, bazaar tax, or hassle)."
              >
                <span className="text-slate-500">⚒ fee/craft</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={penalty}
                  onChange={(e) => setPenalty(Math.max(0, Number(e.target.value) || 0))}
                  className="num w-24 rounded-lg border border-white/10 bg-ink-950 px-2 py-1 text-right text-slate-100 focus:border-accent/50 focus:outline-none"
                />
              </label>
            </div>

            {/* column header (desktop) */}
            <div className="mb-1 hidden grid-cols-[28px_minmax(0,1.6fr)_minmax(0,1fr)_repeat(3,minmax(0,0.9fr))] gap-3 px-3 text-[10px] uppercase tracking-wider text-slate-600 sm:grid">
              <span className="text-right">#</span>
              <span>Shard</span>
              <span>Recipe</span>
              <span className="text-right">Cost</span>
              <span className="text-right">Profit</span>
              <span className="text-right">Margin / demand</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {data &&
                filtered.map((fp, i) => (
                  <FusionRow
                    key={fp.target.id}
                    fp={fp}
                    data={data}
                    rank={i + 1}
                    selected={fp.target.id === selectedId}
                    spike={spikes[fp.target.internal_id]}
                    onSelect={() => setSelectedId(fp.target.id)}
                  />
                ))}
              {filtered.length === 0 && (
                <div className="rounded-xl border border-white/5 bg-ink-850/50 px-4 py-10 text-center text-sm text-slate-500">
                  No fusions match your filters.
                </div>
              )}
            </div>

            <FooterNote lastUpdated={lastUpdated} />
          </main>

          {/* detail */}
          <aside
            className={
              selected
                ? "fixed inset-0 z-50 bg-ink-950/95 p-3 backdrop-blur lg:static lg:z-0 lg:bg-transparent lg:p-0"
                : "hidden lg:block"
            }
          >
            <div className="card h-full overflow-hidden lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
              {selected && data && bazaar && ranked ? (
                <FusionDetail
                  fp={selected}
                  data={data}
                  bazaar={bazaar}
                  calc={ranked.calc}
                  mode={mode}
                  penalty={penalty}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                <Placeholder />
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Placeholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 text-4xl text-slate-700">◆</div>
      <p className="text-sm text-slate-500">
        Select a fusion to see the cheapest way to make it — shard icons, buy methods, and 6h
        price-spike warnings.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-white/5 bg-ink-850/50" />
      ))}
    </div>
  );
}

function FooterNote({ lastUpdated }: { lastUpdated: number | null }) {
  return (
    <div className="mt-5 space-y-1.5 border-t border-white/5 pt-4 text-xs text-slate-600">
      <p>
        Bazaar updated {lastUpdated ? timeAgo(lastUpdated) : "…"} · auto-refresh 60s. Prices from the
        Hypixel API; 6h spike check via Coflnet history. Fusion recipes from the community SkyShards
        dataset.
      </p>
      <p>
        <span className="text-slate-500">Insta-buy</span> prices every ingredient at its bazaar buy
        price. <span className="text-slate-500">Buy order</span> only buys huntable (basic) shards —
        fusion-only shards are decomposed to huntable leaves, since fuseable shards aren&apos;t
        realistic to buy-order. Revenue always assumes selling the output via a{" "}
        <span className="text-slate-500">sell order</span>. List profit is per single fusion craft;
        open a fusion to set a target quantity and see the full bill of materials. ⚠ flags shards
        pumped ≥30% above their recent (7-day) median; in buy-order mode, inputs whose price has
        crashed ≥50% below their median are excluded as manipulated (their buy-order cost is unreal).
        Huntable shards also require 7d insta-sell volume ≥50% of insta-buy volume.
      </p>
    </div>
  );
}
