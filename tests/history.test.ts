// @vitest-environment jsdom
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import {
  HistoryClient,
  comparePrices,
  parseEntry,
  gateDelay,
  retryDelay,
  baselinesFromHistory,
} from "../src/services/history";

const now = Date.parse("2026-09-08T00:00:00Z");
const points = [0, 1, 2].map((i) => ({
  buy: 100,
  sell: 100,
  timestamp: new Date(now - i * 1000).toISOString(),
}));
const success = () => new Response(JSON.stringify(points));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => success()),
  );
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("promotes selected shards, deduplicates repeated requests, and spaces starts", async () => {
  const c = new HistoryClient();
  c.request(["SHARD_A", "SHARD_B", "SHARD_C"]);
  c.request(["SHARD_C"], 0);
  c.request(["SHARD_C"], 0);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0][0]).toContain("SHARD_C");
  await vi.advanceTimersByTimeAsync(999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1002);
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("never overlaps requests, including when a pending request is requested again", async () => {
  let resolve!: (r: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const c = new HistoryClient();
  c.request(["SHARD_A", "SHARD_B"]);
  await vi.advanceTimersByTimeAsync(0);
  c.request(["SHARD_A"], 0);
  await vi.advanceTimersByTimeAsync(3000);
  expect(fetch).toHaveBeenCalledTimes(1);
  resolve(success());
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("reuses persisted baselines on a new client and distinguishes insufficient data", async () => {
  const c = new HistoryClient(localStorage);
  c.request(["SHARD_A"]);
  await vi.advanceTimersByTimeAsync(0);
  const next = new HistoryClient(localStorage);
  next.request(["SHARD_A"]);
  expect(comparePrices(next.getSnapshot().SHARD_A, 140, 40)).toMatchObject({
    status: "spike",
    dumped: true,
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.mocked(fetch).mockResolvedValueOnce(new Response("[]"));
  next.request(["SHARD_EMPTY"]);
  await vi.advanceTimersByTimeAsync(0);
  expect(next.getSnapshot().SHARD_EMPTY.expiresAt).toBe(Date.now() + 600000);
  expect(comparePrices(next.getSnapshot().SHARD_EMPTY, 140, 40).status).toBe(
    "nodata",
  );
});

test("validates persisted entries and rejects expired, malformed and future data", () => {
  const e = {
    status: "ready",
    baseline: { buy: 100, sell: 100 },
    expiresAt: now + 100,
  };
  expect(parseEntry(JSON.stringify(e))).toEqual(e);
  for (const raw of [
    "broken",
    "{}",
    JSON.stringify({ ...e, expiresAt: now }),
    JSON.stringify({ ...e, baseline: { buy: -1, sell: 100 } }),
    JSON.stringify({ ...e, expiresAt: now + 7200000 }),
  ])
    expect(parseEntry(raw)).toBeUndefined();
});

test("expired cache and blocked storage both fetch safely", async () => {
  localStorage.setItem(
    "shard-history-v1:SHARD_A",
    JSON.stringify({ status: "ready", baseline: null, expiresAt: now - 1 }),
  );
  const c = new HistoryClient(localStorage);
  c.request(["SHARD_A"]);
  await vi.advanceTimersByTimeAsync(0);
  const broken = {
    getItem() {
      throw new Error("disabled");
    },
  } as unknown as Storage;
  const fallback = new HistoryClient(broken);
  fallback.request(["SHARD_B"]);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("enforces both rolling windows as well as one-second spacing", () => {
  expect(gateDelay({ calls: [now - 500], cooldown: 0 }, now)).toBe(500);
  expect(
    gateDelay({ calls: Array(30).fill(now - 2000), cooldown: 0 }, now),
  ).toBe(8000);
  expect(
    gateDelay({ calls: Array(100).fill(now - 20000), cooldown: 0 }, now),
  ).toBe(40000);
  expect(
    gateDelay({ calls: Array(100).fill(now - 60000), cooldown: 0 }, now),
  ).toBe(0);
});

test("429 pauses the entire queue and honors Retry-After", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response("", { status: 429, headers: { "Retry-After": "10" } }),
  );
  const c = new HistoryClient();
  c.request(["SHARD_A", "SHARD_B"]);
  await vi.advanceTimersByTimeAsync(9999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("Retry-After supports dates and bounded exponential fallback", () => {
  expect(retryDelay(new Date(now + 30000).toUTCString(), 1)).toBe(30000);
  expect(retryDelay(null, 1)).toBe(60000);
  expect(retryDelay("invalid", 3)).toBe(240000);
});

test("transient failures stop after three attempts, are errors not safe, and can retry later", async () => {
  vi.mocked(fetch).mockImplementation(
    async () => new Response("", { status: 503 }),
  );
  const c = new HistoryClient();
  c.request(["SHARD_A"]);
  await vi.advanceTimersByTimeAsync(6100);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(comparePrices(c.getSnapshot().SHARD_A, 100, 100).status).toBe("error");
  c.request(["SHARD_A"]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetch).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(60000);
  c.request(["SHARD_A"]);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(4);
});

test("aborts stalled requests after 15 seconds", async () => {
  vi.mocked(fetch).mockImplementation(
    (_url, opts) =>
      new Promise((_resolve, reject) =>
        opts?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      ),
  );
  const c = new HistoryClient();
  c.request(["SHARD_A"]);
  await vi.advanceTimersByTimeAsync(15000);
  expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(2001);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("cross-tab storage updates publish shared baselines and cancel queued duplicates", async () => {
  const c = new HistoryClient(localStorage);
  const listener = vi.fn();
  c.subscribe(listener);
  c.request(["SHARD_A"]);
  c.acceptStorage(
    "shard-history-v1:SHARD_A",
    JSON.stringify({
      status: "ready",
      baseline: { buy: 100, sell: 100 },
      expiresAt: now + 3600000,
    }),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(listener).toHaveBeenCalledOnce();
});

test("two tabs share reservations, cooldown and cached responses under a lock", async () => {
  let tail = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: (_name: string, work: () => Promise<void>) => {
        const result = tail.then(work);
        tail = result;
        return result;
      },
    },
  });
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response("", { status: 429, headers: { "Retry-After": "10" } }),
  );
  const a = new HistoryClient(localStorage),
    b = new HistoryClient(localStorage);
  a.request(["SHARD_A"]);
  b.request(["SHARD_A", "SHARD_B"]);
  await vi.advanceTimersByTimeAsync(9999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2002);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(a.getSnapshot().SHARD_A.status).toBe("ready");
});

test("uses newest sparse points and keeps original threshold boundaries", () => {
  expect(baselinesFromHistory(points)).toEqual({ buy: 100, sell: 100 });
  expect(() => baselinesFromHistory({ error: "bad" })).toThrow();
  const entry = {
    baseline: { buy: 100, sell: 100 },
    status: "ready" as const,
    expiresAt: now + 1000,
  };
  expect(comparePrices(entry, 130, 50)).toMatchObject({
    status: "spike",
    dumped: true,
  });
  expect(comparePrices(entry, 129, 51)).toMatchObject({
    status: "ok",
    dumped: false,
  });
});
