import sharp from "sharp";
import { AppError } from "./errors";
import type { RGB } from "./colors";

/**
 * Shared image-analysis pipeline (spec §5).
 *
 * Every style generator consumes an AnalysisResult and never touches the raw
 * image buffer directly. The source image is never mutated — all outputs are
 * derived copies held in memory.
 */
export interface AnalysisResult {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** Per-pixel brightness, 0..1. */
  luminance: Float32Array;
  /** Dominant colors, most-populous first. */
  palette: RGB[];
  /** Sobel gradient magnitude, normalized 0..1. */
  edges: Float32Array;
}

const MAX_BYTES = 8 * 1024 * 1024;
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "tiff", "avif"]);

export async function analyzeImage(
  buffer: Buffer,
  opts: { size?: number } = {}
): Promise<AnalysisResult> {
  const target = Math.max(16, Math.min(2048, Math.round(opts.size ?? 512)));
  if (!buffer || buffer.length === 0) throw new AppError("IMAGE_INVALID");
  if (buffer.length > MAX_BYTES) throw new AppError("IMAGE_INVALID", 413, "payload too large");

  let img = sharp(buffer, { failOn: "error", animated: false });
  let meta;
  try {
    meta = await img.metadata();
  } catch {
    throw new AppError("IMAGE_INVALID");
  }
  if (!meta.format || !SUPPORTED_FORMATS.has(meta.format)) {
    throw new AppError("IMAGE_INVALID", 415, `format ${meta.format ?? "unknown"}`);
  }

  // normalizeOrientation → center-crop to square at processing resolution
  let raw;
  try {
    raw = await img
      .rotate() // respect EXIF orientation
      .flatten({ background: "#ffffff" }) // avatars may have alpha; flatten for consistent luminance
      .resize(target, target, { fit: "cover", position: "centre" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new AppError("IMAGE_INVALID");
  }

  const width = raw.info.width;
  const height = raw.info.height;
  const channels = raw.info.channels;
  if (channels !== 4) throw new AppError("IMAGE_INVALID");

  const rgba = new Uint8ClampedArray(raw.data.buffer, raw.data.byteOffset, width * height * 4);
  const n = width * height;
  const luminance = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    luminance[i] = (0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255;
  }
  const palette = computeColorPalette(rgba, n, 16);
  const edges = computeEdgeMap(luminance, width, height);
  return { width, height, rgba, luminance, palette, edges };
}

/* ------------------------------------------------------------------ */
/* Palette: median-cut quantization                                    */
/* ------------------------------------------------------------------ */

function computeColorPalette(rgba: Uint8ClampedArray, pixelCount: number, k: number): RGB[] {
  const step = Math.max(1, Math.floor(pixelCount / 8000));
  const pixels: number[][] = [];
  for (let i = 0; i < pixelCount; i += step) {
    const o = i * 4;
    pixels.push([rgba[o], rgba[o + 1], rgba[o + 2]]);
  }
  let boxes: number[][][] = [pixels];
  while (boxes.length < k) {
    let bestBox = -1;
    let bestRange = 0;
    let bestChannel = 0;
    boxes.forEach((box, idx) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let mn = 255;
        let mx = 0;
        for (const p of box) {
          if (p[c] < mn) mn = p[c];
          if (p[c] > mx) mx = p[c];
        }
        if (mx - mn > bestRange) {
          bestRange = mx - mn;
          bestBox = idx;
          bestChannel = c;
        }
      }
    });
    if (bestBox < 0 || bestRange < 10) break;
    const box = boxes[bestBox];
    box.sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = box.length >> 1;
    boxes.splice(bestBox, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes
    .filter((b) => b.length > 0)
    .map((box) => {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const p of box) {
        r += p[0];
        g += p[1];
        b += p[2];
      }
      const len = box.length;
      return { r: Math.round(r / len), g: Math.round(g / len), b: Math.round(b / len) };
    })
    .sort((a, b) => relLum(b) - relLum(a));
}

function relLum(c: RGB): number {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

/* ------------------------------------------------------------------ */
/* Edges: Sobel magnitude on the luminance map                         */
/* ------------------------------------------------------------------ */

export function computeEdgeMap(lum: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  let maxMag = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = lum[i - w - 1];
      const t = lum[i - w];
      const tr = lum[i - w + 1];
      const l = lum[i - 1];
      const r = lum[i + 1];
      const bl = lum[i + w - 1];
      const b = lum[i + w];
      const br = lum[i + w + 1];
      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
      const m = Math.sqrt(gx * gx + gy * gy);
      out[i] = m;
      if (m > maxMag) maxMag = m;
    }
  }
  if (maxMag > 0) {
    for (let i = 0; i < out.length; i++) out[i] /= maxMag;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Pooling helpers shared by style generators                          */
/* ------------------------------------------------------------------ */

/**
 * Percentile contrast stretch (default 2%–98%): remaps a pooled grid so its
 * tonal range fills 0..1. Dramatically improves portrait legibility for
 * low-contrast avatars without touching the source analysis.
 */
export function stretchLevels(
  grid: Float32Array,
  loPct = 0.02,
  hiPct = 0.98
): Float32Array {
  const sorted = Float32Array.from(grid).sort();
  const lo = sorted[Math.floor(sorted.length * loPct)] ?? 0;
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * hiPct))] ?? 1;
  const range = hi - lo;
  if (range <= 1e-6) return Float32Array.from(grid);
  const out = new Float32Array(grid.length);
  for (let i = 0; i < grid.length; i++) {
    out[i] = Math.min(1, Math.max(0, (grid[i] - lo) / range));
  }
  return out;
}

/** Average-pool a scalar grid down to cols × rows. */
export function poolGrid(
  src: Float32Array,
  w: number,
  h: number,
  cols: number,
  rows: number
): Float32Array {
  const out = new Float32Array(cols * rows);
  for (let ry = 0; ry < rows; ry++) {
    const y0 = Math.floor((ry * h) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((ry + 1) * h) / rows));
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor((cx * w) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / cols));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += src[y * w + x];
          count++;
        }
      }
      out[ry * cols + cx] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

export interface PooledColorGrid {
  lums: Float32Array;
  colors: Float32Array; // cols*rows*3, rgb per cell
}

/** Average-pool color + luminance grids in one pass. */
export function poolColorGrid(
  analysis: AnalysisResult,
  cols: number,
  rows: number
): PooledColorGrid {
  const { rgba, width, height } = analysis;
  const lums = new Float32Array(cols * rows);
  const colors = new Float32Array(cols * rows * 3);
  for (let ry = 0; ry < rows; ry++) {
    const y0 = Math.floor((ry * height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((ry + 1) * height) / rows));
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor((cx * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / cols));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * width + x) * 4;
          r += rgba[o];
          g += rgba[o + 1];
          b += rgba[o + 2];
          count++;
        }
      }
      const idx = ry * cols + cx;
      if (count === 0) count = 1;
      colors[idx * 3] = r / count;
      colors[idx * 3 + 1] = g / count;
      colors[idx * 3 + 2] = b / count;
      lums[idx] = (0.2126 * colors[idx * 3] + 0.7152 * colors[idx * 3 + 1] + 0.0722 * colors[idx * 3 + 2]) / 255;
    }
  }
  return { lums, colors };
}
