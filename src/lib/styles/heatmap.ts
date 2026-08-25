import { poolGrid } from "../analysis";
import { svgDocument, rect } from "../svg";
import { HIDDEN_CONTRIB_KEY, getString, type AvatarStyle } from "./types";

/**
 * Family: GitHub-native — Contribution Heatmap Portrait.
 * Luminance mapped onto a GitHub-contribution-style grid (levels 0–4). When the
 * user's actual contribution calendar is available it is blended into the
 * levels; when unavailable this style falls back cleanly to pure avatar-driven
 * levels rather than erroring the flow (spec §6/§10).
 */
const THEMES: Record<string, string[]> = {
  dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
};

const heatmap: AvatarStyle = {
  id: "heatmap",
  name: "Contribution Heatmap",
  description:
    "Your portrait as a GitHub contribution graph — blends your real calendar when available.",
  family: "github-native",
  supportedFormats: ["svg"],
  estimatedCost: "low",
  paramSchema: [
    { key: "cols", label: "Cells across", type: "number", min: 26, max: 64, step: 2, default: 52 },
    {
      key: "theme",
      label: "Theme",
      type: "select",
      options: [
        { value: "dark", label: "GitHub dark" },
        { value: "light", label: "GitHub light" },
      ],
      default: "dark",
    },
    { key: "useContributions", label: "Blend real contribution calendar", type: "boolean", default: true },
    { key: "background", label: "Background", type: "color", default: "#0d1117" },
  ],
  generate(analysis, params, _seed) {
    const cols = params.cols as number;
    const theme = params.theme as string;
    const useContribs = params.useContributions as boolean;
    const background = params.background as string;

    const rows = Math.max(4, Math.round((cols * analysis.height) / analysis.width));
    const lums = poolGrid(analysis.luminance, analysis.width, analysis.height, cols, rows);

    // Adaptive level mapping via luminance rank (robust to exposure).
    const sorted = Float32Array.from(lums).sort();
    const rankOf = (v: number): number => {
      let lo = 0;
      let hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] < v) lo = mid + 1;
        else hi = mid;
      }
      return lo / Math.max(1, sorted.length - 1);
    };

    // Optional real contribution data injected server-side (never client-controlled).
    const contribRaw = getString(params, HIDDEN_CONTRIB_KEY);
    let contribs: number[] | null = null;
    let contribMax = 0;
    if (useContribs && contribRaw && /^[0-9,]*$/.test(contribRaw) && contribRaw.length <= 60000) {
      contribs = contribRaw.split(",").filter((s) => s.length > 0).map((s) => parseInt(s, 10) || 0);
      if (contribs.length === 0) contribs = null;
      else for (const c of contribs) if (c > contribMax) contribMax = c;
    }
    const contribAt = (cellIdx: number, total: number): number => {
      if (!contribs || contribMax === 0) return 0;
      const i = Math.min(contribs.length - 1, Math.floor((cellIdx / total) * contribs.length));
      return contribs[i] / contribMax;
    };

    const palette = THEMES[theme] ?? THEMES.dark;
    // Integer geometry (16px cells, 3px gap) keeps coordinates short and the
    // SVG far below the ~200KB README-friendly budget.
    const CELL = 16;
    const GAP = 3;
    const size = CELL - GAP;
    const canvas = cols * CELL;
    let body = "";
    const total = cols * rows;
    for (let i = 0; i < total; i++) {
      const score = contribs ? 0.88 * rankOf(lums[i]) + 0.12 * contribAt(i, total) : rankOf(lums[i]);
      const level = Math.max(0, Math.min(4, Math.floor(score * 5)));
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      body += rect(cx * CELL + 1, cy * CELL + 1, size, size, palette[level], ' rx="2"');
    }

    return { format: "svg", data: svgDocument(canvas, canvas, body, background), width: canvas, height: canvas };
  },
};

export default heatmap;
