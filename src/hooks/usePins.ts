import { useEffect, useMemo, useState } from "react";
import type { FusionData, PinnedFusion } from "../types";
import { PINS_KEY, restorePins } from "../services/pins";

function readSaved(): string | null {
  try {
    return localStorage.getItem(PINS_KEY);
  } catch {
    return null;
  }
}
export function usePins(data: FusionData | null) {
  const [saved] = useState(readSaved);
  const [edited, setEdited] = useState<{
    pins: PinnedFusion[];
    visible: boolean;
  } | null>(null);
  const restored = useMemo(
    () => (data ? restorePins(saved, data) : { pins: [], visible: true }),
    [saved, data],
  );
  const state = edited ?? restored;
  useEffect(() => {
    if (!data) return;
    try {
      localStorage.setItem(PINS_KEY, JSON.stringify({ version: 1, ...state }));
    } catch {
      /* Pins still work in memory. */
    }
  }, [state, data]);
  return {
    ...state,
    setVisible: (visible: boolean) =>
      setEdited((s) => ({ ...(s ?? restored), visible })),
    pin: (pin: PinnedFusion) =>
      setEdited((s) => {
        const current = s ?? restored;
        const exists = current.pins.some((p) => p.id === pin.id);
        return {
          visible: true,
          pins: exists
            ? current.pins.map((p) => (p.id === pin.id ? pin : p))
            : [...current.pins, pin],
        };
      }),
    setQuantity: (id: string, quantityInput: string) =>
      setEdited((s) => ({
        ...(s ?? restored),
        pins: (s ?? restored).pins.map((p) =>
          p.id === id ? { ...p, quantityInput } : p,
        ),
      })),
    remove: (id: string) =>
      setEdited((s) => ({
        ...(s ?? restored),
        pins: (s ?? restored).pins.filter((p) => p.id !== id),
      })),
  };
}
