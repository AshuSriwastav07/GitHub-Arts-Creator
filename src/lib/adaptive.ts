export interface AdaptiveThemeOptions {
  styleId: string;
  background?: string;
  isMonochrome?: boolean;
}

/**
 * Injects GitHub Camo-compatible prefers-color-scheme styles into an SVG.
 * Evaluated client-side inside GitHub's markdown renderer or when viewing directly.
 */
export function injectAdaptiveTheme(
  svgDoc: string,
  opts: AdaptiveThemeOptions
): string {
  const { styleId, background = "#ffffff", isMonochrome = false } = opts;

  // Decide theme tokens based on style family
  const styleBlock = `
    <style>
      :root {
        --canvas-bg: ${background};
        --canvas-ink: #111318;
        --canvas-secondary: #57606a;
        --badge-bg: rgba(240, 240, 240, 0.85);
        --badge-border: rgba(0, 0, 0, 0.15);
        --badge-text: #24292f;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --canvas-bg: #0d1117;
          --canvas-ink: #f0f6fc;
          --canvas-secondary: #8b949e;
          --badge-bg: rgba(13, 17, 23, 0.85);
          --badge-border: rgba(255, 255, 255, 0.2);
          --badge-text: #e6edf3;
        }
      }
    </style>
  `;

  let modified = svgDoc;

  // Insert <style> block immediately after opening <svg ...>
  modified = modified.replace(/(<svg[^>]*>)/i, `$1${styleBlock}`);

  // If background rect is present at the start of svg, hook it into CSS var
  modified = modified.replace(
    /(<rect\s+x="0"\s+y="0"\s+width="[^"]*"\s+height="[^"]*"\s+fill=")(#[0-9a-fA-F]{6}|rgba?\([^)]+\))(")/i,
    `$1var(--canvas-bg, $2)$3`
  );

  // For monochrome styles (lineart, charmosa, halftone-mono), bind ink to CSS var
  if (isMonochrome || styleId === "lineart" || styleId === "charmosa") {
    modified = modified.replace(
      /fill="#(?:111318|0d1117|000000|161b22)"/gi,
      'fill="var(--canvas-ink, #111318)"'
    );
    modified = modified.replace(
      /stroke="#(?:111318|0d1117|000000|161b22)"/gi,
      'stroke="var(--canvas-ink, #111318)"'
    );
  }

  return modified;
}
