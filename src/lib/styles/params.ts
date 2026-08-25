import type { AvatarStyle } from "./types";

/**
 * Coerce arbitrary (client-supplied) param bags against a style's schema.
 * Unknown keys are dropped — including any attempt to smuggle hidden `_`
 * params through the API. Values are clamped/fallback-to-default, never trusted.
 */
export function coerceParams(
  style: AvatarStyle,
  raw: unknown
): Record<string, unknown> {
  const src =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const p of style.paramSchema) {
    const v = src[p.key];
    switch (p.type) {
      case "number": {
        let n =
          typeof v === "number" && Number.isFinite(v)
            ? v
            : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
              ? Number(v)
              : (p.default as number);
        if (!Number.isFinite(n)) n = p.default as number;
        if (p.min !== undefined) n = Math.max(p.min, n);
        if (p.max !== undefined) n = Math.min(p.max, n);
        out[p.key] = n;
        break;
      }
      case "select": {
        const opts = p.options ?? [];
        out[p.key] = opts.some((o) => o.value === v) ? v : p.default;
        break;
      }
      case "boolean": {
        out[p.key] = typeof v === "boolean" ? v : p.default;
        break;
      }
      case "color": {
        out[p.key] =
          typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)
            ? v.toLowerCase()
            : p.default;
        break;
      }
      case "text": {
        out[p.key] = typeof v === "string" ? v.slice(0, 128) : p.default;
        break;
      }
    }
  }
  return out;
}

/** Defaults only — used for previews. */
export function defaultParams(style: AvatarStyle): Record<string, unknown> {
  return coerceParams(style, {});
}

/** Apply per-style overrides for cheap low-res previews. */
export function withOverrides(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  return { ...base, ...overrides };
}
