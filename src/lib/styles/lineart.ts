import { circle, path, rect, svgDocument } from "../svg";
import type { AvatarStyle } from "./types";

const CANVAS = 1024;
/** Hard cap on traced paths to keep SVGs README-friendly. */
const MAX_PATHS = 4000;

interface Polyline {
  pts: Array<{ x: number; y: number }>;
  closed: boolean;
}

/**
 * Family: Vector/line — Sobel edge map → simplified SVG polylines.
 *
 * "Blueprint" and "Circuit" are deliberately NOT separate algorithms (spec §6):
 * they are presets of this generator (different stroke/color/grid treatment of
 * the same edge-map input).
 */
const PRESETS: Record<string, {
  bg: string;
  stroke: string;
  grid?: { minor: number; major: number; minorColor: string; majorColor: string };
  orthogonal: boolean;
  pads: boolean;
}> = {
  classic: { bg: "#ffffff", stroke: "#14181f", orthogonal: false, pads: false },
  blueprint: {
    bg: "#0b3d91",
    stroke: "#dbe9ff",
    grid: { minor: 32, major: 128, minorColor: "rgba(255,255,255,0.08)", majorColor: "rgba(255,255,255,0.16)" },
    orthogonal: false,
    pads: false,
  },
  circuit: { bg: "#04070d", stroke: "#22d3ee", orthogonal: true, pads: true },
};

const lineart: AvatarStyle = {
  id: "lineart",
  name: "Line Art",
  description:
    "Sobel edges traced into simplified strokes — with blueprint and circuit presets.",
  family: "vector",
  supportedFormats: ["svg"],
  estimatedCost: "medium",
  paramSchema: [
    {
      key: "preset",
      label: "Preset",
      type: "select",
      options: [
        { value: "classic", label: "Classic ink" },
        { value: "blueprint", label: "Blueprint" },
        { value: "circuit", label: "Circuit" },
      ],
      default: "classic",
    },
    { key: "detail", label: "Detail", type: "number", min: 1, max: 10, step: 1, default: 6 },
    { key: "strokeWidth", label: "Stroke width", type: "number", min: 0.5, max: 3, step: 0.25, default: 1 },
    // Sentinel behavior: leaving #ffffff means "use the preset background".
    { key: "background", label: "Background (#ffffff = preset default)", type: "color", default: "#ffffff" },
  ],
  generate(analysis, params, _seed) {
    const presetName = params.preset as string;
    const preset = PRESETS[presetName] ?? PRESETS.classic;
    const detail = params.detail as number;
    const strokeWidth = params.strokeWidth as number;
    const requestedBg = params.background as string;
    const background = requestedBg === "#ffffff" ? preset.bg : requestedBg;

    const { width: w, height: h } = analysis;
    const scale = CANVAS / w;

    // Smooth the gradient field so contours consolidate into continuous lines,
    // then threshold at a coverage percentile derived from `detail`.
    const blurred = boxBlur3(analysis.edges, w, h);
    const sorted = Float32Array.from(blurred).sort();
    const coverage = 0.04 + ((detail - 1) / 9) * 0.26; // 4%..30% of pixels kept
    const thr = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - coverage)))];
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = blurred[i] > 0 && blurred[i] >= thr ? 1 : 0;
    }

    // Thin to single-pixel skeleton paths — this is what turns noisy edge
    // blobs into drawing-like strokes.
    thinZhangSuen(mask, w, h);

    const lines = traceMask(mask, w, h, preset.orthogonal).slice(0, MAX_PATHS);

    let body = "";
    if (preset.grid) {
      const g = preset.grid;
      for (let x = 0; x <= CANVAS; x += g.major) body += rect(x, 0, 1, CANVAS, g.majorColor);
      for (let y = 0; y <= CANVAS; y += g.major) body += rect(0, y, CANVAS, 1, g.majorColor);
      for (let x = 0; x <= CANVAS; x += g.minor) body += rect(x, 0, 0.5, CANVAS, g.minorColor);
      for (let y = 0; y <= CANVAS; y += g.minor) body += rect(0, y, CANVAS, 0.5, g.minorColor);
    }

    for (const pl of lines) {
      const simplified = douglasPeucker(pl.pts, 0.95);
      if (simplified.length < 2) continue;
      const snapped = preset.orthogonal
        ? simplified.map((p) => ({ x: Math.round((p.x * scale) / 4) * 4, y: Math.round((p.y * scale) / 4) * 4 }))
        : simplified.map((p) => ({ x: p.x * scale, y: p.y * scale }));
      let d = `M ${fmtN(snapped[0].x)} ${fmtN(snapped[0].y)}`;
      for (let i = 1; i < snapped.length; i++) d += ` L ${fmtN(snapped[i].x)} ${fmtN(snapped[i].y)}`;
      if (pl.closed) d += " Z";
      body += path(d, preset.stroke, strokeWidth);
      if (preset.pads && !pl.closed) {
        const a = snapped[0];
        const b = snapped[snapped.length - 1];
        body += circle(a.x, a.y, strokeWidth * 1.7, preset.stroke);
        body += circle(b.x, b.y, strokeWidth * 1.7, preset.stroke);
      }
    }

    return { format: "svg", data: svgDocument(CANVAS, CANVAS, body, background), width: CANVAS, height: CANVAS };
  },
};

