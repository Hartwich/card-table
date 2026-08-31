import type Phaser from "phaser";
import {
  cardFaceTextureKey,
  cardSvgToDataUri,
  renderCardBackSvg,
  renderCardFaceSvg
} from "../cards/cardSvg.js";
import type { CardBackStyle } from "../cards/cardTypes.js";
import type { CardTableCardState } from "../protocol.js";

/**
 * SVG-Karten als Phaser-Texturen.
 *
 * Die Karten werden einmal je Kartenbild in voller Auflösung gerastert und
 * danach nur noch skaliert - so bleiben sie auf dem Fernseher scharf, ohne
 * dass Assets ausgeliefert werden müssen. Solange eine Textur noch lädt,
 * zeichnet die Szene eine schlichte Ersatzkarte.
 */

const textureWidth = 280;
const textureHeight = 392;
const requested = new Set<string>();

function requestTexture(scene: Phaser.Scene, key: string, svg: string): void {
  if (requested.has(key)) {
    return;
  }

  requested.add(key);
  scene.textures.addBase64(key, cardSvgToDataUri(svg));
}

/** Texturschlüssel einer Karte, oder null solange sie noch rastert. */
export function ensureCardTexture(scene: Phaser.Scene, card: CardTableCardState): string | null {
  const key = cardFaceTextureKey(card);

  if (scene.textures.exists(key)) {
    return key;
  }

  requestTexture(
    scene,
    key,
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
      { width: textureWidth, height: textureHeight }
    )
  );

  return null;
}

/** Texturschlüssel der Kartenrückseite, oder null solange sie noch rastert. */
export function ensureCardBackTexture(scene: Phaser.Scene, style: CardBackStyle): string | null {
  const key = `card-table:back:${style}`;

  if (scene.textures.exists(key)) {
    return key;
  }

  requestTexture(
    scene,
    key,
    renderCardBackSvg(style, { width: textureWidth, height: textureHeight })
  );

  return null;
}
