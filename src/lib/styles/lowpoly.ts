import type { RGB } from "../colors";
import { poolColorGrid } from "../analysis";
import { rgbToHex } from "../colors";
import { Rng, derivedSeed } from "../prng";
import { polygon, svgDocument } from "../svg";
import type { AvatarStyle } from "./types";

const CANVAS = 1024;
/** Hard cap on triangle count to keep SVGs README-friendly (< ~200KB). */
const MAX_TRIANGLES = 4000;

interface Pt {
  x: number;
  y: number;
}

interface Tri {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  cx: number;
  cy: number;
  r2: number;
}

function circumcircle(p0: Pt, p1: Pt, p2: Pt): Tri | null {
  const d = 2 * (p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y));
  if (Math.abs(d) < 1e-10) return null;
  const s0 = p0.x * p0.x + p0.y * p0.y;
  const s1 = p1.x * p1.x + p1.y * p1.y;
  const s2 = p2.x * p2.x + p2.y * p2.y;
  const ux = (s0 * (p1.y - p2.y) + s1 * (p2.y - p0.y) + s2 * (p0.y - p1.y)) / d;
  const uy = (s0 * (p2.x - p1.x) + s1 * (p0.x - p2.x) + s2 * (p1.x - p0.x)) / d;
  return { p0, p1, p2, cx: ux, cy: uy, r2: (p0.x - ux) ** 2 + (p0.y - uy) ** 2 };
}

