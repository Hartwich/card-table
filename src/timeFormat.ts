import type { SupportedLanguage } from "@open-party-lab/game-core";

export function formatCompletionTime(durationMs: number, language?: SupportedLanguage): string {
  const centiseconds = Math.round(Math.max(0, durationMs) / 10);
  const minutes = Math.floor(centiseconds / 6000);
  const seconds = String(Math.floor(centiseconds / 100) % 60).padStart(2, "0");
  const fraction = String(centiseconds % 100).padStart(2, "0");
  return `${minutes}:${seconds}${language === "en" ? "." : ","}${fraction}`;
}
