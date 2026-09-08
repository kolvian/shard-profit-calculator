import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { loadFusionData } from "../services/data";
import { fetchBazaar } from "../services/bazaar";
import { rankFusionsFull } from "../services/calc";
import { historyClient, comparePrices } from "../services/history";
import type {
  Bazaar,
  CalcResult,
  FusionData,
  FusionProfit,
  Mode,
  SpikeInfo,
} from "../types";

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
      .catch(
        (e) =>
          alive &&
          setState((s) => ({ ...s, error: String(e), loading: false })),
      );
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
      setState((s) => ({
        ...s,
        refreshing: false,
        loading: false,
        error: String(e),
      }));
    }
  }, []);

  // initial bazaar fetch + 60s auto-refresh
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const history = useSyncExternalStore(
    historyClient.subscribe,
    historyClient.getSnapshot,
  );
  useEffect(() => {
    if (!state.data || !state.bazaar) return;
    historyClient.request(
      Object.values(state.data.shards)
        .map((s) => s.internal_id)
        .filter((id) => id in state.bazaar!),
    );
  }, [state.data, state.bazaar]);

  const spikes = useMemo<Record<string, SpikeInfo>>(() => {
    if (!state.bazaar) return {};
    return Object.fromEntries(
      Object.entries(state.bazaar).map(([id, e]) => [
        id,
        comparePrices(history[id], e.buyPrice, e.sellPrice),
      ]),
    );
  }, [history, state.bazaar]);
  const dumped = useMemo(
    () => new Set(Object.keys(spikes).filter((id) => spikes[id].dumped)),
    [spikes],
  );

  const ranked: { list: FusionProfit[]; calc: CalcResult } | null =
    useMemo(() => {
      if (!state.data || !state.bazaar) return null;
      return rankFusionsFull(state.data, state.bazaar, mode, penalty, dumped);
    }, [state.data, state.bazaar, mode, penalty, dumped]);

  return {
    mode,
    setMode,
    penalty,
    setPenalty,
    data: state.data,
    bazaar: state.bazaar,
    ranked,
    spikes,
    dumped,
    requestHistory: historyClient.request,
    lastUpdated: state.lastUpdated,
    loading: state.loading,
    refreshing: state.refreshing,
    error: state.error,
    refresh,
  };
}
