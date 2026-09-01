/**
 * Virtuelle Mitspieler.
 *
 * Die Plattform kennt nur echte, verbundene Spieler. KI-Sitze gehören deshalb
 * dem Kartentisch selbst: Sie stehen in der Zugreihenfolge wie alle anderen,
 * bekommen Hand, Sitzplatz und Punkte, tauchen aber nie in der Spielerliste des
 * Servers auf. Ihre Ids tragen ein eigenes Präfix, damit jede Stelle sie sicher
 * erkennt.
 */

export const botIdPrefix = "card-bot-";

export const maxBotSeats = 5;

export interface CardBotSeat {
  id: string;
  name: string;
  color: string;
}

export function isBotId(playerId: string): boolean {
  return playerId.startsWith(botIdPrefix);
}

const botNames = ["Ada", "Bruno", "Cleo", "Darius", "Elin"] as const;

const botColors = ["#8d5f4a", "#6f8f6a", "#b5763f", "#5f7d8d", "#8a6d9a"] as const;

/**
 * Baut die KI-Sitze einer Runde. Reihenfolge, Namen und Farben sind stabil.
 * Dass es ein Bot ist, sagt das Abzeichen am Sitzplatz - nicht der Name.
 */
export function createBotSeats(count: number): CardBotSeat[] {
  const total = Math.max(0, Math.min(maxBotSeats, Math.round(count)));

  return Array.from({ length: total }, (_, index) => ({
    id: `${botIdPrefix}${index + 1}`,
    name: botNames[index] ?? `Bot ${index + 1}`,
    color: botColors[index] ?? "#8d5f4a"
  }));
}
