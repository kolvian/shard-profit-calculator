import { useState } from "react";
import type { Rarity } from "../types";

const BASE = import.meta.env.BASE_URL;

import { RARITY_RING } from "../lib/rarity";

interface Props {
  id: string;
  rarity?: Rarity;
  size?: number;
  className?: string;
}

export function ShardIcon({
  id,
  rarity = "common",
  size = 36,
  className = "",
}: Props) {
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
