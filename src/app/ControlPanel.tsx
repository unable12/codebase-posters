import type { ParamSchema, AnyParams } from '../core/types';

interface Props {
  schema: ParamSchema;
  values: AnyParams;
  onChange: (values: AnyParams) => void;
}

/** Format a number to the precision implied by its step (0.05 → 2 decimals). */
function fmt(v: number, step?: number): string {
  if (!step || step >= 1) return String(Math.round(v));
  const decimals = String(step).split('.')[1]?.length ?? 2;
  return v.toFixed(decimals);
}

export function ControlPanel({ schema, values, onChange }: Props) {
  const set = (key: string, value: number | boolean | string) => onChange({ ...values, [key]: value });

  return (
    <>
      {Object.entries(schema).map(([key, def]) => {
        const value = values[key] ?? def.default;
        if (def.type === 'boolean') {
          return (
            <label key={key} className="check-row">
              <span>{def.label}</span>
              <input
                type="checkbox"
                checked={value as boolean}
                onChange={(e) => set(key, e.target.checked)}
              />
            </label>
          );
        }
        return (
          <label key={key}>
            {def.type === 'number' ? (
              <span className="param-head">
                <span>{def.label}</span>
                <span className="param-value">{fmt(value as number, def.step)}</span>
              </span>
            ) : (
              def.label
            )}
            {def.type === 'number' && (
              <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step ?? 1}
                value={value as number}
                onChange={(e) => set(key, parseFloat(e.target.value))}
              />
            )}
            {def.type === 'select' && (
              <select value={value as string} onChange={(e) => set(key, e.target.value)}>
                {def.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
            {def.type === 'color' && (
              <input
                type="color"
                value={value as string}
                onChange={(e) => set(key, e.target.value)}
              />
            )}
          </label>
        );
      })}
    </>
  );
}
