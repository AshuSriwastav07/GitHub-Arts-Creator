import { poolColorGrid, stretchLevels } from "../analysis";
import { clamp01, rgbToHex } from "../colors";
import { Rng, derivedSeed } from "../prng";
import { circle, rect, svgDocument } from "../svg";
import type { AvatarStyle } from "./types";

const CANVAS = 1024;

/**
 * Family: Dot/Halftone — variable-size marks by luminance.
 * "Dot matrix" and "stipple" are intentionally NOT separate styles (deliberate
 * v1 cut per spec §6); they're covered by the `dotShape` parameter.
 */
const halftone: AvatarStyle = {
  id: "halftone",
  name: "Halftone",
  description: "Variable-radius dots sized by brightness — classic print halftone.",
  family: "dot",
  supportedFormats: ["svg"],
  estimatedCost: "low",
  paramSchema: [
    {
      key: "resolution",
      label: "Grid resolution",
      type: "number",
      min: 16,
      max: 120,
      step: 2,
      default: 64,
    },
    { key: "gamma", label: "Tone gamma", type: "number", min: 0.4, max: 2.2, step: 0.05, default: 1 },
    {
      key: "dotShape",
      label: "Dot style",
      type: "select",
      options: [
        { value: "circle", label: "Circle" },
        { value: "square", label: "Square" },
        { value: "stipple", label: "Stipple" },
      ],
      default: "circle",
    },
    {
      key: "colorMode",
      label: "Color mode",
      type: "select",
      options: [
        { value: "color", label: "Sampled color" },
        { value: "mono", label: "Monochrome ink" },
      ],
      default: "color",
    },
    { key: "ink", label: "Ink color", type: "color", default: "#111318" },
    { key: "background", label: "Background", type: "color", default: "#ffffff" },
    { key: "invert", label: "Invert luminance", type: "boolean", default: false },
  ],
  generate(analysis, params, seed) {
    const resolution = params.resolution as number;
    const gamma = (params.gamma as number) || 1;
    const dotShape = params.dotShape as string;
    const colorMode = params.colorMode as string;
    const ink = params.ink as string;
    const background = params.background as string;
    const invert = params.invert as boolean;

    const cols = Math.round(resolution);
    const rows = Math.max(1, Math.round((cols * analysis.height) / analysis.width));
    const pooled = poolColorGrid(analysis, cols, rows);
    const lums = stretchLevels(pooled.lums);
    const colors = pooled.colors;

    const cw = CANVAS / cols;
    const chh = CANVAS / rows;
    const rng = new Rng(derivedSeed(seed, "halftone"));

    // Check if background is dark or light to correctly size monochrome dots
    const bgHex = background.startsWith("#") ? background.slice(1) : "ffffff";
    const bgR = parseInt(bgHex.slice(0, 2) || "ff", 16);
    const bgG = parseInt(bgHex.slice(2, 4) || "ff", 16);
    const bgB = parseInt(bgHex.slice(4, 6) || "ff", 16);
    const bgIsDark = (0.2126 * bgR + 0.7152 * bgG + 0.0722 * bgB) < 128;

    let body = "";
    for (let ry = 0; ry < rows; ry++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = ry * cols + cx;
        let l = Math.pow(clamp01(lums[i]), gamma);
        if (invert) l = 1 - l;
        const x = (cx + 0.5) * cw;
        const y = (ry + 0.5) * chh;
        const fill = colorMode === "color" ? rgbToHex({ r: colors[i * 3], g: colors[i * 3 + 1], b: colors[i * 3 + 2] }) : ink;
        
        // In mono mode on light background, darker pixels have larger ink dots
        // In color mode, dots preserve full color fidelity across the grid
        const effectiveL = colorMode === "color" 
          ? 1 
          : (bgIsDark ? l : 1 - l);

        if (dotShape === "stipple") {
          const dots = Math.round(Math.pow(colorMode === "color" ? l : effectiveL, 1.15) * 14);
          for (let d = 0; d < dots; d++) {
            const px = x + (rng.float() - 0.5) * cw * 0.92;
            const py = y + (rng.float() - 0.5) * chh * 0.92;
            body += circle(px, py, Math.min(cw, chh) * 0.09, fill);
          }
        } else if (dotShape === "square") {
          const side = colorMode === "color"
            ? Math.min(cw, chh) * 0.94
            : Math.sqrt(Math.max(0.04, effectiveL)) * Math.min(cw, chh) * 0.95;
          body += rect(x - side / 2, y - side / 2, side, side, fill);
        } else {
          const r = colorMode === "color"
            ? (Math.min(cw, chh) / 2) * 0.94
            : Math.sqrt(Math.max(0.04, effectiveL)) * (Math.min(cw, chh) / 2) * 0.98;
          body += circle(x, y, r, fill);
        }
      }
    }
    return { format: "svg", data: svgDocument(CANVAS, CANVAS, body, background), width: CANVAS, height: CANVAS };
  },
};

export default halftone;
