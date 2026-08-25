/** Escape a string for safe inclusion in XML/SVG text or attribute values. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Format a number for SVG output without trailing float noise. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return parseFloat(n.toFixed(3)).toString();
}

export function svgDocument(
  width: number,
  height: number,
  body: string,
  background?: string
): string {
  const bg = background
    ? `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" fill="${escapeXml(background)}"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" ` +
    `viewBox="0 0 ${fmt(width)} ${fmt(height)}" preserveAspectRatio="xMidYMid meet" role="img">${bg}${body}</svg>`
  );
}

export function circle(cx: number, cy: number, r: number, fill: string, extra = ""): string {
  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(Math.max(0, r))}" fill="${fill}"${extra}/>`;
}

export function rect(x: number, y: number, w: number, h: number, fill: string, extra = ""): string {
  return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(Math.max(0, w))}" height="${fmt(Math.max(0, h))}" fill="${fill}"${extra}/>`;
}

export function polygon(points: Array<[number, number]>, fill: string, extra = ""): string {
  const pts = points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");
  return `<polygon points="${pts}" fill="${fill}"${extra}/>`;
}

export function path(d: string, stroke: string, strokeWidth: number, extra = ""): string {
  return (
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}"` +
    ` stroke-linecap="round" stroke-linejoin="round"${extra}/>`
  );
}

export interface TextSvgOptions {
  width: number;
  color: string;
  background: string;
  fontFamily?: string;
}

/** Wrap rows of monospace text into a standalone SVG document. */
export function textSvgDocument(rows: string[], opts: TextSvgOptions): string {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const em = opts.width / (cols * 0.6); // monospace advance ≈ 0.6em
  const height = Math.max(1, Math.round(rows.length * em));
  const family =
    opts.fontFamily ?? "'Cascadia Code','SF Mono',ui-monospace,Menlo,Consolas,monospace";
  const body = rows
    .map(
      (row, i) =>
        `<text x="${fmt(opts.width / 2)}" y="${fmt((i + 0.78) * em)}" text-anchor="middle" ` +
        `font-family="${family}" font-size="${fmt(em)}" fill="${opts.color}" xml:space="preserve">${escapeXml(row)}</text>`
    )
    .join("");
  return svgDocument(opts.width, height, body, opts.background);
}