function fmtN(n: number): string {
  return Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(2)).toString();
}

/** Separable 3×3 box blur — consolidates scattered gradient responses. */
function boxBlur3(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = x > 0 ? src[i - 1] : src[i];
      const r = x < w - 1 ? src[i + 1] : src[i];
      tmp[i] = (l + src[i] + r) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = y > 0 ? tmp[i - w] : tmp[i];
      const d = y < h - 1 ? tmp[i + w] : tmp[i];
      out[i] = (u + tmp[i] + d) / 3;
    }
  }
  return out;
}

/**
 * Zhang–Suen thinning: reduces the binary edge mask to a one-pixel skeleton so
 * traced polylines follow clean centerlines instead of hugging blob outlines.
 * Deterministic and idempotent.
 */
function thinZhangSuen(mask: Uint8Array, w: number, h: number): void {
  const at = (x: number, y: number): number =>
    x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0;
  let changed = true;
  const toClear: number[] = [];
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      toClear.length = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!mask[y * w + x]) continue;
          // p2..p9, clockwise from north
          const p2 = at(x, y - 1);
          const p3 = at(x + 1, y - 1);
          const p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1);
          const p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y);
          const p9 = at(x - 1, y - 1);
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let a = 0;
          for (let k = 0; k < 8; k++) if (seq[k] === 0 && seq[k + 1] === 1) a++;
          if (a !== 1) continue;
          if (pass === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          toClear.push(y * w + x);
        }
      }
      if (toClear.length > 0) {
        changed = true;
        for (const i of toClear) mask[i] = 0;
      }
    }
  }
}

/** Greedy walk over the binary edge mask producing connected polylines. */
function traceMask(mask: Uint8Array, w: number, h: number, orthogonal: boolean): Polyline[] {
  const visited = new Uint8Array(w * h);
  const dirs: Array<[number, number]> = orthogonal
    ? [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]
    : [
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
      ];
  const out: Polyline[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (!mask[start] || visited[start]) continue;
      visited[start] = 1;
      const pts = [{ x, y }];
      let cx = x;
      let cy = y;
      let prevDir = -1;
      while (pts.length < 20000) {
        let found = -1;
        if (prevDir >= 0) {
          const nx = cx + dirs[prevDir][0];
          const ny = cy + dirs[prevDir][1];
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx] && !visited[ny * w + nx]) {
            found = prevDir;
          }
        }
        if (found < 0) {
          for (let d = 0; d < dirs.length; d++) {
            if (d === prevDir) continue;
            const nx = cx + dirs[d][0];
            const ny = cy + dirs[d][1];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (mask[ni] && !visited[ni]) {
              found = d;
              break;
            }
          }
        }
        if (found < 0) break;
        cx += dirs[found][0];
        cy += dirs[found][1];
        visited[cy * w + cx] = 1;
        prevDir = found;
        pts.push({ x: cx, y: cy });
      }
      if (pts.length < 3) continue;
      const first = pts[0];
      const last = pts[pts.length - 1];
      const closed =
        pts.length > 6 && Math.abs(first.x - last.x) <= 1 && Math.abs(first.y - last.y) <= 1;
      out.push({ pts, closed });
    }
  }
  return out;
}

/** Douglas–Peucker polyline simplification. */
function douglasPeucker(pts: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    const ax = pts[s].x;
    const ay = pts[s].y;
    const bx = pts[e].x;
    const by = pts[e].y;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = s + 1; i < e; i++) {
      const px = pts[i].x - ax;
      const py = pts[i].y - ay;
      let dist: number;
      if (lenSq === 0) {
        dist = Math.sqrt(px * px + py * py);
      } else {
        let t = (px * dx + py * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const qx = px - t * dx;
        const qy = py - t * dy;
        dist = Math.sqrt(qx * qx + qy * qy);
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx > 0) {
      keep[maxIdx] = 1;
      stack.push([s, maxIdx], [maxIdx, e]);
    }
  }
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

export default lineart;
