import { escapeXml, fmt, svgDocument } from "./svg";

export interface BannerOptions {
  username: string;
  title?: string;
  subtitle?: string;
  bio?: string;
  tags?: string;
  theme?: "terminal" | "blueprint" | "cyber" | "minimal";
  background?: string;
}

const THEMES = {
  terminal: {
    bg: "#0d1117",
    cardBg: "#161b22",
    border: "#30363d",
    textPrimary: "#e6edf3",
    textSecondary: "#8b949e",
    accent: "#39d353",
    tagBg: "#21262d",
    tagText: "#58a6ff",
    tagBorder: "#388bfd40",
    gridColor: "rgba(255,255,255,0.03)",
  },
  blueprint: {
    bg: "#09255a",
    cardBg: "#0c327a",
    border: "#1d4ed8",
    textPrimary: "#f8fafc",
    textSecondary: "#93c5fd",
    accent: "#67e8f9",
    tagBg: "#1e3a8a",
    tagText: "#93c5fd",
    tagBorder: "#60a5fa50",
    gridColor: "rgba(255,255,255,0.07)",
  },
  cyber: {
    bg: "#04070d",
    cardBg: "#0a0f1d",
    border: "#22d3ee50",
    textPrimary: "#f0fdf4",
    textSecondary: "#94a3b8",
    accent: "#22d3ee",
    tagBg: "#111827",
    tagText: "#a855f7",
    tagBorder: "#c084fc50",
    gridColor: "rgba(34,211,238,0.04)",
  },
  minimal: {
    bg: "#010409",
    cardBg: "#0d1117",
    border: "#21262d",
    textPrimary: "#f0f6fc",
    textSecondary: "#7d8590",
    accent: "#f0883e",
    tagBg: "#161b22",
    tagText: "#e6edf3",
    tagBorder: "#30363d",
    gridColor: "rgba(255,255,255,0.02)",
  },
} as const;

/**
 * Composes a full 1600×600 GitHub README header banner combining
 * the generated avatar art SVG on the left and a rich developer identity card on the right.
 */
