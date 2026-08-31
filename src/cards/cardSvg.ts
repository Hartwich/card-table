import { cardColorPalette, type CardBackStyle, type CardFace } from "./cardTypes.js";

/**
 * Kartenbilder als SVG.
 *
 * Der Host lädt daraus Phaser-Texturen, damit die Karten auf dem großen
 * Bildschirm gestochen scharf skalieren. Der Controller rendert dasselbe
 * Kartenmodell mit eigenem SVG in React.
 */

export interface CardSvgOptions {
  width?: number;
  height?: number;
  selected?: boolean;
  muted?: boolean;
}

const defaultWidth = 300;
const defaultHeight = 420;

const pipLayouts: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.5, 0.16], [0.5, 0.84]],
  3: [[0.5, 0.16], [0.5, 0.5], [0.5, 0.84]],
  4: [[0.32, 0.16], [0.68, 0.16], [0.32, 0.84], [0.68, 0.84]],
  5: [[0.32, 0.16], [0.68, 0.16], [0.5, 0.5], [0.32, 0.84], [0.68, 0.84]],
  6: [[0.32, 0.16], [0.68, 0.16], [0.32, 0.5], [0.68, 0.5], [0.32, 0.84], [0.68, 0.84]],
  7: [[0.32, 0.16], [0.68, 0.16], [0.5, 0.33], [0.32, 0.5], [0.68, 0.5], [0.32, 0.84], [0.68, 0.84]],
  8: [
    [0.32, 0.16], [0.68, 0.16], [0.5, 0.33], [0.32, 0.5],
    [0.68, 0.5], [0.5, 0.67], [0.32, 0.84], [0.68, 0.84]
  ],
  9: [
    [0.32, 0.16], [0.68, 0.16], [0.32, 0.38], [0.68, 0.38], [0.5, 0.5],
    [0.32, 0.62], [0.68, 0.62], [0.32, 0.84], [0.68, 0.84]
  ],
  10: [
    [0.32, 0.16], [0.68, 0.16], [0.5, 0.27], [0.32, 0.38], [0.68, 0.38],
    [0.32, 0.62], [0.68, 0.62], [0.5, 0.73], [0.32, 0.84], [0.68, 0.84]
  ]
};

