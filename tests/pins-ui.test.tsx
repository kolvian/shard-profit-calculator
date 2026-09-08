// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { StrictMode, useState } from "react";
import App from "../src/App";
import { QuantityInput } from "../src/components/QuantityInput";
import { usePins } from "../src/hooks/usePins";
import { PINS_KEY } from "../src/services/pins";
import type { FusionData } from "../src/types";
const fixture = vi.hoisted(() => ({
  data: {
    shards: Object.fromEntries(
      ["A", "B", "C", "D"].map((id, i) => [
        id,
        {
          id,
          internal_id: `SHARD_${id}`,
          name: ["Alpha", "Beta", "Gamma", "Delta"][i],
          family: "Test Family",
          rarity: "common",
          type: "Global",
          fuse_amount: 1,
        },
      ]),
    ),
    recipes: {
      C: [{ inputs: ["A", "B"], outputQuantity: 1 }],
      D: [{ inputs: ["A", "A"], outputQuantity: 1 }],
    },
  },
  bazaar: Object.fromEntries(
    ["A", "B", "C", "D"].map((id) => [
      `SHARD_${id}`,
      {
        buyPrice: id === "A" || id === "B" ? 100 : 500,
        sellPrice: 100,
        buyVolume: 1,
        sellVolume: 1,
        buyMovingWeek: 100,
        sellMovingWeek: 100,
      },
    ]),
  ),
}));
vi.mock("../src/services/data", async (original) => ({
  ...(await original<object>()),
  loadFusionData: vi.fn(async () => fixture.data),
}));
vi.mock("../src/services/bazaar", () => ({
  fetchBazaar: vi.fn(async () => ({
    bazaar: fixture.bazaar,
    lastUpdated: Date.now(),
  })),
}));
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("quantity input stays blank, clamps negatives, increments from blank and resets", () => {
  function Field() {
    const [v, set] = useState("4");
    return <QuantityInput value={v} onChange={set} reset={4} />;
  }
  render(<Field />);
  const input = screen.getByRole("spinbutton") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "" } });
  expect(input.value).toBe("");
  fireEvent.click(
    screen.getByRole("button", { name: "Increase Quantity wanted" }),
  );
  expect(input.value).toBe("1");
  fireEvent.change(input, { target: { value: "-4" } });
  expect(input.value).toBe("0");
  fireEvent.click(
    screen.getByRole("button", { name: "Decrease Quantity wanted" }),
  );
  expect(input.value).toBe("0");
  fireEvent.change(input, { target: { value: "3.9" } });
  expect(input.value).toBe("3");
  fireEvent.click(screen.getByTitle("Reset to one fusion"));
  expect(input.value).toBe("4");
});

test("pins, updates, zeroes, hides, restores and independently removes multiple trees across tabs", async () => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]")),
  );
  const view = render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await act(async () => {});
  fireEvent.click(
    within(screen.getByRole("main")).getByRole("button", { name: /Gamma/ }),
  );
  const input = screen.getByRole("spinbutton", {
    name: "Quantity wanted",
  }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "" } });
  expect(input.value).toBe("");
  expect(
    (screen.getByRole("button", { name: "Pin tree" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByText("Enter a quantity to see ingredient requirements."),
  ).toBeTruthy();
  fireEvent.change(input, { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Pin tree" }));
  expect(screen.getByRole("button", { name: "Update pin" })).toBeTruthy();
  fireEvent.change(input, { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Update pin" }));
  expect(JSON.parse(localStorage.getItem(PINS_KEY)!).pins).toHaveLength(1);
  expect(
    JSON.parse(localStorage.getItem(PINS_KEY)!).pins[0].quantityInput,
  ).toBe("5");
  fireEvent.click(
    within(screen.getByRole("main")).getByRole("button", { name: /Delta/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Pin tree" }));
  expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Pinned Gamma quantity" }),
    { target: { value: "" } },
  );
  const gamma = within(
    screen.getByRole("article", { name: "Pinned Gamma Insta-buy" }),
  );
  expect(gamma.getAllByText("0.00")).toHaveLength(2);
  fireEvent.click(
    gamma.getByRole("button", { name: "View Gamma ingredients & tree" }),
  );
  expect(
    gamma.getByText("No ingredients needed at zero quantity."),
  ).toBeTruthy();
  fireEvent.click(
    screen.getAllByRole("button", { name: "Hide pinned trees" })[0],
  );
  expect(JSON.parse(localStorage.getItem(PINS_KEY)!).visible).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "My shards" }));
  expect(screen.getAllByRole("article")).toHaveLength(2);
  view.unmount();
  render(<App />);
  await act(async () => {});
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(
    (
      screen.getByRole("spinbutton", {
        name: "Pinned Gamma quantity",
      }) as HTMLInputElement
    ).value,
  ).toBe("");
  fireEvent.click(
    screen.getAllByRole("button", { name: "Show pinned trees (2)" })[0],
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Gamma Insta-buy" }),
  );
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem(PINS_KEY)!).pins[0].shardId).toBe("D");
  fireEvent.click(
    screen.getByRole("button", { name: "Show pinned trees (1)" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Pinned trees drawer" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Remove Delta Insta-buy" }),
  );
  // Removing the focused card can return focus to body; Escape must still work.
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).toBe("");
});

test("storage access failures do not break pin state or visibility", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("disabled");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("disabled");
  });
  const { result } = renderHook(() => usePins(fixture.data as FusionData));
  expect(result.current.pins).toEqual([]);
  act(() => result.current.setVisible(false));
  expect(result.current.visible).toBe(false);
});