export function composeBannerSvg(
  artSvg: string,
  opts: BannerOptions
): { data: string; width: number; height: number } {
  const WIDTH = 1600;
  const HEIGHT = 600;

  const themeKey = opts.theme && opts.theme in THEMES ? opts.theme : "terminal";
  const t = THEMES[themeKey];
  const bg = opts.background && opts.background !== "#ffffff" ? opts.background : t.bg;

  const title = opts.title?.trim() || opts.username;
  const subtitle = opts.subtitle?.trim() || "GitHub Developer";
  const bio = opts.bio?.trim() || `Public developer identity · Generated with GitHub Avatar Art`;
  const tagsList = (opts.tags || "TypeScript, React, Next.js, Node.js")
    .split(/[,|•]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 6);

  // Cleanly nest the art SVG inside the banner by overriding its width/height
  // but preserving its viewBox so the browser perfectly scales it regardless
  // of whether it's 1024x1024 (Halftone) or 64x64 (PixelArt).
  let embeddedArt = artSvg;
  embeddedArt = embeddedArt.replace(/<svg\s+([^>]*?)>/i, (_, attrs) => {
    const cleanAttrs = attrs.replace(/\b(width|height)="[^"]*"/gi, "").trim();
    return `<svg width="480" height="480" ${cleanAttrs}>`;
  });

  // Multi-line bio wrapping helper (max ~55 chars per line)
  const bioLines = wrapText(bio, 52).slice(0, 3);

  const fontMono = "'Cascadia Code', 'SF Mono', ui-monospace, Menlo, Consolas, monospace";
  const fontSans = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  // Grid pattern
  let gridDefs = `
    <defs>
      <pattern id="bannerGrid" width="32" height="32" patternUnits="userSpaceOnUse">
        <path d="M 32 0 L 0 0 0 32" fill="none" stroke="${t.gridColor}" stroke-width="1"/>
      </pattern>
      <clipPath id="avatarClip">
        <rect x="0" y="0" width="480" height="480" rx="16" />
      </clipPath>
      <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${t.textPrimary}"/>
        <stop offset="100%" stop-color="${t.accent}"/>
      </linearGradient>
    </defs>
  `;

  let body = gridDefs;

  // Background grid
  body += `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bannerGrid)" />`;

  // Outer container border
  body += `<rect x="16" y="16" width="${WIDTH - 32}" height="${HEIGHT - 32}" rx="20" fill="none" stroke="${t.border}" stroke-width="1.5" />`;

  // LEFT: Avatar Art Box (480x480 inside 60, 60)
  body += `
    <g transform="translate(60, 60)">
      <!-- Avatar Card Outer Glow / Border -->
      <rect x="-4" y="-4" width="488" height="488" rx="20" fill="${t.cardBg}" stroke="${t.border}" stroke-width="2" />
      
      <!-- Scaled Inner Artwork -->
      <g clip-path="url(#avatarClip)">
        ${embeddedArt}
      </g>
      
      <!-- Corner Tech Accents -->
      <path d="M -4 20 L -4 -4 L 20 -4" fill="none" stroke="${t.accent}" stroke-width="3" />
      <path d="M 464 -4 L 488 -4 L 488 20" fill="none" stroke="${t.accent}" stroke-width="3" />
      <path d="M -4 464 L -4 488 L 20 488" fill="none" stroke="${t.accent}" stroke-width="3" />
      <path d="M 464 488 L 488 488 L 488 464" fill="none" stroke="${t.accent}" stroke-width="3" />
    </g>
  `;

  // RIGHT: Developer Identity Card (starts at x=590)
  const rx = 590;
  body += `
    <g transform="translate(${rx}, 60)">
      <!-- Terminal Header Bar -->
      <rect x="0" y="0" width="950" height="488" rx="16" fill="${t.cardBg}" stroke="${t.border}" stroke-width="1.5" />
      
      <!-- Window Controls -->
      <circle cx="28" cy="28" r="6" fill="#ff5f56" />
      <circle cx="48" cy="28" r="6" fill="#ffbd2e" />
      <circle cx="68" cy="28" r="6" fill="#27c93f" />
      
      <!-- Terminal Title -->
      <text x="96" y="33" font-family="${fontMono}" font-size="13" fill="${t.textSecondary}">
        ~/github/${escapeXml(opts.username.toLowerCase())} <tspan fill="${t.accent}">($ whoami)</tspan>
      </text>
      
      <!-- Divider Line -->
      <line x1="0" y1="56" x2="950" y2="56" stroke="${t.border}" stroke-width="1" />
      
      <!-- Content Area -->
      <g transform="translate(36, 110)">
        <!-- Name / Main Title -->
        <text x="0" y="0" font-family="${fontSans}" font-size="42" font-weight="800" fill="url(#titleGrad)" letter-spacing="-0.5">
          ${escapeXml(title)}
        </text>
        
        <!-- Role / Subtitle with terminal prompt -->
        <g transform="translate(0, 42)">
          <text x="0" y="0" font-family="${fontMono}" font-size="20" font-weight="600" fill="${t.accent}">
            &gt; <tspan fill="${t.textPrimary}">${escapeXml(subtitle)}</tspan>
          </text>
        </g>
        
        <!-- Bio / Description Lines -->
        <g transform="translate(0, 88)">
          ${bioLines
            .map(
              (line, idx) =>
                `<text x="0" y="${idx * 26}" font-family="${fontSans}" font-size="16" fill="${t.textSecondary}" leading="1.5">${escapeXml(line)}</text>`
            )
            .join("")}
        </g>
        
        <!-- Tech Stack / Skills Badges -->
        <g transform="translate(0, 200)">
          <text x="0" y="-12" font-family="${fontMono}" font-size="12" font-weight="600" fill="${t.textSecondary}" letter-spacing="1">
            STACK &amp; SKILLS
          </text>
          ${renderTagBadges(tagsList, t, fontMono)}
        </g>
        
        <!-- Footer Metadata -->
        <g transform="translate(0, 310)">
          <line x1="0" y1="-20" x2="878" y2="-20" stroke="${t.border}" stroke-width="1" stroke-dasharray="4 4" />
          
          <text x="0" y="0" font-family="${fontMono}" font-size="13" fill="${t.textSecondary}">
            ⚡ <tspan fill="${t.textPrimary}">github.com/${escapeXml(opts.username)}</tspan>
          </text>
          
          <text x="878" y="0" text-anchor="end" font-family="${fontMono}" font-size="12" fill="${t.textSecondary}">
            Deterministic Readme Art · <tspan fill="${t.accent}">v1.0</tspan>
          </text>
        </g>
      </g>
    </g>
  `;

  const fullSvg = svgDocument(WIDTH, HEIGHT, body, bg);
  return { data: fullSvg, width: WIDTH, height: HEIGHT };
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxCharsPerLine) {
      cur = (cur + " " + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function renderTagBadges(
  tags: string[],
  t: (typeof THEMES)[keyof typeof THEMES],
  fontMono: string
): string {
  let out = "";
  let offsetX = 0;
  const paddingX = 14;
  const badgeHeight = 28;

  for (const tag of tags) {
    const textWidth = Math.max(30, tag.length * 8.5);
    const badgeWidth = textWidth + paddingX * 2;
    if (offsetX + badgeWidth > 870) break;

    out += `
      <g transform="translate(${offsetX}, 0)">
        <rect x="0" y="0" width="${badgeWidth}" height="${badgeHeight}" rx="6" fill="${t.tagBg}" stroke="${t.tagBorder}" stroke-width="1" />
        <text x="${badgeWidth / 2}" y="18" text-anchor="middle" font-family="${fontMono}" font-size="12" font-weight="600" fill="${t.tagText}">
          ${escapeXml(tag)}
        </text>
      </g>
    `;
    offsetX += badgeWidth + 10;
  }
  return out;
}
