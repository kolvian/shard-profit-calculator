import type { Rarity } from "../types";

export const RARITY_RING: Record<Rarity, string> = {
  common: "ring-slate-400/40",
  uncommon: "ring-emerald-400/50",
  rare: "ring-sky-400/50",
  epic: "ring-fuchsia-400/50",
  legendary: "ring-amber-400/60",
};

export const RARITY_TEXT: Record<Rarity, string> = {
  common: "text-slate-300",
  uncommon: "text-emerald-300",
  rare: "text-sky-300",
  epic: "text-fuchsia-300",
  legendary: "text-amber-300",
};

export const RARITY_GLOW: Record<Rarity, string> = {
  common: "from-slate-500/10",
  uncommon: "from-emerald-500/15",
  rare: "from-sky-500/15",
  epic: "from-fuchsia-500/15",
  legendary: "from-amber-500/20",
};
