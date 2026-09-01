# Kartentisch (card-table)

Wiederverwendbare Grundlage für Kartenspiele in Open Party Lab: ein gemeinsamer
Spieltisch auf dem großen Bildschirm, eine Kartenhand im Querformat auf dem
Handy und austauschbare Regelwerke.

## Enthaltene Kartenspiele

| Regelwerk | Kurz | Zeigt am Fundament |
| --- | --- | --- |
| **Mau-Mau** | Farbe oder Wert bedienen. 7 zieht zwei (stapelbar), 8 setzt aus, 9 dreht die Richtung (zu zweit: aussetzen), Bube wünscht sich eine Farbe. | Ablagestapel, Zusatzbedingung, Auswahl beim Legen |
| **Schwimmen (31)** | Drei Handkarten, drei offene Tischkarten. Einzeln oder alle tauschen, schieben, klopfen. Drei Leben, 31 ist Feuer. | Offene Tischzone, Auswahl des Tauschziels, mehrere Geber pro Runde |
| **Stichwette** | Erst Stiche ansagen, dann spielen. Kronen stechen alles, Federn verlieren immer. Runde 1 hat eine Karte, Runde 2 zwei, und so weiter. | Zwei Phasen, Stich als eigene Zone, echte Punktewertung |
| **Zahlenreihe** | Vier Farbreihen von 1 bis 20, jede eröffnet mit der Elf. Pro Zug so viele Karten anlegen, wie passen und gewollt sind. | Mehrere Ablagereihen statt eines Stapels, mehrteiliger Zug, eigenes Deck |
| **Lügen** | Karten verdeckt auf den Stapel legen und den Wert ansagen — auch falsch. Wer zweifelt und danebenliegt, nimmt den ganzen Stapel. | Verdeckte Zone, Ansage als Zustand, Aktionen für Nicht-Aktive |
| **Schwarzer Peter** | Paare ablegen, beim Nachbarn blind eine Karte ziehen. Wer am Ende die einzelne Karte hält, verliert. | Automatisches Ablegen, blindes Ziehen aus fremder Hand, eigenes Deck |
| **Fischen** | Einen Mitspieler nach einem Wert fragen. Vier gleiche wandern als Satz auf den Tisch, sonst wird gefischt. | Auswahl eines Mitspielers, Auslagen als eigene Zonen |
| **Herzeln** | Stiche vermeiden: jedes Herz zählt 1, die Pik-Dame 13. Farbe bedienen, Herz erst nach dem Bruch. Alle Strafpunkte auf einmal drehen die Wertung um. | Bedienzwang, negative Wertung, Sonderregel über die ganze Runde |
| **Doppelkopf** | Jede Karte doppelt. Karo, alle Damen, alle Buben und die Herz-Zehn sind Trumpf. Die Kreuz-Damen bilden Re gegen Kontra. | Verdeckte Parteien, Trumpfordnung quer zu den Farben, Wertung nach Augen |
| **Freies Spiel** | Offener Tisch ohne Regeln: ziehen, ablegen, Zug von Hand weitergeben. | Vorlage für neue Regelwerke |

Die vollständigen Regeln jedes Spiels stehen im Regelwerk selbst und werden auf
dem Host über den **Regeln**-Button eingeblendet — Ziel, Zugablauf, was angelegt
werden darf, Sonderkarten und Wertung.

Stichwette und Zahlenreihe sind eigenständige Umsetzungen klassischer
Spielmechaniken mit eigenen Namen, eigenen Karten und eigener Wertung.

## Status

Alpha. Spielbar, aber Regeln, Tempo und Optik ändern sich noch.

## Wer zeigt was

Der **Host** ist der Spieltisch und bekommt die ganze Fläche: Nachziehstapel,
Ablage, Stich, offene Tischkarten und Farbreihen, dazu die Sitzplätze mit
Kartenzahl und die Buttons des Regelwerks. Die Kopfzeile bleibt bewusst karg —
Spielname, ein Chip für eine aktive Zusatzbedingung (Wunschfarbe, Trumpf, "+2"),
der Richtungspfeil und ein kleiner Regeln-Button. Wer am Zug ist, zeigt der
hervorgehobene Sitzplatz statt einer Textzeile; alles Erklärende liegt hinter
dem Regeln-Button und deckt den Tisch nur zu, solange jemand nachliest.
Gezeichnet wird als DOM-Overlay über der Phaser-Bühne.

