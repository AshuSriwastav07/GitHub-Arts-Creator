import { poolGrid, stretchLevels } from "../analysis";
import { textSvgDocument } from "../svg";
import {
  HIDDEN_USERNAME_KEY,
  getNumber,
  getString,
  type AvatarStyle,
} from "./types";

const CANVAS = 1024;
// Monospace glyph cell aspect: advance width ≈ 0.6 × font-size.
const CELL_ASPECT = 0.6;

/**
 * Family: Text/character — ONE generic character-mosaic generator parameterized
 * by charset (spec §6). "Braille Portrait" and "Code Portrait" are the two
 * flagship presets of this generator; binary / hex / blocks / username /
 * markdown are further charsets rather than separate styles.
 *
 * Deliberate cut (spec §6): standalone Binary/Hex/Unicode-block/Username/
 * Markdown portraits — all are "map luminance to a character set" variants.
 */
const CHARSETS = [
  { value: "braille", label: "Braille portrait" },
  { value: "code", label: "Code portrait" },
  { value: "binary", label: "Binary" },
  { value: "hex", label: "Hexadecimal" },
  { value: "blocks", label: "Unicode blocks" },
  { value: "username", label: "Username" },
  { value: "markdown", label: "Markdown" },
] as const;

// Brightness ramps, dark → light.
const RAMPS: Record<string, string> = {
  binary: "01",
  hex: "0123456789ABCDEF",
  blocks: " ░▒▓█",
  markdown: " .:-~=+*#",
};

// Fixed-width (2-char) token sets per language, ordered light → dense.
const LANG_TOKENS: Record<string, string[]> = {
  typescript: ["..", "::", "//", "<>", "[]", "{}", "??", "&&", "||", "=>", "==", "++", "if", "as"],
  javascript: ["..", "::", "//", "<>", "[]", "{}", "??", "&&", "||", "=>", "==", "**", "let", "var"],
  python: ["..", "::", "//", "<>", "[]", "{}", "==", "!=", "->", "or", "if", "in", "is", "def"],
  rust: ["..", "::", "//", "<>", "[]", "{}", "&*", "->", "=>", "fn", "let", "mut", "&&", "||"],
  go: ["..", "::", "//", "<>", "[]", "{}", "<-", "->", ":=", "go", "if", "for", "map", "err"],
};

/**
 * Unicode Braille: U+2800 + 8-bit dot pattern.
 * Dot numbering → bit positions:
 *   dot1(0,0)=b0  dot2(1,0)=b1  dot3(2,0)=b2  dot4(0,1)=b3
 *   dot5(1,1)=b4  dot6(2,1)=b5  dot7(3,0)=b6  dot8(3,1)=b7
 * `dotBits[row][col]` maps a source sub-pixel at (row dy, column dx) inside the
 * 2×4 cell to its exact braille bit — getting this wrong mirrors/scrambles the
 * whole portrait, so it is pinned by a regression test.
 */
const DOT_BITS = [
  [0, 3],
  [1, 4],
  [2, 5],
  [6, 7],
] as const;

function brailleChar(dots: Uint8Array): string {
  let bits = 0;
  for (let b = 0; b < 8; b++) {
    if (dots[b]) bits |= 1 << b;
  }
  return String.fromCharCode(0x2800 + bits);
}

