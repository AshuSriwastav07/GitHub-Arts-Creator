import sharp from "sharp";

/**
 * Deterministic synthetic test image: horizontal luminance gradient with a
 * bright square and dark corner — enough structure to exercise palette,
 * luminance and Sobel edge extraction.
 */
export async function makeTestImage(size = 160): Promise<Buffer> {
  const raw = Buffer.alloc(size * size * 3);
  const half = Math.floor(size / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 3;
      let r = Math.round((x / size) * 200);
      let g = Math.round((y / size) * 120);
      let b = 60;
      if (x >= half - 8 && x <= half + 8) {
        // vertical bright stripe → guaranteed strong edges
        r = 255;
        g = 255;
        b = 255;
      }
      if (x < 12 && y < 12) {
        r = 10;
        g = 10;
        b = 30;
      }
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
}