Das **Handy** zeigt nur das eigene Blatt: Handkarten, Aktionen und einen kurzen
Kopf mit Zug, Sonderbedingung und privatem Hinweis. Tischkarten und Stapel
werden dort bewusst nicht wiederholt.

## KI-Spieler

Im Host-Setup steht ein Feld **KI-Spieler** (0 bis 5). Die gewählten Sitze
kommen als virtuelle Mitspieler an den Tisch: eigene Farbe, eigener Sitzplatz
mit **KI**-Abzeichen, eigene Hand, eigene Punkte. Sie füllen bis zu sechs Plätze
auf, spielen nach demselben Regelwerk wie alle anderen und lassen sich so mit
einer einzigen Person am Tisch verwenden.

Vor jedem Zug legt ein Bot eine sichtbare Denkpause von etwa 1,2 Sekunden ein,
damit am Tisch nachvollziehbar bleibt, was passiert ist.

Wichtig für die Architektur: Ein Bot bekommt keinen Sonderweg. Der Antrieb in
`src/bots/driver.ts` fragt das Regelwerk nur nach einer *Absicht* und schickt
sie anschließend durch genau dieselben Funktionen wie den Input eines Handys.
Ein Bot kann damit nicht an den Regeln vorbeispielen.

Jedes Regelwerk bringt seine eigene Taktik mit:

| Regelwerk | Wie der Bot denkt |
| --- | --- |
| Mau-Mau | Sonderkarten sind Munition: 7 und 8 kommen, sobald jemand kurz vor dem Sieg steht. Der Bube bleibt bis zuletzt liegen, gewünscht wird die längste Farbe der Resthand. |
| Schwimmen | Rechnet jeden Einzeltausch und den Komplettausch durch und nimmt den besten. Ab 27 Punkten wird geklopft, darunter geschoben. |
| Stichwette | Schätzt die Hand für die Ansage (Kronen sicher, hohe Trümpfe fast). Danach zählt nur die Differenz: Wer Stiche braucht, gewinnt so billig wie möglich; wer genug hat, wirft hoch ab. |
| Zahlenreihe | Legt so lange, wie etwas passt, und beginnt mit den Karten, die direkt an ein Reihenende anschließen. |
| Lügen | Ehrlich, solange die geforderte Karte da ist; sonst Bluff mit der Karte, die am längsten nicht gefragt ist. Gezweifelt wird, wenn der Bot den angesagten Wert selbst häuft - und lieber bei kleinem Stapel. |
| Schwarzer Peter | Reines Glück, hier gibt es nichts zu entscheiden: Der Bot zieht. |
| Fischen | Fragt nach dem Wert, von dem er selbst am meisten hat, und wendet sich an den Mitspieler mit den meisten Karten. |
| Herzeln | Kann er verlieren, wirft er das Teuerste ab - die Pik-Dame zuerst. Muss er nehmen, nimmt er so billig wie möglich. |
| Doppelkopf | Zieht Trumpf bei langer Hand, sticht nur fette Stiche und dann billig, wirft sonst augenarm ab. Er schaut ausdrücklich **nicht** in die Parteien der anderen. |
| Freies Spiel | Ohne Regeln keine Taktik - hier übernimmt der generische Bot. |

Regelwerke ohne eigenen `botMove` fallen automatisch auf `src/bots/fallback.ts`
zurück: Der fragt das Regelwerk, welche Karte gelegt werden darf und welche
Aktionen freigeschaltet sind, und spielt damit regelkonform, aber ohne Plan.

Die Plattform selbst kennt keine KI-Sitze - sie zählt nur echte Spieler. Der
Kartentisch führt die Punkte seiner Bots deshalb selbst und zeigt sie im eigenen
Ergebnisbildschirm; über Runden hinweg trägt er sie aus der Vorrunde weiter.

