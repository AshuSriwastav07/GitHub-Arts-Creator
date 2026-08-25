import { describe, expect, it } from "vitest";
import { analyzeImage, poolColorGrid, poolGrid } from "@/lib/analysis";
import { AppError } from "@/lib/errors";
import { makeTestImage } from "./helpers";

describe("analysis pipeline", () => {
  it("produces a normalized square grid at the requested resolution", async () => {
    const buf = await makeTestImage(160);
    const result = await analyzeImage(buf, { size: 64 });
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(result.rgba.length).toBe(64 * 64 * 4);
    expect(result.luminance.length).toBe(64 * 64);
    expect(result.edges.length).toBe(64 * 64);
  });

  it("computes luminance in [0,1] and preserves relative ordering", async () => {
    const buf = await makeTestImage(160);
    const { luminance } = await analyzeImage(buf, { size: 64 });
    for (const l of luminance) {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
    // left column is darker than the white stripe
    const leftAvg = avg(luminance, 64, 2, 18, 8);
    const stripeAvg = avg(luminance, 64, 31, 33, 8);
    expect(stripeAvg).toBeGreaterThan(leftAvg + 0.3);
  });

  it("detects strong Sobel edges along the bright stripe", async () => {
    const buf = await makeTestImage(160);
    const { edges } = await analyzeImage(buf, { size: 64 });
    let maxEdge = 0;
    for (const e of edges) if (e > maxEdge) maxEdge = e;
    expect(maxEdge).toBeGreaterThan(0.5);
  });

  it("extracts a bounded dominant-color palette", async () => {
    const buf = await makeTestImage(160);
    const { palette } = await analyzeImage(buf, { size: 64 });
    expect(palette.length).toBeGreaterThanOrEqual(1);
    expect(palette.length).toBeLessThanOrEqual(16);
    for (const c of palette) {
      expect(c.r).toBeGreaterThanOrEqual(0);
      expect(c.r).toBeLessThanOrEqual(255);
      expect(c.g).toBeLessThanOrEqual(255);
      expect(c.b).toBeLessThanOrEqual(255);
    }
  });

  it("rejects non-image payloads with IMAGE_INVALID", async () => {
    const junk = Buffer.from("this is definitely not an image", "utf8");
    await expect(analyzeImage(junk)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("IMAGE_INVALID");
      return true;
    });
  });

  it("rejects empty buffers", async () => {
    await expect(analyzeImage(Buffer.alloc(0))).rejects.toBeInstanceOf(AppError);
  });

  it("pooling helpers produce exact grid shapes", async () => {
    const buf = await makeTestImage(160);
    const analysis = await analyzeImage(buf, { size: 64 });
    const lums = poolGrid(analysis.luminance, 64, 64, 16, 16);
    expect(lums.length).toBe(256);
    const pooledColors = poolColorGrid(analysis, 10, 20);
    expect(pooledColors.lums.length).toBe(200);
    expect(pooledColors.colors.length).toBe(600);
  });

  it("is deterministic for identical inputs", async () => {
    const buf = await makeTestImage(160);
    const a = await analyzeImage(buf, { size: 48 });
    const b = await analyzeImage(buf, { size: 48 });
    expect(Buffer.from(a.luminance.buffer).equals(Buffer.from(b.luminance.buffer))).toBe(true);
    expect(a.palette).toEqual(b.palette);
  });
});

function avg(grid: Float32Array, w: number, x0: number, x1: number, y0: number): number {
  let s = 0;
  let n = 0;
  for (let y = y0; y < y0 + 8; y++) {
    for (let x = x0; x <= x1; x++) {
      s += grid[y * w + x];
      n++;
    }
  }
  return s / Math.max(1, n);
}
