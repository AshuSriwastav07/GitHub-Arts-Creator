import type { AvatarStyle } from "./types";

import halftone from "./halftone";
import lowpoly from "./lowpoly";
import lineart from "./lineart";
import charmosa from "./charmosa";
import hexmosaic from "./hexmosaic";
import pixelart from "./pixelart";
import heatmap from "./heatmap";

/**
 * Central StyleRegistry (spec §7). Adding a style means writing one file that
 * implements AvatarStyle and adding it to this array — nothing else changes.
 *
 * ── Deliberate v1 scope note (spec §6) ─────────────────────────────────────
 * Shipped: one strong representative per family:
 *   halftone (dot) · lowpoly (geometric) · lineart (vector; blueprint/circuit
 *   are presets) · charmosa (text; braille/code/binary/hex/blocks/username/
 *   markdown are charsets) · hexmosaic (mosaic) · pixelart (pixel) ·
 *   heatmap (github-native).
 * Explicitly CUT for v1 as later add-ons — NOT missing features:
 *   Dot Matrix & Stipple as separate styles (= halftone `dotShape` param),
 *   Voronoi (≈ lowpoly at avatar sizes), Contour / Blueprint-as-algo /
 *   Circuit-as-algo (= lineart presets), Git Diff Portrait, Git Commit Graph
 *   Portrait (need git data pipelines disproportionate to visual payoff),
 *   generic Mosaic (≈ hexmosaic), Emoji Mosaic (needs emoji asset sets).
 * ────────────────────────────────────────────────────────────────────────────
 */
export const STYLES: AvatarStyle[] = [
  halftone,
  lowpoly,
  lineart,
  charmosa,
  hexmosaic,
  pixelart,
  heatmap,
];

const STYLE_MAP = new Map<string, AvatarStyle>(STYLES.map((s) => [s.id, s]));

export function getStyle(id: string): AvatarStyle | undefined {
  return STYLE_MAP.get(id);
}

export const DEFAULT_STYLE_ID = STYLES[0].id;

export type { AvatarStyle } from "./types";