const charmosa: AvatarStyle = {
  id: "charmosa",
  name: "Character Mosaic",
  description:
    "Luminance mapped to a character set — braille, code tokens, binary, hex, blocks, username or markdown.",
  family: "text",
  supportedFormats: ["text", "svg"],
  estimatedCost: "low",
  paramSchema: [
    { key: "charset", label: "Character set", type: "select", options: CHARSETS.map((c) => ({ ...c })), default: "braille" },
    {
      key: "language",
      label: "Code language",
      type: "select",
      options: Object.keys(LANG_TOKENS).map((k) => ({ value: k, label: k })),
      default: "typescript",
    },
    { key: "cols", label: "Columns", type: "number", min: 40, max: 140, step: 4, default: 88 },
    { key: "gamma", label: "Gamma", type: "number", min: 0.4, max: 2.2, step: 0.05, default: 1 },
    { key: "threshold", label: "Threshold (braille/binary)", type: "number", min: 0.1, max: 0.9, step: 0.01, default: 0.45 },
    { key: "foreground", label: "Foreground", type: "color", default: "#e6edf3" },
    { key: "background", label: "Background", type: "color", default: "#0d1117" },
  ],
  generateText(analysis, params) {
    const rows = buildRows(analysis, params);
    return { rows, width: CANVAS };
  },
  generate(analysis, params, _seed) {
    const rows = buildRows(analysis, params);
    const foreground = params.foreground as string;
    const background = params.background as string;
    return {
      format: "svg",
      data: textSvgDocument(rows, { width: CANVAS, color: foreground, background }),
      width: CANVAS,
      height: Math.max(1, Math.round(rows.length * (CANVAS / ((params.cols as number) * CELL_ASPECT)))),
    };
  },
};

function buildRows(analysis: { luminance: Float32Array; width: number; height: number }, params: Record<string, unknown>): string[] {
  const charset = getString(params, "charset") || "braille";
  const language = getString(params, "language") || "typescript";
  const cols = Math.round(getNumber(params, "cols")) || 88;
  const gamma = getNumber(params, "gamma") || 1;
  const threshold = getNumber(params, "threshold");
  const username = getString(params, HIDDEN_USERNAME_KEY) || "github";

  const rows = Math.max(4, Math.round(cols * CELL_ASPECT * (analysis.height / analysis.width)));

  if (charset === "braille") {
    // Each text cell covers a 2×4 block of sampled source pixels → real dot-matrix fidelity.
    const gw = cols * 2;
    const gh = rows * 4;
    const grid = stretchLevels(poolGridOf(analysis, gw, gh));
    const out: string[] = [];
    for (let ry = 0; ry < rows; ry++) {
      let line = "";
      for (let cx = 0; cx < cols; cx++) {
        const dots = new Uint8Array(8);
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const gx = cx * 2 + dx;
            const gy = ry * 4 + dy;
            const l = Math.pow(grid[gy * gw + gx], gamma);
            if (l > threshold) dots[DOT_BITS[dy][dx]] = 1;
          }
        }
        line += brailleChar(dots);
      }
      out.push(line);
    }
    return out;
  }

  if (charset === "code") {
    const tokens = LANG_TOKENS[language] ?? LANG_TOKENS.typescript;
    const grid = stretchLevels(poolGridOf(analysis, cols, rows));
    const out: string[] = [];
    for (let ry = 0; ry < rows; ry++) {
      let line = "";
      for (let cx = 0; cx < cols; cx++) {
        const l = Math.pow(grid[ry * cols + cx], gamma);
        const idx = Math.min(tokens.length - 1, Math.floor(l * tokens.length));
        line += tokens[idx];
      }
      out.push(line);
    }
    return out;
  }

  if (charset === "username") {
    const seq = (username || "github").toLowerCase();
    const grid = stretchLevels(poolGridOf(analysis, cols, rows));
    const out: string[] = [];
    for (let ry = 0; ry < rows; ry++) {
      let line = "";
      for (let cx = 0; cx < cols; cx++) {
        const l = Math.pow(grid[ry * cols + cx], gamma);
        line += l < 0.08 ? " " : seq[Math.min(seq.length - 1, Math.floor(((l - 0.08) / 0.92) * seq.length))];
      }
      out.push(line);
    }
    return out;
  }

  const ramp = RAMPS[charset] ?? RAMPS.blocks;
  const grid = stretchLevels(poolGridOf(analysis, cols, rows));
  const out: string[] = [];
  for (let ry = 0; ry < rows; ry++) {
    let line = "";
    for (let cx = 0; cx < cols; cx++) {
      const l = Math.pow(grid[ry * cols + cx], gamma);
      line += ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))];
    }
    out.push(line);
  }
  return out;
}

function poolGridOf(
  analysis: { luminance: Float32Array; width: number; height: number },
  cols: number,
  rows: number
): Float32Array {
  return poolGrid(analysis.luminance, analysis.width, analysis.height, cols, rows);
}

export default charmosa;
