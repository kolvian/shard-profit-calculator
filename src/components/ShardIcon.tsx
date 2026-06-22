import { useState } from "react";
import type { Rarity } from "../types";

const BASE = import.meta.env.BASE_URL;

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

interface Props {
  id: string;
  rarity?: Rarity;
  size?: number;
  className?: string;
}

export function ShardIcon({ id, rarity = "common", size = 36, className = "" }: Props) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-900 ring-1 ${RARITY_RING[rarity]} ${className}`}
      style={{ width: size, height: size }}
    >
      {broken ? (
        <span className="text-[10px] text-slate-500">?</span>
      ) : (
        <img
          src={`${BASE}shardIcons/${id}.png`}
          alt={id}
          loading="lazy"
          width={size}
          height={size}
          className="h-full w-full object-contain p-0.5"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}
