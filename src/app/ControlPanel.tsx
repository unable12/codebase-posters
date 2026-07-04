import type { ParamSchema, AnyParams } from '../core/types';

interface Props {
  schema: ParamSchema;
  values: AnyParams;
  onChange: (values: AnyParams) => void;
}

export function ControlPanel({ schema, values, onChange }: Props) {
  const set = (key: string, value: number | boolean | string) => onChange({ ...values, [key]: value });

  return (
    <>
      {Object.entries(schema).map(([key, def]) => (
        <label key={key}>
          {def.label}
          {def.type === 'number' && (
            <span className="row">
              <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step ?? 1}
                value={values[key] as number}
                onChange={(e) => set(key, parseFloat(e.target.value))}
              />
              <span>{values[key]}</span>
            </span>
          )}
          {def.type === 'boolean' && (
            <input
              type="checkbox"
              checked={values[key] as boolean}
              onChange={(e) => set(key, e.target.checked)}
            />
          )}
          {def.type === 'select' && (
            <select value={values[key] as string} onChange={(e) => set(key, e.target.value)}>
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
              value={values[key] as string}
              onChange={(e) => set(key, e.target.value)}
            />
          )}
        </label>
      ))}
    </>
  );
}
