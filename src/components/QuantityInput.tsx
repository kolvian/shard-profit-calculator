import { quantityInput, quantityValue } from "../services/pins";
export function QuantityInput({
  value,
  onChange,
  label = "Quantity wanted",
  reset,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  reset?: number;
}) {
  const qty = quantityValue(value);
  const button =
    "h-8 w-8 rounded-md border border-white/10 text-slate-300 hover:bg-ink-800";
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        className={button}
        onClick={() => onChange(String(Math.max(0, qty - 1)))}
      >
        −
      </button>
      <input
        aria-label={label}
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(quantityInput(e.target.value))}
        className="num w-20 rounded-lg border border-white/10 bg-ink-950 px-2 py-1.5 text-center text-sm text-slate-100"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        className={button}
        onClick={() => onChange(quantityInput(String(qty + 1)))}
      >
        +
      </button>
      {reset !== undefined && (
        <button
          type="button"
          title="Reset to one fusion"
          className="px-2 text-xs text-slate-400"
          onClick={() => onChange(String(reset))}
        >
          ×{reset}
        </button>
      )}
    </div>
  );
}
