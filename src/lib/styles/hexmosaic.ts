import { poolColorGrid } from "../analysis";
import { rgbToHex } from "../colors";
import { polygon, svgDocument } from "../svg";
import type { AvatarStyle } from "./types";

const CANVAS = 1024;
/** Hard cap on hex count to keep SVGs README-friendly. */
const MAX_HEXES = 6000;

/**
 * Family: Mosaic — hexagonal grid, per-cell average color. Distinct silhouette
 * from low-poly/halftone; generic square mosaic cut for v1 (spec §6).
 */
const hexmosaic: AvatarStyle = {
  id: "hexmosaic",
  name: "Hex Mosaic",
  description: "Honeycomb tiling with per-hex average color.",
  family: "mosaic",
  supportedFormats: ["svg"],
  estimatedCost: "medium",
  paramSchema: [
    { key: "cols", label: "Hexes across", type: "number", min: 16, max: 80, step: 2, default: 54 },
    { key: "gap", label: "Gap %", type: "number", min: 0, max: 35, step: 1, default: 4 },
    {
      key: "orientation",
      label: "Orientation",
      type: "select",
      options: [
        { value: "pointy", label: "Pointy-top" },
        { value: "flat", label: "Flat-top" },
      ],
      default: "pointy",
    },
    { key: "background", label: "Background", type: "color", default: "#ffffff" },
  ],
  generate(analysis, params, _seed) {
    const cols = params.cols as number;
    const gapPct = params.gap as number;
    const orientation = params.orientation as string;
    const background = params.background as string;

    const shrink = Math.max(0.05, 1 - gapPct / 100) * 0.97;
    // 2-decimal coordinates keep hex polygons compact (README budget).
    const pt = (x: number, y: number): [number, number] => [
      parseFloat(x.toFixed(2)),
      parseFloat(y.toFixed(2)),
    ];
    let body = "";
    let outW = CANVAS;
    let outH = Math.round((CANVAS * analysis.height) / analysis.width);

    if (orientation === "flat") {
      const r = CANVAS / (1.5 * cols);
      const hexH = Math.sqrt(3) * r;
      const rowsNeeded = Math.ceil(outH / hexH);
      const poolCols = Math.min(260, cols * 3);
      const poolRows = Math.min(260, rowsNeeded * 3 + 2);
      const { colors } = poolColorGrid(analysis, poolCols, poolRows);
      for (let col = 0; col <= cols; col++) {
        for (let row = 0; row <= rowsNeeded; row++) {
          if (body.length > MAX_HEXES * 90) break;
          const cx = col * 1.5 * r;
          const cy = row * hexH + (col % 2 === 1 ? hexH / 2 : 0);
          const pi =
            Math.min(poolRows - 1, Math.floor((cy / outH) * poolRows)) * poolCols +
            Math.min(poolCols - 1, Math.floor((cx / CANVAS) * poolCols));
          body += polygon(
            [0, 1, 2, 3, 4, 5].map((i) => {
              const a = ((Math.PI * 2) / 6) * i;
              return pt(cx + Math.cos(a) * r * shrink, cy + Math.sin(a) * r * shrink);
            }),
            rgbToHex({ r: colors[pi * 3], g: colors[pi * 3 + 1], b: colors[pi * 3 + 2] })
          );
        }
      }
    } else {
      // pointy-top
      const r = CANVAS / (Math.sqrt(3) * cols);
      const hexW = Math.sqrt(3) * r;
      const rowStep = 1.5 * r;
      const rowsNeeded = Math.ceil(outH / rowStep);
      const poolCols = Math.min(260, cols * 3);
      const poolRows = Math.min(260, rowsNeeded * 3 + 2);
      const { colors } = poolColorGrid(analysis, poolCols, poolRows);
      for (let row = 0; row <= rowsNeeded; row++) {
        for (let col = 0; col < cols + 1; col++) {
          const cx = col * hexW + (row % 2 === 1 ? hexW / 2 : 0);
          const cy = row * rowStep;
          const pi =
            Math.min(poolRows - 1, Math.floor((cy / outH) * poolRows)) * poolCols +
            Math.min(poolCols - 1, Math.floor((cx / CANVAS) * poolCols));
          body += polygon(
            [0, 1, 2, 3, 4, 5].map((i) => {
              const a = ((Math.PI * 2) / 6) * i + Math.PI / 6;
              return pt(cx + Math.cos(a) * r * shrink, cy + Math.sin(a) * r * shrink);
            }),
            rgbToHex({ r: colors[pi * 3], g: colors[pi * 3 + 1], b: colors[pi * 3 + 2] })
          );
        }
      }
    }

    return { format: "svg", data: svgDocument(outW, outH, body, background), width: outW, height: outH };
  },
};

export default hexmosaic;
