# AI Agent Guide - Kartentisch

## Mental Model

- Der Server ist autoritativ. Regeln, Zugreihenfolge und Sieg gehören in
  `src/rules/*` und `src/server/index.ts`.
- Der Host zeichnet nur, was im `CardTablePublicState` steht. Keine
  Spiellogik in `src/host`. Der Tisch ist ein DOM-Overlay: `tableHtml.ts` baut
  reines Markup (ohne Phaser, damit einzeln testbar), `index.ts` hängt es in die
  Seite und hört auf den Raumzustand.
- Tischkarten und Stapel gehören auf den Host, nicht auf das Handy. Der
  Controller zeigt Handkarten und Aktionen.
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
`schwimmen.ts` offene Tischzonen und Auswahl beim Legen, `stichwette.ts` mehrere
Phasen und eine echte Wertung, `zahlenreihe.ts` mehrere Ablagereihen und einen
Zug aus mehreren Aktionen, `luegen.ts` einen verdeckten Stapel und Aktionen fuer
Spieler, die nicht am Zug sind, `schwarzerPeter.ts` blindes Ziehen aus einer
fremden Hand, `fischen.ts` eine Rueckfrage mit Spielerliste, `herzeln.ts`
Bedienzwang und negative Wertung, `doppelkopf.ts` verdeckte Parteien und eine
Trumpfordnung quer zu den Farben.

Jedes Regelwerk liefert über `rules()` seinen vollständigen Regeltext in DE und
EN. Der Host blendet ihn auf Knopfdruck ein - dort gehört alles hinein, was am
Tisch gefragt wird, nicht nur eine Kurzfassung.

Namen und Karten sind eigenständig zu halten: keine geschützten Spieltitel und
keine übernommenen Kartenbezeichnungen.

Optionale Haken statt Sonderfällen in der Runtime: `fixedDeckId`,
`allowedDeckIds`, `handSizeFor`, `setupRound`, `tableStacks`, `choiceForCard`,
`privateNote`, `condition`, `seatStatus`, `botMove`, `botActsOutOfTurn`.

## KI-Spieler

- KI-Sitze gehören dem Kartentisch, nicht der Plattform. Ihre Ids tragen das
  Präfix aus `bots/botSeats.ts`; `handleInput` weist Eingaben mit einer Bot-Id
  grundsätzlich ab.
- Ein Bot liefert nur eine **Absicht** (`CardBotIntent`). Der Antrieb in
  `bots/driver.ts` schickt sie durch dieselben `playCard`/`drawCard`/`runAction`
  wie den Input eines Handys. Nie einen Sonderweg für Bots einbauen - was ein
  Bot darf, muss auch ein Mensch dürfen.
- `botMove` gehört in die Datei des Regelwerks, direkt neben seine Regeln. Ohne
  den Haken übernimmt `bots/fallback.ts`.
- Zufall in einer Heuristik muss stabil sein: Der Antrieb fragt jeden Tick neu,
  ein echter Würfel würde eine seltene Entscheidung deshalb trotzdem irgendwann
  auslösen. Dafür gibt es `stableChance` in `bots/tactics.ts`.
- Ein Bot darf nur wissen, was am Tisch liegt und was er selbst hält. Verdeckte
  Informationen aus `extra` - fremde Parteien, fremde Hände - bleiben tabu, auch
  wenn der Zustand sie hergibt.

Erst eine neue Layout-Variante bauen, wenn das `card_hand`-Layout die
Interaktion wirklich nicht abbildet - es gehört der Plattform und wird von
allen Kartenspielen geteilt.

## Tischstapel

- `layout: "pile"` (Voreinstellung) ist ein Haufen: `cards[0]` oben, höchstens
  drei sichtbar. `layout: "spread"` ist eine Auslage: alle Karten, in
  Modellreihenfolge. Wer einen Stich schickt, nimmt `spread` - sonst schneidet
  der Renderer ab der vierten Karte ab.
- Ein fertiger Stich gehört nicht sofort ins Archiv. Die Stichspiele legen ihn
  in die Zone `letzter-stich` und räumen ihn erst weg, wenn der nächste Stich
  komplett ist. Der Kartenort ist für die Wertung egal, die Zähler stehen in
  `extra`.

## Eigene Lobby-Optionen

Die Runtime reicht die Raumeinstellungen unverändert als `context.settings`
durch. Ein Regelwerk liest daraus mit `readSetting(context, key, fallback)` und
braucht dafür keine Änderung am Server - nur ein Feld im `lobbySetup` des
Manifests und die Annahme in `configure-lobby`.

Ein Feld, das nur für einen Teil der Regelwerke gilt, bekommt `visibleWhen` und
verschwindet sonst aus der Lobby. Nie ein wirkungsloses Feld stehen lassen: Wer
bei Doppelkopf ein Kartendeck wählen darf, ohne dass es etwas ändert, hält das
zu Recht für einen Fehler.

## Sitzplätze

`minSeats` am Regelwerk ist die Mindestbesetzung, Menschen und KI zusammen. Der
Server füllt fehlende Plätze automatisch mit KI-Sitzen auf, damit eine Person
allein starten kann. Die Zahl gehört ans Regelwerk, nicht in die Runtime - nur
das Spiel weiss, wie viele Hände es braucht.

## Protokoll-Kopie

`src/protocol.ts` und `packages/protocol/src/games/cardTable.ts` der Plattform
beschreiben dieselbe Form. Änderungen immer in beiden Dateien.

## Checks

```bash
npm run typecheck
npm run build
```
