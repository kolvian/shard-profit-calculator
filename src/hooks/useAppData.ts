import { useCallback, useEffect, useMemo, useState } from "react";
import { loadFusionData } from "../services/data";
import { fetchBazaar } from "../services/bazaar";
import { rankFusionsFull } from "../services/calc";
import { getSpike } from "../services/history";
import type { Bazaar, CalcResult, FusionData, FusionProfit, Mode, SpikeInfo } from "../types";

const SWEEP_CONCURRENCY = 8;

interface State {
  data: FusionData | null;
  bazaar: Bazaar | null;
  lastUpdated: number | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

export function useAppData() {
  const [mode, setMode] = useState<Mode>("instabuy");
  const [penalty, setPenalty] = useState(0); // flat coin cost per fusion craft
  const [state, setState] = useState<State>({
    data: null,
    bazaar: null,
    lastUpdated: null,
    loading: true,
    refreshing: false,
    error: null,
  });

  // load static dataset once
  useEffect(() => {
    let alive = true;
    loadFusionData()
      .then((data) => alive && setState((s) => ({ ...s, data })))
      .catch((e) => alive && setState((s) => ({ ...s, error: String(e), loading: false })));
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, refreshing: true }));
    try {
      const snap = await fetchBazaar();
      setState((s) => ({
        ...s,
        bazaar: snap.bazaar,
        lastUpdated: snap.lastUpdated,
        loading: false,
        refreshing: false,
        error: null,
      }));
    } catch (e) {
      setState((s) => ({ ...s, refreshing: false, loading: false, error: String(e) }));
    }
  }, []);

  // initial bazaar fetch + 60s auto-refresh
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  // background price-history sweep: detects pumps (output) and dumps (buy-order
  // inputs) for every shard, so the cost engine can exclude crashed prices and
  // the list can flag manipulated shards. Re-runs on each bazaar refresh.
  const [spikes, setSpikes] = useState<Record<string, SpikeInfo>>({});
  const [manipVersion, setManipVersion] = useState(0);

  useEffect(() => {
    const bazaar = state.bazaar;
    if (!bazaar) return;
    let alive = true;
    const ids = Object.keys(bazaar);
    let i = 0;
    let active = 0;
    const pending: Record<string, SpikeInfo> = {};
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (!alive) return;
      setSpikes((s) => ({ ...s, ...pending }));
      for (const k in pending) delete pending[k];
      setManipVersion((v) => v + 1); // re-rank now that dumped flags updated
    };
    const schedule = () => {
      if (timer == null) timer = setTimeout(flush, 300);
    };
    const pump = () => {
      while (alive && active < SWEEP_CONCURRENCY && i < ids.length) {
        const id = ids[i++];
        active++;
        const e = bazaar[id];
        getSpike(id, e?.buyPrice ?? 0, e?.sellPrice ?? 0)
          .then((info) => {
            if (alive) {
              pending[id] = info;
              schedule();
            }
          })
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    pump();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [state.bazaar]);

  const ranked: { list: FusionProfit[]; calc: CalcResult } | null = useMemo(() => {
    if (!state.data || !state.bazaar) return null;
    return rankFusionsFull(state.data, state.bazaar, mode, penalty);
    // manipVersion intentionally in deps: re-rank when dumped flags change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data, state.bazaar, mode, penalty, manipVersion]);

  return {
    mode,
    setMode,
    penalty,
    setPenalty,
    data: state.data,
    bazaar: state.bazaar,
    ranked,
    spikes,
    lastUpdated: state.lastUpdated,
    loading: state.loading,
    refreshing: state.refreshing,
    error: state.error,
    refresh,
  };
}