function edgeKey(a: Pt, b: Pt): string {
  const ka = a.x * 131071 + a.y;
  const kb = b.x * 131071 + b.y;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * Bowyer–Watson incremental Delaunay triangulation.
 * Fine for the ≤~1000 points we feed it; supertriangle vertices are stripped
 * at the end. Deterministic given a deterministic point list.
 */
export function delaunayTriangulate(points: Pt[]): Array<[Pt, Pt, Pt]> {
  if (points.length < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const dmax = Math.max(maxX - minX, maxY - minY, 1) * 20;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const st0: Pt = { x: midX - dmax, y: midY - dmax };
  const st1: Pt = { x: midX + dmax, y: midY - dmax };
  const st2: Pt = { x: midX, y: midY + dmax };
  const superSet = new Set<Pt>([st0, st1, st2]);

  let tris: Tri[] = [];
  const first = circumcircle(st0, st1, st2);
  if (first) tris.push(first);

  for (const p of points) {
    const bad = new Set<Tri>();
    const edges = new Map<string, [Pt, Pt]>();
    for (const t of tris) {
      const dx = p.x - t.cx;
      const dy = p.y - t.cy;
      if (dx * dx + dy * dy <= t.r2) {
        bad.add(t);
        for (const [a, b] of [
          [t.p0, t.p1],
          [t.p1, t.p2],
          [t.p2, t.p0],
        ] as Array<[Pt, Pt]>) {
          const k = edgeKey(a, b);
          if (edges.has(k)) edges.delete(k);
          else edges.set(k, [a, b]);
        }
      }
    }
    tris = tris.filter((t) => !bad.has(t));
    for (const [, [a, b]] of edges) {
      const t = circumcircle(a, b, p);
      if (t) tris.push(t);
    }
  }

  const out: Array<[Pt, Pt, Pt]> = [];
  for (const t of tris) {
    if (superSet.has(t.p0) || superSet.has(t.p1) || superSet.has(t.p2)) continue;
    out.push([t.p0, t.p1, t.p2]);
  }
  return out.slice(0, MAX_TRIANGLES);
}

/**
 * Family: Geometric — Delaunay triangulation with per-triangle average color.
 * Voronoi was cut for v1 (near-identical look at avatar sizes, spec §6).
 */
const lowpoly: AvatarStyle = {
  id: "lowpoly",
  name: "Low Poly",
  description: "Delaunay triangles filled with per-region average color.",
  family: "geometric",
  supportedFormats: ["svg"],
  estimatedCost: "medium",
  paramSchema: [
    { key: "pointDensity", label: "Point density", type: "number", min: 60, max: 900, step: 20, default: 500 },
    { key: "jitter", label: "Jitter", type: "number", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "strokeWidth", label: "Edge width", type: "number", min: 0, max: 3, step: 0.25, default: 0.75 },
    { key: "stroke", label: "Edge color", type: "color", default: "#0d1117" },
    { key: "background", label: "Background", type: "color", default: "#ffffff" },
  ],
  generate(analysis, params, seed) {
    const density = params.pointDensity as number;
    const jitter = params.jitter as number;
    const strokeWidth = params.strokeWidth as number;
    const strokeColor = params.stroke as string;
    const background = params.background as string;

    // Seeded jittered grid → deterministic point set.
    const rng = new Rng(derivedSeed(seed, "lowpoly"));
    const n = Math.max(8, Math.round(Math.sqrt(Math.min(density, 900))));
    const pts: Pt[] = [{ x: 0, y: 0 }, { x: CANVAS, y: 0 }, { x: 0, y: CANVAS }, { x: CANVAS, y: CANVAS }];
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) {
        const px = ((ix + 0.5) / n) * CANVAS + (rng.float() - 0.5) * ((jitter * CANVAS) / n);
        const py = ((iy + 0.5) / n) * CANVAS + (rng.float() - 0.5) * ((jitter * CANVAS) / n);
        pts.push({
          x: Math.min(CANVAS, Math.max(0, px)),
          y: Math.min(CANVAS, Math.max(0, py)),
        });
      }
    }
    // Edge-adaptive refinement: where the Sobel map is strong (eyes, mouth,
    // jawline…), inject extra jittered points so triangle density —
    // and therefore detail — follows the features instead of being uniform.
    const MAX_POINTS = 2400;
    for (let iy = 0; iy < n && pts.length < MAX_POINTS; iy++) {
      for (let ix = 0; ix < n && pts.length < MAX_POINTS; ix++) {
        const sx = Math.min(analysis.width - 1, Math.floor(((ix + 0.5) / n) * analysis.width));
        const sy = Math.min(analysis.height - 1, Math.floor(((iy + 0.5) / n) * analysis.height));
        const eMag = analysis.edges[sy * analysis.width + sx];
        if (eMag > 0.16 && rng.float() < Math.min(0.9, eMag * 1.6)) {
          const px = ((ix + rng.float()) / n) * CANVAS;
          const py = ((iy + rng.float()) / n) * CANVAS;
          pts.push({ x: Math.min(CANVAS, Math.max(0, px)), y: Math.min(CANVAS, Math.max(0, py)) });
        } else {
          rng.float(); // keep RNG stream independent of branch outcomes
        }
      }
    }

    const triangles = delaunayTriangulate(pts);

    // Coarse pooled color grid for per-centroid sampling.
    const poolCols = 96;
    const poolRows = Math.max(1, Math.round((poolCols * analysis.height) / analysis.width));
    const { colors }: { lums: Float32Array; colors: Float32Array } = poolColorGrid(analysis, poolCols, poolRows);

    const sampleColor = (x: number, y: number): RGB => {
      const cx = Math.min(poolCols - 1, Math.max(0, Math.floor((x / CANVAS) * poolCols)));
      const cy = Math.min(poolRows - 1, Math.max(0, Math.floor((y / CANVAS) * poolRows)));
      const i = (cy * poolCols + cx) * 3;
      return { r: colors[i], g: colors[i + 1], b: colors[i + 2] };
    };

    const strokeExtra =
      strokeWidth > 0
        ? ` stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="0.35" stroke-linejoin="round"`
        : "";
    let body = "";
    for (const [a, b, c] of triangles) {
      const gx = (a.x + b.x + c.x) / 3;
      const gy = (a.y + b.y + c.y) / 3;
      // Blend centroid sample with edge-midpoint samples for smoother,
      // less noisy fills on small triangles.
      const s0 = sampleColor(gx, gy);
      const s1 = sampleColor((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s2 = sampleColor((b.x + c.x) / 2, (b.y + c.y) / 2);
      const s3 = sampleColor((c.x + a.x) / 2, (c.y + a.y) / 2);
      body += polygon(
        [
          [a.x, a.y],
          [b.x, b.y],
          [c.x, c.y],
        ],
        rgbToHex({
          r: (s0.r + s1.r + s2.r + s3.r) / 4,
          g: (s0.g + s1.g + s2.g + s3.g) / 4,
          b: (s0.b + s1.b + s2.b + s3.b) / 4,
        }),
        strokeExtra
      );
    }
    return { format: "svg", data: svgDocument(CANVAS, CANVAS, body, background), width: CANVAS, height: CANVAS };
  },
};

export default lowpoly;
