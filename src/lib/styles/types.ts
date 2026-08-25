import type { AnalysisResult } from "../analysis";

/**
 * Style plugin contract (spec §7).
 *
 * Adding a style = writing one file that implements AvatarStyle + one entry in
 * the central StyleRegistry. Nothing else changes.
 */

export interface StyleParamSchema {
  key: string;
  label: string;
  type: "number" | "color" | "select" | "text" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  default: unknown;
}

export interface GeneratedArtwork {
  format: "svg" | "png" | "text";
  data: string | Buffer;
  width: number;
  height: number;
}

export type StyleFamily =
  | "dot"
  | "geometric"
  | "vector"
  | "text"
  | "mosaic"
  | "pixel"
  | "github-native";

export interface AvatarStyle {
  id: string;
  name: string;
  description: string;
  family: StyleFamily;
  supportedFormats: Array<"svg" | "png" | "text">;
  paramSchema: StyleParamSchema[];
  /** Used to throttle preview generation (spec §10). */
  estimatedCost: "low" | "medium" | "high";
  /**
   * Deterministic: same (analysis, params, seed) MUST produce byte-identical
   * output. All randomness must flow through the seeded PRNG — never Math.random().
   */
  generate(
    analysis: AnalysisResult,
    params: Record<string, unknown>,
    seed: number
  ): GeneratedArtwork;
  /** Optional plain-text output for text-capable styles (rendered as .txt). */
  generateText?(
    analysis: AnalysisResult,
    params: Record<string, unknown>,
    seed: number
  ): { rows: string[]; width: number };
}

/** Hidden params injected server-side after coercion (never client-controlled). */
export const HIDDEN_USERNAME_KEY = "_username";
export const HIDDEN_CONTRIB_KEY = "_contrib";

export function getString(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  return typeof v === "string" ? v : "";
}

export function getNumber(params: Record<string, unknown>, key: string): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