## Aufbau

| Baustein | Datei |
| --- | --- |
| Deck-Definitionen und Presets | `src/cards/deckPresets.ts` |
| Tisch-Engine (Stapel, Hände, Zonen, Zugreihenfolge) | `src/cards/cardTable.ts` |
| Kartenbilder als SVG, drei Stile | `src/cards/cardSvg.ts` |
| Regelwerk-Vertrag | `src/rules/types.ts` |
| Regelwerke | `src/rules/*.ts` (ein Spiel pro Datei, Registry in `src/rules/index.ts`) |
| Autoritative Runtime | `src/server/index.ts` |
| Host-Szene mit DOM-Overlay | `src/host/index.ts` |
| Tisch-Markup (ohne Phaser, einzeln testbar) | `src/host/tableHtml.ts` |
| Kartenbilder als HTML | `src/host/cardHtml.ts` |
| Intro- und Ergebnisbildschirm | `src/host/roundScreens.ts` |
| Controller-Modell | `src/controller/index.ts` |
| KI-Sitze, Antrieb, generischer Bot | `src/bots/{botSeats,driver,fallback,tactics}.ts` |

Das Handkarten-Layout selbst (`card_hand`) liegt in der Plattform unter
`apps/controller/src/controller-ui/layouts/CardHandLayout.tsx`, damit weitere
Kartenspiele dieselbe Oberfläche verwenden können.

## Decks und Kartenbilder

`src/cards/deckPresets.ts` liefert fertige Decks und den Bauplan für eigene:

| Deck | Karten | Auswahl im Host-Setup |
| --- | --- | --- |
| Französisches Blatt | 52 | ja |
| Französisches Blatt + 2 Joker | 54 | ja |
| Deutsches Blatt / Skat | 32 | ja |
| Party-Deck (frei definiertes Beispiel) | 40 | ja |
| Doppeldeck + 4 Joker | 108 | ja |
| Stichwette-Blatt (52 + 4 Kronen + 4 Federn) | 60 | fest für Stichwette |
| Zahlenblatt 1-20 | 80 | fest für Zahlenreihe |
| Peter-Blatt (Französisch ohne Damen + 1 Peter) | 49 | fest für Schwarzer Peter |
| Doppelkopf-Blatt (9 bis Ass, jede Karte doppelt) | 48 | fest für Doppelkopf |

Dazu drei Kartenbilder, die Host und Handy gemeinsam nutzen:

- **Klassisch** — weißes Blatt mit Serifen, Eckzeichen und echten Pips.
- **Modern** — farbiges Feld mit großer Ziffer, aus einigen Metern noch lesbar.
- **Klar** — sehr reduziert: riesige Zahl, kleines Farbzeichen. Passt gut zum
  Zahlenblatt bis 20.

Ein eigenes Deck entsteht mit `createCustomDeck({ id, label, suits, ranks })`.
Farben, Symbole, Rangfolge und Punktwerte sind frei wählbar; Kartenbild und
Rückseite werden daraus automatisch gerendert. Ränge dürfen für farblose Karten
ein eigenes Symbol, eine Farbe und einen Mitteltext tragen — so entstehen Krone,
Feder und Peter ohne Sonderfall in der Engine. Über `copies` je Karte entsteht
ein Blatt mit Mehrfachkarten wie beim Doppelkopf.

## Ein neues Kartenspiel bauen

Ein Regelwerk implementiert `CardRuleset` aus `src/rules/types.ts` und wird in
`src/rules/index.ts` eingetragen. Danach steht es im Host-Setup zur Auswahl.

Pflicht sind Kartenprüfung, Legen, Ziehen, Aktionen, Wertung und der Regeltext.
Optional stehen bereit:

