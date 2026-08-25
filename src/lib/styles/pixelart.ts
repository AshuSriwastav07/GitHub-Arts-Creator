import { poolColorGrid } from "../analysis";
import { rgbToHex } from "../colors";
import { svgDocument, rect } from "../svg";
import type { AvatarStyle } from "./types";

const CELL_PX = 16; // integer cell size ⇒ integer coordinates ⇒ compact SVG

/**
 * Family: Pixel — blocky downsample with optional palette quantization.
 * The cheap, universally understood fallback style.
 */
const pixelart: AvatarStyle = {
  id: "pixelart",
  name: "Pixel Art",
  description: "Blocky downsampling with optional palette quantization.",
  family: "pixel",
  supportedFormats: ["svg", "png"],
  estimatedCost: "low",
  paramSchema: [
    { key: "cols", label: "Pixels across", type: "number", min: 16, max: 96, step: 4, default: 64 },
    {
      key: "paletteSize",
      label: "Quantize to N colors (0 = original)",
      type: "number",
      min: 0,
      max: 16,
      step: 1,
      default: 0,
    },
    { key: "background", label: "Background", type: "color", default: "#ffffff" },
  ],
  generate(analysis, params, _seed) {
    const cols = params.cols as number;
    const paletteSize = params.paletteSize as number;
    const background = params.background as string;

    const rows = Math.max(1, Math.round((cols * analysis.height) / analysis.width));
    const { colors } = poolColorGrid(analysis, cols, rows);

    // Optional quantization against the analysis palette (nearest RGB).
    let palette = analysis.palette;
    if (paletteSize > 0 && palette.length > 0) {
      palette = palette.slice(0, Math.min(paletteSize, palette.length));
    }
    const usePalette = paletteSize > 0 && palette.length > 0;
    const quantize = (r: number, g: number, b: number): [number, number, number] => {
      if (!usePalette) return [r, g, b];
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const dr = r - palette[i].r;
        const dg = g - palette[i].g;
        const db = b - palette[i].b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return [palette[best].r, palette[best].g, palette[best].b];
    };

    // Emit per row, merging horizontal runs of identical color (RLE) so
    // quantized output stays far below the ~200KB README budget.
    const canvas = cols * CELL_PX;
    const outH = rows * CELL_PX;
    let body = "";
    for (let ry = 0; ry < rows; ry++) {
      let runStart = 0;
      let runColor = "";
      for (let cx = 0; cx <= cols; cx++) {
        let hex = "";
        if (cx < cols) {
          const i = (ry * cols + cx) * 3;
          const [r, g, b] = quantize(colors[i], colors[i + 1], colors[i + 2]);
          hex = rgbToHex({ r, g, b });
        }
        if (hex !== runColor && runColor !== "") {
          body += rect(runStart * CELL_PX, ry * CELL_PX, (cx - runStart) * CELL_PX, CELL_PX, runColor, ' shape-rendering="crispEdges"');
        }
        if (hex !== runColor) {
          runColor = hex;
          runStart = cx;
        }
      }
    }
    return { format: "svg", data: svgDocument(canvas, outH, body, background), width: canvas, height: outH };
  },
};

export default pixelart;