/** Pip-Positionen einer Zahlenkarte, oder null für Bildkarten. */
export function cardPipLayout(rankLabel: string): Array<[number, number]> | null {
  const numeric = Number.parseInt(rankLabel, 10);
  return Number.isFinite(numeric) ? pipLayouts[numeric] ?? null : null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const serifStack = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";

function corner(face: CardFace, ink: string, width: number, height: number, rotate: boolean): string {
  const x = width * 0.135;
  const y = height * 0.115;
  const transform = rotate ? ` transform="rotate(180 ${width / 2} ${height / 2})"` : "";

  return `<g${transform}>
    <text x="${x}" y="${y}" font-family="${serifStack}" font-size="${width * 0.18}" font-weight="600" fill="${ink}" text-anchor="middle">${escapeXml(face.rankLabel)}</text>
    <text x="${x}" y="${y + width * 0.15}" font-family="${serifStack}" font-size="${width * 0.14}" fill="${ink}" text-anchor="middle">${escapeXml(face.suitSymbol)}</text>
  </g>`;
}

function centerArtwork(face: CardFace, ink: string, accent: string, width: number, height: number): string {
  if (face.centerLabel) {
    return `<g>
      <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.29}" fill="${accent}" />
      <text x="${width / 2}" y="${height / 2 + width * 0.055}" font-family="${serifStack}" font-size="${width * 0.15}" font-weight="600" fill="${ink}" text-anchor="middle">${escapeXml(face.centerLabel)}</text>
    </g>`;
  }

  const pips = cardPipLayout(face.rankLabel);

  if (pips) {
    return pips
      .map(([px, py]) => {
        const cx = width * px;
        const cy = height * (0.17 + py * 0.66);
        const flip = py > 0.55 ? ` transform="rotate(180 ${cx} ${cy})"` : "";

        return `<text x="${cx}" y="${cy + width * 0.06}"${flip} font-family="${serifStack}" font-size="${width * 0.18}" fill="${ink}" text-anchor="middle">${escapeXml(face.suitSymbol)}</text>`;
      })
      .join("");
  }

  return `<g>
    <rect x="${width * 0.19}" y="${height * 0.19}" width="${width * 0.62}" height="${height * 0.62}" rx="${width * 0.05}" fill="${accent}" stroke="${ink}" stroke-opacity="0.35" stroke-width="${width * 0.008}" />
    <text x="${width / 2}" y="${height * 0.5 + width * 0.1}" font-family="${serifStack}" font-size="${width * 0.32}" font-weight="600" fill="${ink}" text-anchor="middle">${escapeXml(face.rankLabel)}</text>
    <text x="${width / 2}" y="${height * 0.72}" font-family="${serifStack}" font-size="${width * 0.14}" fill="${ink}" text-anchor="middle">${escapeXml(face.suitSymbol)}</text>
  </g>`;
}

/** Rendert eine Spielkarte als eigenständiges SVG-Dokument. */
export function renderCardFaceSvg(face: CardFace, options: CardSvgOptions = {}): string {
  const width = options.width ?? defaultWidth;
  const height = options.height ?? defaultHeight;
  const palette = cardColorPalette[face.color] ?? cardColorPalette.neutral;
  const ink = options.muted ? "#9aa1a6" : palette.ink;
  const accent = options.muted ? "#eceae6" : palette.accent;
  const border = options.selected ? "#6e8b74" : "#ded5c7";
  const borderWidth = options.selected ? width * 0.03 : width * 0.012;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="${borderWidth / 2}" y="${borderWidth / 2}" width="${width - borderWidth}" height="${height - borderWidth}" rx="${width * 0.07}" fill="#fffbf4" stroke="${border}" stroke-width="${borderWidth}" />
  <rect x="${width * 0.055}" y="${height * 0.04}" width="${width * 0.89}" height="${height * 0.92}" rx="${width * 0.05}" fill="none" stroke="${ink}" stroke-opacity="0.14" stroke-width="${width * 0.007}" />
  ${centerArtwork(face, ink, accent, width, height)}
  ${corner(face, ink, width, height, false)}
  ${corner(face, ink, width, height, true)}
</svg>`;
}

/** Rendert die Kartenrückseite im Stil des Decks. */
export function renderCardBackSvg(
  style: CardBackStyle = "classic",
  options: CardSvgOptions = {}
): string {
  const width = options.width ?? defaultWidth;
  const height = options.height ?? defaultHeight;
  const unit = width * 0.14;
  const patterns: Record<CardBackStyle, string> = {
    classic: `<circle cx="${unit / 2}" cy="${unit / 2}" r="${unit * 0.2}" fill="#f3ece0" opacity="0.75" />`,
    diamond: `<path d="M ${unit / 2} 0 L ${unit} ${unit / 2} L ${unit / 2} ${unit} L 0 ${unit / 2} Z" fill="#f3ece0" opacity="0.6" />`,
    wave: `<path d="M 0 ${unit * 0.5} Q ${unit * 0.25} 0 ${unit * 0.5} ${unit * 0.5} T ${unit} ${unit * 0.5}" fill="none" stroke="#f3ece0" stroke-opacity="0.65" stroke-width="${unit * 0.09}" />`,
    grid: `<path d="M ${unit} 0 L 0 0 0 ${unit}" fill="none" stroke="#f3ece0" stroke-opacity="0.5" stroke-width="${unit * 0.08}" />`
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="cardBackPattern" width="${unit}" height="${unit}" patternUnits="userSpaceOnUse">${patterns[style] ?? patterns.classic}</pattern>
  </defs>
  <rect x="${width * 0.008}" y="${width * 0.008}" width="${width * 0.984}" height="${height - width * 0.016}" rx="${width * 0.07}" fill="#8d5f4a" stroke="#fffbf4" stroke-width="${width * 0.018}" />
  <rect x="${width * 0.075}" y="${height * 0.055}" width="${width * 0.85}" height="${height * 0.89}" rx="${width * 0.05}" fill="url(#cardBackPattern)" opacity="0.55" />
  <rect x="${width * 0.075}" y="${height * 0.055}" width="${width * 0.85}" height="${height * 0.89}" rx="${width * 0.05}" fill="none" stroke="#f3ece0" stroke-opacity="0.7" stroke-width="${width * 0.008}" />
</svg>`;
}

/** Data-URI für <img>-Tags und Phaser-Texturen. */
export function cardSvgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Stabiler Texturschlüssel je Kartenbild. */
export function cardFaceTextureKey(face: CardFace, prefix = "card-table"): string {
  return `${prefix}:${face.color}:${face.rankLabel}:${face.suitSymbol}`;
}
