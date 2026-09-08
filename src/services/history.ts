import type { SpikeInfo } from "../types";

const PREFIX = "shard-history-v1:";
const GATE_KEY = `${PREFIX}gate`;
const HOUR = 3_600_000;
export interface Baselines {
  buy: number;
  sell: number;
}
export interface HistoryEntry {
  baseline: Baselines | null;
  status: "ready" | "error";
  expiresAt: number;
}
interface Gate {
  calls: number[];
  cooldown: number;
}
interface Job {
  priority: number;
  attempts: number;
  readyAt: number;
}
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

export function parseEntry(
  raw: string | null,
  now = Date.now(),
): HistoryEntry | undefined {
  try {
    const e = JSON.parse(raw ?? "null");
    if (
      !e ||
      e.status !== "ready" ||
      !finite(e.expiresAt) ||
      e.expiresAt <= now ||
      e.expiresAt > now + HOUR
    )
      return;
    if (
      e.baseline !== null &&
      (!e.baseline ||
        !finite(e.baseline.buy) ||
        !finite(e.baseline.sell) ||
        e.baseline.buy < 0 ||
        e.baseline.sell < 0)
    )
      return;
    return e;
  } catch {
    return;
  }
}

function median(values: number[]): number {
  const s = values.sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) : 0;
}

export function baselinesFromHistory(
  value: unknown,
  now = Date.now(),
): Baselines | null {
  if (
    !Array.isArray(value) ||
    value.some(
      (p) => !p || typeof p !== "object" || typeof p.timestamp !== "string",
    )
  )
    throw new Error("Invalid history response");
  const points = value
    .filter((p) => Number.isFinite(Date.parse(p.timestamp)))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const recent = points.filter(
    (p) => Date.parse(p.timestamp) >= now - 7 * 86400_000,
  );
  const window = recent.length >= 3 ? recent : points.slice(0, 14);
  const buys = window.map((p) => p.buy).filter((x) => finite(x) && x > 0);
  const sells = window.map((p) => p.sell).filter((x) => finite(x) && x > 0);
  return buys.length < 3 && sells.length < 3
    ? null
    : { buy: median(buys), sell: median(sells) };
}

export function comparePrices(
  entry: HistoryEntry | undefined,
  buy: number,
  sell: number,
  now = Date.now(),
): SpikeInfo {
  if (!entry || (entry.status === "ready" && entry.expiresAt <= now))
    return { status: "loading" };
  if (entry.status === "error") return { status: "error" };
  if (!entry.baseline) return { status: "nodata" };
  const { buy: baseline, sell: sellBaseline } = entry.baseline;
  const current = buy > 0 ? buy : baseline;
  const changePct = baseline > 0 ? (current - baseline) / baseline : 0;
  const dumpPct =
    sellBaseline > 0 && sell > 0 ? (sell - sellBaseline) / sellBaseline : 0;
  return {
    status: changePct >= 0.3 ? "spike" : "ok",
    changePct,
    baseline,
    current,
    dumped: sellBaseline > 0 && sell > 0 && sell <= sellBaseline * 0.5,
    dumpPct,
    sellBaseline,
    sellCurrent: sell,
  };
}

export function gateDelay(gate: Gate, now: number): number {
  const calls = gate.calls
    .filter((t) => now - t < 60_000)
    .sort((a, b) => a - b);
  const short = calls.filter((t) => now - t < 10_000);
  return Math.max(
    0,
    gate.cooldown - now,
    (calls.at(-1) ?? -Infinity) + 1000 - now,
    short.length >= 30 ? short[short.length - 30] + 10_000 - now : 0,
    calls.length >= 100 ? calls[calls.length - 100] + 60_000 - now : 0,
  );
}

export function retryDelay(
  header: string | null,
  attempts: number,
  now = Date.now(),
): number {
  const seconds =
    header && /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : NaN;
  const date = header ? Date.parse(header) - now : NaN;
  return Math.max(
    1000,
    Number.isFinite(seconds)
      ? seconds
      : Number.isFinite(date) && date > 0
        ? date
        : 60_000 * 2 ** (attempts - 1),
  );
}

/** A single queue survives React effects and Bazaar refreshes. Locks also serialize tabs. */
export class HistoryClient {
  private entries: Record<string, HistoryEntry> = {};
  private listeners = new Set<() => void>();
  private queue = new Map<string, Job>();
  private gate: Gate = { calls: [], cooldown: 0 };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private storage: Storage | undefined;
  private activeId: string | undefined;

