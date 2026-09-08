import { expect, test } from "vitest";
import { buildTree, computeMinCosts } from "../src/services/calc";
import { baseRate } from "../src/services/data";
import {
  combinePins,
  pricePin,
  quantityInput,
  quantityValue,
  restorePins,
  snapshotPin,
} from "../src/services/pins";
import type { Bazaar, FusionData, TreeNode } from "../src/types";
const data: FusionData = {
  shards: Object.fromEntries(
    ["A", "B", "C", "D"].map((id) => [
      id,
      {
        id,
        name: id,
        internal_id: `SHARD_${id}`,
        family: "Test",
        rarity: "common",
        type: "Global",
        fuse_amount: 1,
      },
    ]),
  ),
  recipes: {
    C: [{ inputs: ["A", "B"], outputQuantity: 2 }],
    D: [{ inputs: ["C", "B"], outputQuantity: 1 }],
  },
};
const bazaar: Bazaar = Object.fromEntries(
  ["A", "B", "C", "D"].map((id, i) => [
    `SHARD_${id}`,
    {
      buyPrice: [20, 10, 200, 500][i],
      sellPrice: [10, 5, 100, 250][i],
      buyVolume: 1,
      sellVolume: 1,
      buyMovingWeek: 10,
      sellMovingWeek: 10,
    },
  ]),
);
const tree = () =>
  buildTree(
    "D",
    data.recipes.D[0],
    data,
    computeMinCosts(data, bazaar, "instabuy", 2),
    4,
  );

test("normalizes editable blank and zero quantities without forcing one", () => {
  expect(quantityInput("")).toBe("");
  expect(quantityValue("")).toBe(0);
  expect(quantityInput("0")).toBe("0");
  expect(quantityInput("-4")).toBe("0");
  expect(quantityInput("3.9")).toBe("3");
  expect(quantityInput("Infinity")).toBe("");
  expect(quantityInput("bad")).toBe("");
});
test("captures a deep copy, scales the frozen tree and reprices from leaves with separate fees", () => {
  const original = tree();
  const pin = snapshotPin(original, "4", "instabuy", 2);
  original.children![0].id = "B";
  const priced = pricePin(pin, data, bazaar, {});
  expect(priced.ingredientCost).toBe(100);
  expect(priced.fees).toBe(12);
  expect(priced.tree.children![0].id).toBe("C");
  const scaled = pricePin({ ...pin, quantityInput: "8" }, data, bazaar, {});
  expect(scaled.ingredientCost).toBe(200);
  expect(scaled.fees).toBe(24);
  const changed = {
    ...bazaar,
    SHARD_C: { ...bazaar.SHARD_C, buyPrice: 1 },
    SHARD_A: { ...bazaar.SHARD_A, buyPrice: 40 },
  };
  expect(pricePin(pin, data, changed, {}).ingredientCost).toBe(140);
  expect(pricePin(pin, data, changed, {}).tree.children![0].method).toBe(
    "fuse",
  );
});
test("zero and blank pins have no ingredients and finite zero totals even when prices disappear", () => {
  for (const raw of ["0", ""]) {
    const pin = {
      ...snapshotPin(tree(), "4", "instabuy", 2),
      quantityInput: raw,
    };
    const priced = pricePin(pin, data, {}, {});
    expect(priced.ingredientCost).toBe(0);
    expect(priced.fees).toBe(0);
    expect(priced.ingredients).toEqual([]);
    expect(priced.tree.unitCost).toBe(0);
  }
  expect(() => snapshotPin(tree(), "", "instabuy", 2)).toThrow();
});
test("combines repeated ingredients and retains mixed-mode pricing", () => {
  baseRate.A = 1;
  baseRate.B = 1;
  const pin = snapshotPin(tree(), "4", "instabuy", 2);
  const totals = combinePins([
    pricePin(pin, data, bazaar, {}),
    pricePin({ ...pin, mode: "buyorder" }, data, bazaar, {}),
  ]);
  expect(totals.ingredientCost).toBe(150);
  expect(totals.fees).toBe(24);
  expect(totals.ingredients.find((i) => i.id === "B")).toMatchObject({
    quantity: 12,
    cost: 90,
    modes: [
      { mode: "instabuy", quantity: 6, cost: 60 },
      { mode: "buyorder", quantity: 6, cost: 30 },
    ],
  });
});
test("missing prices or newly dumped/ineligible buy-order leaves make full totals unavailable", () => {
  baseRate.A = 1;
  baseRate.B = 1;
  const pin = snapshotPin(tree(), "4", "buyorder", 2);
  const priced = pricePin(pin, data, bazaar, {
    SHARD_A: { status: "ok", dumped: true },
  });
  expect(priced.ingredientCost).toBe(Infinity);
  expect(combinePins([priced]).ingredientCost).toBe(Infinity);
  baseRate.A = 0;
  expect(pricePin(pin, data, bazaar, {}).ingredientCost).toBe(Infinity);
  expect(
    pricePin({ ...pin, mode: "instabuy" }, data, {}, {}).ingredientCost,
  ).toBe(Infinity);
});
test("restores valid pins and visibility, skipping corruption, duplicates and obsolete recipes", () => {
  const pin = snapshotPin(tree(), "4", "instabuy", 2);
  const serialize = (pins: unknown[]) =>
    JSON.stringify({ version: 1, visible: false, pins });
  expect(restorePins(serialize([pin]), data)).toEqual({
    pins: [pin],
    visible: false,
  });
  expect(
    restorePins(serialize([pin, pin, { ...pin, id: "bad" }]), data).pins,
  ).toHaveLength(1);
  expect(restorePins(serialize([pin]), { ...data, recipes: {} }).pins).toEqual(
    [],
  );
  expect(
    restorePins(
      serialize([{ ...pin, tree: { ...pin.tree, quantityPerUnit: 2 } }]),
      data,
    ).pins,
  ).toEqual([]);
  expect(
    restorePins(serialize([{ ...pin, quantityInput: "NaN" }]), data).pins,
  ).toEqual([]);
  expect(restorePins("invalid", data).pins).toEqual([]);
  expect(restorePins('{"version":2,"pins":[]}', data).visible).toBe(true);
});
test("snapshot excludes cached prices and keeps fractional ingredient arithmetic", () => {
  const t = buildTree(
    "C",
    data.recipes.C[0],
    data,
    computeMinCosts(data, bazaar, "instabuy"),
    1,
  );
  const pin = snapshotPin(t, "1", "instabuy", 0);
  expect(JSON.stringify(pin)).not.toContain("unitCost");
  expect(
    pricePin(pin, data, bazaar, {}).ingredients.map((i) => i.quantity),
  ).toEqual([0.5, 0.5]);
  const invalid = { ...t, qtyNeeded: 0 } as TreeNode;
  expect(() => snapshotPin(invalid, "0", "instabuy", 0)).toThrow();
});
