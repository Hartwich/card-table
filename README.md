# Kartentisch (card-table)

Wiederverwendbare Grundlage für Kartenspiele in Open Party Lab: ein gemeinsamer
Spieltisch auf dem großen Bildschirm, eine Kartenhand im Querformat auf dem
Handy und austauschbare Regelwerke.

## Enthaltene Kartenspiele

| Regelwerk | Kurz | Zeigt am Fundament |
| --- | --- | --- |
| **Mau-Mau** | 7 zieht zwei (stapelbar), 8 setzt aus, 9 dreht die Richtung, Bube wünscht sich eine Farbe. | Ablagestapel, Zusatzbedingung, Auswahl beim Legen |
| **Schwimmen (31)** | Drei Handkarten, drei offene Tischkarten. Einzeln oder alle tauschen, schieben, klopfen. Drei Leben, 31 ist Feuer. | Offene Tischzone, Auswahl gegen welche Tischkarte, mehrere Geber pro Runde |
| **Wizard** | Erst Stiche ansagen, dann spielen. Zauberer sticht alles, der Narr nichts. Runde 1 hat eine Karte, Runde 2 zwei, und so weiter. | Zwei Phasen, Stich als eigene Zone, echte Punktewertung |
| **Elfer raus** | Vier Farbreihen von 1 bis 20, eröffnet mit der Elf, dann an beiden Enden anlegen. | Mehrere Ablagereihen statt eines Stapels, eigenes Deck |
| **Freies Spiel** | Offener Tisch ohne Regeln: ziehen, ablegen, Zug von Hand weitergeben. | Vorlage für neue Regelwerke |

Das Regelwerk wird im Host-Setup ausgewählt. Mau-Mau, Schwimmen und Freies
Spiel nutzen das dort gewählte Deck; Wizard und Elfer raus bringen ihr eigenes
Blatt mit.

## Status

Alpha. Spielbar, aber Regeln, Tempo und Optik ändern sich noch.

## Aufbau

| Baustein | Datei |
| --- | --- |
| Deck-Definitionen und Presets | `src/cards/deckPresets.ts` |
| Tisch-Engine (Stapel, Hände, Zonen, Zugreihenfolge) | `src/cards/cardTable.ts` |
| Kartenbilder als SVG | `src/cards/cardSvg.ts` |
| Regelwerk-Vertrag | `src/rules/types.ts` |
| Regelwerke | `src/rules/{mauMau,schwimmen,wizard,elferRaus,freePlay}.ts` |
| Autoritative Runtime | `src/server/index.ts` |
| Spieltisch auf dem Host | `src/host/index.ts` |
| Controller-Modell | `src/controller/index.ts` |

Das Handkarten-Layout selbst (`card_hand`) liegt in der Plattform unter
`apps/controller/src/controller-ui/layouts/CardHandLayout.tsx`, damit weitere
Kartenspiele dieselbe Oberfläche verwenden können.

## Decks

`src/cards/deckPresets.ts` liefert fertige Decks und den Bauplan für eigene:

| Deck | Karten | Auswahl im Host-Setup |
| --- | --- | --- |
| Französisches Blatt | 52 | ja |
| Französisches Blatt + 2 Joker | 54 | ja |
| Deutsches Blatt / Skat | 32 | ja |
| Party-Deck (frei definiertes Beispiel) | 40 | ja |
| Doppeldeck + 4 Joker | 108 | ja |
| Wizard-Blatt (52 + 4 Zauberer + 4 Narren) | 60 | fest für Wizard |
| Zahlenblatt 1-20 | 80 | fest für Elfer raus |

Ein eigenes Deck entsteht mit `createCustomDeck({ id, label, suits, ranks })`.
Farben, Symbole, Rangfolge und Punktwerte sind frei wählbar; Kartenbild und
Rückseite werden daraus automatisch gerendert. Ränge dürfen für farblose Karten
ein eigenes Symbol, eine Farbe und einen Mitteltext tragen - so entstehen
Zauberer und Narr ohne Sonderfall in der Engine.

## Ein neues Kartenspiel bauen

Ein Regelwerk implementiert `CardRuleset` aus `src/rules/types.ts` und wird in
`src/rules/index.ts` eingetragen. Danach steht es im Host-Setup zur Auswahl.

Pflicht sind Kartenprüfung, Legen, Ziehen, Aktionen und Wertung. Optional
stehen bereit:

| Haken | Wofür |
| --- | --- |
| `fixedDeckId` / `allowedDeckIds` | eigenes Blatt erzwingen oder die Auswahl einschränken |
| `handSizeFor({ roundNumber, playerCount, configured })` | Handkarten pro Runde, z. B. steigend wie bei Wizard |
| `setupRound(state, context)` | Aufbau nach dem Austeilen: Trumpf, offene Tischkarten, leere Reihen |
| `tableStacks(state, context)` | eigene Tischstapel statt der generischen Zonen |
| `choiceForCard(state, context, cardId)` | Rückfrage vor dem Legen, z. B. Wunschfarbe oder Tauschziel |
| `privateNote(state, context, playerId)` | Hinweis, den nur dieser Spieler sieht |
| `condition(state, context)` | Zusatzbedingung als Chip auf Host und Handy |
| `seatStatus(state, context, playerId)` | kurzer Zustand am Sitzplatz, z. B. "Mau!" oder "2 Leben" |

Server-Runtime, Spieltisch und Handkarten bleiben unverändert. Eigene Zonen
(Stiche, Auslagen, Farbreihen) legt man im Tischzustand an; sie erscheinen
automatisch als weitere Stapel.

## Setup im Host-Lobby

- Regelwerk: Mau-Mau, Schwimmen, Wizard, Elfer raus oder Freies Spiel
- Kartendeck: eines der wählbaren Decks oben
- Handkarten: 3 bis 12 (Schwimmen spielt immer mit drei, Wizard mit einer
  Karte mehr pro Runde)

Während der Runde zeigt der Host die Buttons, die das Regelwerk liefert -
je nach Spiel Ziehen, Schieben, Klopfen, Ablage mischen oder Runde beenden.

## Entwicklung

```bash
npm install
npm run typecheck
npm run build
```

Danach im Plattform-Repo:

```bash
npm run games:sync-local
npm run typecheck
npm run dev:all
```

## Bekannte Grenzen

- Keine Ansagepflicht bei "Mau" - die letzte Karte wird nur angezeigt.
- Mau-Mau, Schwimmen, Elfer raus und Freies Spiel geben nur einen Punkt für den
  Rundensieg; Wizard rechnet die volle Wizard-Wertung.
- Schwimmen wechselt den Geber nicht, es beginnt immer der erste Sitzplatz.
- Wizard bestimmt bei einem Zauberer als Trumpfkarte eine zufällige Trumpffarbe,
  statt den Geber wählen zu lassen.
- Jeder Tischstapel zeigt höchstens drei Karten offen.

## Rechte

Alle Kartenbilder werden im Code als SVG erzeugt. Es werden keine externen
Assets ausgeliefert.
