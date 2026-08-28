import { escapeXml, fmt } from "./svg";

export interface BadgeOptions {
  width: number;
  height: number;
  textColor?: string;
  bgColor?: string;
}

/**
 * Injects a subtle, tasteful attribution badge into an SVG document.
 * Placed in the bottom-right corner with low opacity so it reads as a credit,
 * not a watermark that competes with the art.
 */
export function injectAttributionBadge(
  svgDoc: string,
  opts: BadgeOptions
): string {
  const { width, height } = opts;
  const badgeText = "gh-avatar-art";
  const badgeWidth = 92;
  const badgeHeight = 20;
  const pad = 12;
  const x = width - badgeWidth - pad;
  const y = height - badgeHeight - pad;

  const badgeSvg = `
    <!-- gh-avatar-art attribution badge (spec §2) -->
    <g class="gh-avatar-art-badge" opacity="0.6" style="cursor: pointer;">
      <a href="https://github-arts-creator.vercel.app" target="_blank" rel="noopener noreferrer">
        <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(badgeWidth)}" height="${fmt(badgeHeight)}" rx="4" fill="var(--badge-bg, rgba(13, 17, 23, 0.75))" stroke="var(--badge-border, rgba(255, 255, 255, 0.15))" stroke-width="1" />
        <text x="${fmt(x + badgeWidth / 2)}" y="${fmt(y + 13.5)}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" font-weight="500" fill="var(--badge-text, rgba(255, 255, 255, 0.85))" letter-spacing="0.2">
          ${escapeXml(badgeText)}
        </text>
      </a>
    </g>
  `;

  // Insert before </svg>
  const closingIdx = svgDoc.lastIndexOf("</svg>");
  if (closingIdx !== -1) {
    return svgDoc.slice(0, closingIdx) + badgeSvg + svgDoc.slice(closingIdx);
  }
  return svgDoc + badgeSvg;
}