  constructor(storage?: Storage) {
    this.storage = storage;
  }
  getSnapshot = () => this.entries;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(id: string, entry: HistoryEntry) {
    this.entries = { ...this.entries, [id]: entry };
    this.listeners.forEach((fn) => fn());
  }
  private read(key: string) {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      this.storage = undefined;
      return null;
    }
  }
  private write(key: string, value: unknown) {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
    } catch {
      this.storage = undefined;
    }
  }
  acceptStorage = (key: string | null, value: string | null) => {
    if (!key?.startsWith(PREFIX) || key === GATE_KEY) return;
    const entry = parseEntry(value);
    if (entry) {
      const id = key.slice(PREFIX.length);
      this.queue.delete(id);
      this.publish(id, entry);
    }
  };
  request = (ids: string[], priority = 3) => {
    for (const id of new Set(ids)) {
      if (!/^SHARD_[A-Z0-9_]+$/.test(id)) continue;
      const cached = this.entries[id];
      if (cached && cached.expiresAt > Date.now()) continue;
      const stored = parseEntry(this.read(PREFIX + id));
      if (stored) {
        this.publish(id, stored);
        continue;
      }
      const job = this.queue.get(id);
      if (job) job.priority = Math.min(priority, job.priority);
      else if (this.activeId !== id)
        this.queue.set(id, { priority, attempts: 0, readyAt: 0 });
    }
    this.wake();
  };
  private wake(delay = 0) {
    if (this.running) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.run();
    }, delay);
  }
  private loadGate() {
    try {
      const g = JSON.parse(this.read(GATE_KEY) ?? "null");
      if (
        g &&
        Array.isArray(g.calls) &&
        g.calls.every(finite) &&
        finite(g.cooldown)
      )
        this.gate = g;
    } catch {
      /* Keep the local gate when storage is corrupt. */
    }
  }
  private async run() {
    if (this.running || !this.queue.size) return;
    this.running = true;
    let wait = 0;
    const work = async () => {
      this.loadGate();
      wait = gateDelay(this.gate, Date.now());
      if (wait) return;
      const jobs = [...this.queue]
        .filter(([, j]) => j.readyAt <= Date.now())
        .sort((a, b) => a[1].priority - b[1].priority);
      if (!jobs.length) {
        wait = Math.max(
          1,
          Math.min(...[...this.queue.values()].map((j) => j.readyAt)) -
            Date.now(),
        );
        return;
      }
      const [id, job] = jobs[0];
      const cached = parseEntry(this.read(PREFIX + id));
      if (cached) {
        this.queue.delete(id);
        this.publish(id, cached);
        return;
      }
      this.activeId = id;
      this.gate.calls = this.gate.calls.filter((t) => Date.now() - t < 60_000);
      this.gate.calls.push(Date.now());
      this.write(GATE_KEY, this.gate);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      job.attempts++;
      try {
        const response = await fetch(
          `https://sky.coflnet.com/api/bazaar/${id}/history`,
          { signal: controller.signal },
        );
        if (response.status === 429) {
          this.gate.cooldown =
            Date.now() +
            retryDelay(response.headers.get("Retry-After"), job.attempts);
          this.write(GATE_KEY, this.gate);
        }
        if (!response.ok) {
          if (response.status !== 429 && response.status < 500)
            job.attempts = 3;
          throw new Error(`History HTTP ${response.status}`);
        }
        const baseline = baselinesFromHistory(await response.json());
        const entry: HistoryEntry = {
          baseline,
          status: "ready",
          expiresAt: Date.now() + (baseline ? HOUR : 600_000),
        };
        this.write(PREFIX + id, entry);
        this.queue.delete(id);
        this.publish(id, entry);
      } catch {
        if (job.attempts >= 3) {
          this.queue.delete(id);
          this.publish(id, {
            baseline: null,
            status: "error",
            expiresAt: Date.now() + 60_000,
          });
        } else
          job.readyAt = Math.max(
            this.gate.cooldown,
            Date.now() + 1000 * 2 ** job.attempts,
          );
      } finally {
        clearTimeout(timeout);
        this.activeId = undefined;
      }
    };
    try {
      if (this.storage && typeof navigator !== "undefined" && navigator.locks)
        await navigator.locks.request("shard-history-fetch-v1", work);
      else await work();
    } finally {
      this.running = false;
      if (this.queue.size) this.wake(wait);
    }
  }
}

let storage: Storage | undefined;
try {
  storage = globalThis.localStorage;
} catch {
  /* Private browsing can disable storage. */
}
export const historyClient = new HistoryClient(storage);
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) =>
    historyClient.acceptStorage(e.key, e.newValue),
  );