| Haken | Wofür |
| --- | --- |
| `fixedDeckId` / `allowedDeckIds` | eigenes Blatt erzwingen oder die Auswahl einschränken |
| `handSizeFor({ roundNumber, playerCount, configured })` | Handkarten pro Runde, z. B. steigend wie bei der Stichwette |
| `setupRound(state, context)` | Aufbau nach dem Austeilen: Trumpf, Parteien, offene Tischkarten, leere Reihen |
| `tableStacks(state, context)` | eigene Tischstapel statt der generischen Zonen |
| `choiceForCard(state, context, cardId)` | Rückfrage vor dem Legen, z. B. Wunschfarbe, Tauschziel oder Mitspieler |
| `privateNote(state, context, playerId)` | Hinweis, den nur dieser Spieler sieht |
| `condition(state, context)` | Zusatzbedingung als Chip auf Host und Handy |
| `seatStatus(state, context, playerId)` | kurzer Zustand am Sitzplatz, z. B. "Mau!" oder "2 Leben" |
| `botMove(state, context, playerId)` | Taktik der KI-Spieler; ohne diesen Haken spielt der generische Bot |
| `botActsOutOfTurn` | auch KI-Sitze fragen, die nicht am Zug sind (Zwischenrufe wie das Zweifeln bei Lügen) |

Server-Runtime, Spieltisch und Handkarten bleiben unverändert. Eigene Zonen
(Stiche, Auslagen, Farbreihen, verdeckte Stapel) legt man im Tischzustand an;
sie erscheinen automatisch als weitere Stapel. Ein Zug darf aus mehreren
Aktionen bestehen — die Zahlenreihe gibt erst ab, wenn nichts mehr passt oder
der Spieler „Fertig" drückt. Aktionen dürfen auch Spielern gehören, die nicht am
Zug sind: bei Lügen darf jeder zweifeln.

## Setup im Host-Lobby

- Regelwerk: Mau-Mau, Schwimmen, Stichwette, Zahlenreihe, Lügen, Schwarzer
  Peter, Fischen, Herzeln, Doppelkopf oder Freies Spiel
- Kartendeck: eines der wählbaren Decks oben (Regelwerke mit festem Blatt
  überschreiben die Auswahl)
- Handkarten: 3 bis 12 (Schwimmen spielt immer mit drei, die Stichwette mit
  einer Karte mehr pro Runde, Schwarzer Peter, Herzeln und Doppelkopf teilen
  das ganze Blatt aus)
- KI-Spieler: 0 bis 5, gedeckelt auf sechs Sitze insgesamt
- Kartenbild: Klassisch, Modern oder Klar

Während der Runde zeigt der Host die Buttons, die das Regelwerk liefert —
je nach Spiel Ziehen, Fertig, Schieben, Klopfen, Zweifeln, Ablage mischen oder
Runde beenden.

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

- Keine Ansagepflicht bei "Mau" — die letzte Karte wird nur angezeigt.
- Außer Stichwette, Herzeln und Doppelkopf geben alle Regelwerke nur einen Punkt
  für den Rundensieg.
- Schwimmen wechselt den Geber nicht, es beginnt immer der erste Sitzplatz.
- Die Stichwette wählt bei einer Krone als Trumpfkarte eine zufällige
  Trumpffarbe, statt den Geber entscheiden zu lassen.
- Doppelkopf kennt weder Ansagen (Re/Kontra) noch Solo oder Hochzeit; die
  Parteien stehen mit den Kreuz-Damen fest.
- Herzeln schiebt vor der Runde keine Karten weiter.
- Jeder Tischstapel zeigt auf dem Host höchstens drei Karten offen.
- Der Host-Tisch ist auf Querformat ausgelegt; unter etwa 1000 px Breite wird es
  eng.
- Die Denkpause der KI-Spieler ist fest (rund 1,2 Sekunden) und nicht einstellbar.
- KI-Punkte erscheinen nur im Ergebnisbildschirm des Spiels, nicht in der
  Rangliste der Plattform - die kennt ausschließlich echte Spieler.
- Der Doppelkopf-Bot spielt ohne Partnerwissen; er sticht deshalb gelegentlich
  den eigenen Partner ab.

## Rechte

Alle Kartenbilder werden im Code als SVG erzeugt. Es werden keine externen
Assets ausgeliefert.
