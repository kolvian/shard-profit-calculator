import { useEffect, useState } from "react";
import { getSpike } from "../services/history";
import type { Bazaar, SpikeInfo } from "../types";

/**
 * Lazily fetch 6h price-spike info for a set of bazaar products.
 * Keyed by internal_id; cached across calls in the history service.
 */
export function useSpikes(internalIds: string[], bazaar: Bazaar | null): Record<string, SpikeInfo> {
  const [map, setMap] = useState<Record<string, SpikeInfo>>({});
  const key = [...new Set(internalIds)].sort().join(",");

  useEffect(() => {
    if (!bazaar) return;
    let alive = true;
    const ids = key ? key.split(",") : [];
    setMap((m) => {
      const next = { ...m };
      for (const id of ids) if (!(id in next)) next[id] = { status: "loading" };
      return next;
    });
    ids.forEach((id) => {
      const e = bazaar[id];
      getSpike(id, e?.buyPrice ?? 0, e?.sellPrice ?? 0).then((info) => {
        if (alive) setMap((m) => ({ ...m, [id]: info }));
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bazaar]);

  return map;
}
