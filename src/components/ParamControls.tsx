"use client";

import type { ParamSchemaDTO } from "@/lib/types";

/** Auto-generate parameter controls from a style's paramSchema (spec §11). */
export default function ParamControls({
  schema,
  values,
  onChange,
  disabled,
}: {
  schema: ParamSchemaDTO[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  if (schema.length === 0) {
    return <p className="text-xs text-[#7d8590]">This style has no parameters.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {schema.map((p) => (
        <div key={p.key} className="flex flex-col gap-1.5">
          <label htmlFor={`param-${p.key}`} className="text-xs text-[#7d8590]">
            {p.label}
          </label>
          <Control p={p} value={values[p.key]} onChange={(v) => onChange(p.key, v)} disabled={disabled} />
        </div>
      ))}
    </div>
  );
}

function Control({
  p,
  value,
  onChange,
  disabled,
}: {
  p: ParamSchemaDTO;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const id = `param-${p.key}`;
  switch (p.type) {
    case "number": {
      const num = typeof value === "number" ? value : (p.default as number);
      return (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="range"
            min={p.min}
            max={p.max}
            step={p.step ?? 1}
            value={num}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[#30363d] accent-[#39d353]"
          />
          <output className="w-12 shrink-0 text-right text-xs text-[#e6edf3]" aria-label={p.label}>
            {num}
          </output>
        </div>
      );
    }
    case "select":
      return (
        <select
          id={id}
          value={String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-sm outline-none focus:border-[#388bfd]"
        >
          {(p.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "color":
      return (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="color"
            value={typeof value === "string" ? value : "#000000"}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-14 rounded-md"
          />
          <code className="text-xs text-[#7d8590]">{String(value)}</code>
        </div>
      );
    case "boolean":
      return (
        <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 accent-[#39d353]"
          />
          <span className="text-[#c9d1d9]">enabled</span>
        </label>
      );
    case "text":
      return (
        <input
          id={id}
          type="text"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          maxLength={64}
          className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-sm outline-none focus:border-[#388bfd]"
        />
      );
  }
}
