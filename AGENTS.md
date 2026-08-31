# AI Agent Guide - Kartentisch

## Mental Model

- Der Server ist autoritativ. Regeln, Zugreihenfolge und Sieg gehören in
  `src/rules/*` und `src/server/index.ts`.
- Der Host zeichnet nur, was im `CardTablePublicState` steht. Keine
  Spiellogik in `src/host`.
- Der Controller schickt Absichten (`card-table:play`, `card-table:draw`,
  `card-table:action`) und entscheidet nichts selbst.
- `src/cards/*` ist regelfrei: Deck, Stapel, Hände, Zugreihenfolge,
  Kartenbilder.

## Ein neues Kartenspiel

1. Regelwerk in `src/rules/<spiel>.ts` nach `CardRuleset` implementieren.
2. In `src/rules/index.ts` eintragen.
3. Option im `lobbySetup` der `src/manifest.ts` ergänzen.
4. `npm run typecheck` und `npm run build`.

Vorlagen: `freePlay.ts` ist der kleinste Fall, `mauMau.ts` zeigt Sonderkarten,
`schwimmen.ts` offene Tischzonen und Auswahl beim Legen, `wizard.ts` mehrere
Phasen und eine echte Wertung, `elferRaus.ts` mehrere Ablagereihen.

Optionale Haken statt Sonderfällen in der Runtime: `fixedDeckId`,
`allowedDeckIds`, `handSizeFor`, `setupRound`, `tableStacks`, `choiceForCard`,
`privateNote`, `condition`, `seatStatus`.

Erst eine neue Layout-Variante bauen, wenn das `card_hand`-Layout die
Interaktion wirklich nicht abbildet - es gehört der Plattform und wird von
allen Kartenspielen geteilt.

## Protokoll-Kopie

`src/protocol.ts` und `packages/protocol/src/games/cardTable.ts` der Plattform
beschreiben dieselbe Form. Änderungen immer in beiden Dateien.

## Checks

```bash
npm run typecheck
npm run build
```
