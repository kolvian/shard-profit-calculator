// @vitest-environment jsdom
import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import App from "../src/App";
import type { Bazaar, FusionData } from "../src/types";
import { baseRate } from "../src/services/data";
import { rankFusionsFull, rankInventoryFusions } from "../src/services/calc";
import { InventoryView } from "../src/components/InventoryView";

const fixture = vi.hoisted(() => {
  const shards = Object.fromEntries(
    ["A", "B", "C"].map((id, i) => [
      id,
      {
        id,
        internal_id: `SHARD_${id}`,
        name: ["Alpha", "Beta", "Gamma"][i],
        family: "Test Family",
        rarity: "common",
        type: "Global",
        fuse_amount: 1,
      },
    ]),
  );
  const data = {
    shards,
    recipes: { C: [{ inputs: ["A", "B"], outputQuantity: 1 }] },
  };
  const entry = (buyPrice: number) => ({
    buyPrice,
    sellPrice: 100,
    buyVolume: 1,
    sellVolume: 1,
    buyMovingWeek: 100,
    sellMovingWeek: 100,
  });
  return {
    data,
    bazaar: { SHARD_A: entry(100), SHARD_B: entry(100), SHARD_C: entry(400) },
  };
});
vi.mock("../src/services/data", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadFusionData: vi.fn(async () => fixture.data),
}));
vi.mock("../src/services/bazaar", () => ({
  fetchBazaar: vi.fn(async () => ({
    bazaar: structuredClone(fixture.bazaar),
    lastUpdated: Date.now(),
  })),
}));
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("StrictMode detail and browser share late history results and both follow refreshed prices", async () => {
  vi.useFakeTimers();
  localStorage.clear();
  let resolve!: (value: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]).toEqual(
    expect.arrayContaining([expect.stringContaining("SHARD_C")]),
  );
  // Live price changes while the selected history request is still pending.
  fixture.bazaar.SHARD_C.buyPrice = 250;
  fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
  await act(async () => {});
  const points = [0, 1, 2].map((i) => ({
    buy: 200,
    sell: 100,
    timestamp: new Date(Date.now() - i * 1000).toISOString(),
  }));
  await act(async () => {
    resolve(new Response(JSON.stringify(points)));
  });
  expect(screen.queryByText("⚠ manipulated")).toBeNull();
  expect(screen.queryByText(/⚠ pump /)).toBeNull();
  fixture.bazaar.SHARD_C.buyPrice = 400;
  fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
  await act(async () => {});
  expect(screen.getByText("⚠ manipulated")).toBeTruthy();
  expect(screen.getByText(/⚠ pump /)).toBeTruthy();
  fixture.bazaar.SHARD_C.buyPrice = 250;
  fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
  await act(async () => {});
  expect(screen.queryByText("⚠ manipulated")).toBeNull();
  expect(screen.queryByText(/⚠ pump /)).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("dump state updates both cost engines and invalidates inventory memoization", () => {
  baseRate.A = 1;
  baseRate.B = 1;
  const data = fixture.data as FusionData;
  const bazaar = fixture.bazaar as Bazaar;
  const clear = new Set<string>(),
    dumped = new Set(["SHARD_B"]);
  expect(rankFusionsFull(data, bazaar, "buyorder", 0, clear).list).toHaveLength(
    1,
  );
  expect(
    rankFusionsFull(data, bazaar, "buyorder", 0, dumped).list,
  ).toHaveLength(0);
  expect(
    rankInventoryFusions(data, bazaar, "buyorder", 0, { A: 1 }, true, clear)
      .list,
  ).toHaveLength(1);
  expect(
    rankInventoryFusions(data, bazaar, "buyorder", 0, { A: 1 }, true, dumped)
      .list,
  ).toHaveLength(0);
  const props = {
    data,
    bazaar,
    mode: "buyorder" as const,
    penalty: 0,
    spikes: {},
    inventory: { A: 1 },
    setInventory: vi.fn(),
    buyMissing: true,
    setBuyMissing: vi.fn(),
  };
  const view = render(<InventoryView {...props} dumped={clear} />);
  expect(screen.getByText("Gamma")).toBeTruthy();
  view.rerender(<InventoryView {...props} dumped={dumped} />);
  expect(screen.queryByText("Gamma")).toBeNull();
  view.rerender(<InventoryView {...props} dumped={clear} />);
  expect(screen.getByText("Gamma")).toBeTruthy();
});
