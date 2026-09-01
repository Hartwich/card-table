import { renderCardBackSvg, renderCardFaceSvg, type CardArtStyle } from "../cards/cardSvg.js";
import type { CardBackStyle } from "../cards/cardTypes.js";
import type { CardTableCardState, CardTableStackState } from "../protocol.js";

/**
 * Kartenbilder für den Spieltisch.
 *
 * Der Host zeichnet die Karten nicht mit Phaser, sondern bettet dasselbe SVG
 * direkt in die Seite ein, das auch das Handy rendert. Das spart den Umweg über
 * Texturen und hält beide Ansichten deckungsgleich.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Setzt die Anzeigegröße, ohne das gerenderte SVG neu zu bauen. */
function sized(svg: string, width: number): string {
  return svg.replace(
    "<svg ",
    `<svg style="width:${width}px;height:${Math.round(width * 1.4)}px;display:block" `
  );
}

export function cardFaceHtml(
  card: CardTableCardState,
  width: number,
  style: CardArtStyle = "classic"
): string {
  return sized(
    renderCardFaceSvg(
      {
        cardId: card.cardId,
        suitId: card.suitId,
        suitSymbol: card.suitSymbol,
        suitLabel: card.suitLabel,
        rankLabel: card.rankLabel,
        color: card.color,
        centerLabel: card.centerLabel
      },
      { width: 200, height: 280, style }
    ),
    width
  );
}

export function cardBackHtml(style: CardBackStyle, width: number): string {
  return sized(renderCardBackSvg(style, { width: 200, height: 280 }), width);
}

function emptySlotHtml(width: number): string {
  return `<span class="ct-slot" style="width:${width}px;height:${Math.round(width * 1.4)}px"></span>`;
}

/** Ein Tischstapel: verdeckt als Kartenrücken mit Zahl, offen als Fächer. */
export function stackHtml(
  stack: CardTableStackState,
  backStyle: CardBackStyle,
  cardWidth: number,
  cardStyle: CardArtStyle = "classic"
): string {
  const cardHeight = Math.round(cardWidth * 1.4);
  const label = `<span class="ct-stack-label">${escapeHtml(stack.label)}<b>${stack.count}</b></span>`;
  let body: string;

  if (stack.faceDown) {
    const layers = stack.count === 0 ? 0 : Math.min(3, Math.max(1, Math.ceil(stack.count / 12)));
    const inner =
      layers === 0
        ? emptySlotHtml(cardWidth)
        : Array.from({ length: layers }, (_, index) => {
            const offset = (layers - 1 - index) * 5;
            return `<span class="ct-layer" style="transform:translate(${offset}px,-${offset}px)">${cardBackHtml(backStyle, cardWidth)}</span>`;
          }).join("");

    body = `<div class="ct-stack-cards is-pile" style="width:${cardWidth}px;height:${cardHeight}px">${inner}</div>`;
  } else if (stack.layout === "spread") {
    // Auslage: Ein Stich liegt vollständig auf dem Tisch, in Spielreihenfolge
    // von links nach rechts. Je mehr Karten, desto schmaler - sonst passt die
    // Reihe irgendwann nicht mehr neben die anderen Stapel.
    const scale = Math.min(1, Math.max(0.62, 3 / Math.max(1, stack.cards.length)));
    const width = Math.round(cardWidth * scale);
    const inner =
      stack.cards.length === 0
        ? emptySlotHtml(cardWidth)
        : stack.cards
            .map((card, index) => {
              const shift = index === 0 ? 0 : Math.round(width * -0.18);
              return `<span class="ct-fan" style="margin-left:${shift}px;z-index:${index + 1}">${cardFaceHtml(card, width, cardStyle)}</span>`;
            })
            .join("");

    body = `<div class="ct-stack-cards">${inner}</div>`;
  } else {
    // Haufen: Oberste Karte zuerst im Modell, im DOM aber zuletzt - so liegt
    // sie vorn. Mehr als drei Lagen bringen optisch nichts.
    const ordered = stack.cards.slice(0, 3).reverse();
    const inner =
      ordered.length === 0
        ? emptySlotHtml(cardWidth)
        : ordered
            .map((card, index) => {
              const shift = index === 0 ? 0 : Math.round(cardWidth * -0.55);
              return `<span class="ct-fan" style="margin-left:${shift}px;z-index:${index + 1}">${cardFaceHtml(card, cardWidth, cardStyle)}</span>`;
            })
            .join("");

    body = `<div class="ct-stack-cards">${inner}</div>`;
  }

  return `<div class="ct-stack">${body}${label}</div>`;
}
