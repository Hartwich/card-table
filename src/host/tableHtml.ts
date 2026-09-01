import type { CardTableActionState, CardTablePublicState, CardTableSeatState } from "../protocol.js";
import { cardBackHtml, escapeHtml, stackHtml } from "./cardHtml.js";

/**
 * Der Spieltisch als HTML.
 *
 * Bewusst ohne Phaser und ohne DOM-Zugriff: Diese Datei baut nur Markup, damit
 * sie sich einzeln testen und als Vorschau rendern lässt. Die Szene hängt das
 * Ergebnis in die Seite.
 *
 * Der Tisch bekommt die ganze Fläche. Alles Erklärende - die vollständigen
 * Regeln - liegt hinter dem Regeln-Button und deckt den Tisch nur zu, solange
 * jemand nachliest.
 */

export type CardTableLanguage = "de" | "en";

export function cardTableLabels(language?: CardTableLanguage) {
  const en = language === "en";

  return {
    waiting: en ? "Waiting for the card table." : "Warte auf den Kartentisch.",
    rules: en ? "Rules" : "Regeln",
    bot: en ? "AI" : "KI",
    close: en ? "Close" : "Schließen",
    rulesFor: en ? "Rules" : "Spielregeln"
  };
}

/**
 * Kartenbreite nach dem Platzbedarf der Stapel.
 *
 * Ein Haufen braucht eine Spalte, eine Auslage so viele, wie sie Karten zeigt -
 * ein Vier-Karten-Stich ist deutlich breiter als ein Ablagestapel. Die Reihe
 * soll auf einen Blick passen, statt umzubrechen.
 */
function cardWidthFor(stacks: CardTablePublicState["stacks"]): number {
  const columns = stacks.reduce(
    (sum, stack) =>
      sum + (stack.layout === "spread" ? Math.max(1, stack.cards.length * 0.55) : 1),
    0
  );

  if (columns <= 2) {
    return 200;
  }

  if (columns <= 3) {
    return 176;
  }

  if (columns <= 4) {
    return 152;
  }

  return columns <= 6 ? 128 : 108;
}

function seatHtml(
  seat: CardTableSeatState,
  backStyle: CardTablePublicState["backStyle"],
  botLabel: string
): string {
  const mini = Array.from({ length: Math.min(5, seat.handCount) }, (_, index) =>
    `<span class="ct-mini" style="margin-left:${index === 0 ? 0 : -14}px">${cardBackHtml(backStyle, 24)}</span>`
  ).join("");
  const badge = seat.isBot ? `<em class="ct-seat-bot">${escapeHtml(botLabel)}</em>` : "";

  return `<div class="ct-seat${seat.isActive ? " is-active" : ""}${seat.connected ? "" : " is-away"}${seat.isBot ? " is-bot" : ""}">
    <span class="ct-seat-dot" style="background:${escapeHtml(seat.color)}"></span>
    <div class="ct-seat-body">
      <span class="ct-seat-name">${escapeHtml(seat.name)}${badge}</span>
      <span class="ct-seat-meta"><b>${seat.handCount}</b>${seat.statusLabel ? `<i>${escapeHtml(seat.statusLabel)}</i>` : ""}</span>
    </div>
    <div class="ct-seat-hand">${mini}</div>
  </div>`;
}

function actionHtml(action: CardTableActionState): string {
  return `<button type="button" class="ct-action is-${action.kind}" data-card-table-action="${escapeHtml(action.id)}"${action.enabled ? "" : " disabled"}>${escapeHtml(action.label)}</button>`;
}

function rulesHtml(state: CardTablePublicState, language: CardTableLanguage | undefined): string {
  const text = cardTableLabels(language);
  const sections = state.rules
    .map(
      (section) => `<section>
        <h3>${escapeHtml(section.title)}</h3>
        <ul>${section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
      </section>`
    )
    .join("");

  return `<div class="ct-rules">
    <div class="ct-rules-card">
      <header>
        <h2>${escapeHtml(text.rulesFor)}: ${escapeHtml(state.title)}</h2>
        <button type="button" class="ct-action is-primary" data-card-table-panel="close">${escapeHtml(text.close)}</button>
      </header>
      <div class="ct-rules-body">${sections}</div>
    </div>
  </div>`;
}

/**
 * Vollständiges Tisch-Markup für einen Rundenzustand.
 *
 * Die Kopfzeile bleibt bewusst karg: Wer am Zug ist, zeigt der hervorgehobene
 * Sitzplatz, und alles Erklärende steht hinter dem Regeln-Button. Oben bleiben
 * nur der Spielname, eine aktive Zusatzbedingung, die Spielrichtung und ein
 * Fehlerhinweis, wenn wirklich etwas schiefgeht.
 */
export function renderCardTableHtml(
  state: CardTablePublicState,
  language: CardTableLanguage | undefined,
  options: { rulesOpen?: boolean } = {}
): string {
  const text = cardTableLabels(language);
  const cardWidth = cardWidthFor(state.stacks);
  const condition = state.conditionLabel
    ? `<span class="ct-chip">${escapeHtml(`${state.conditionSymbol ?? ""} ${state.conditionLabel}`.trim())}</span>`
    : "";
  const error = state.lastError
    ? `<span class="ct-chip is-error">${escapeHtml(state.lastError)}</span>`
    : "";

  return `<div class="ct-table">
    <header class="ct-head">
      <span class="ct-head-title">${escapeHtml(state.title)}</span>
      <div class="ct-head-side">
        ${error}
        ${condition}
        <span class="ct-meta">${state.direction === 1 ? "→" : "←"}</span>
        <button type="button" class="ct-rules-button" data-card-table-panel="rules">${escapeHtml(text.rules)}</button>
      </div>
    </header>
    <div class="ct-seats">${state.seats.map((seat) => seatHtml(seat, state.backStyle, text.bot)).join("")}</div>
    <div class="ct-stacks">${state.stacks.map((stack) => stackHtml(stack, state.backStyle, cardWidth, state.cardStyle)).join("")}</div>
    <footer class="ct-actions">${state.hostActions.map(actionHtml).join("")}</footer>
  </div>
  ${options.rulesOpen ? rulesHtml(state, language) : ""}`;
}

export const cardTableStyles = `
.ct-root{position:absolute;inset:0;z-index:1;box-sizing:border-box;padding:16px;display:grid;
  grid-template-columns:minmax(0,1fr);pointer-events:none;
  background:var(--ct-paper);color:var(--ct-ink);font-family:var(--ct-body)}
.ct-root *{box-sizing:border-box}
.ct-root.is-screen{place-items:center}
.ct-table{position:relative;display:grid;grid-template-rows:auto auto 1fr auto;gap:12px;padding:16px 20px;
  border-radius:28px;border:10px solid #3c5748;overflow:hidden;
  background:radial-gradient(120% 100% at 50% 0%,#5b7d67 0%,#47654f 60%,#3f5a48 100%);
  box-shadow:inset 0 0 60px rgba(0,0,0,.28)}
.ct-head{display:flex;align-items:center;justify-content:space-between;gap:14px;color:#f7f1e7}
.ct-head-title{font-family:var(--ct-display);font-size:1.05rem;opacity:.72;white-space:nowrap}
.ct-head-side{display:flex;align-items:center;gap:10px;min-width:0}
.ct-meta{font-size:1.05rem;opacity:.55}
.ct-chip{padding:2px 11px;border-radius:999px;font-weight:600;font-size:.9rem;white-space:nowrap;
  background:rgba(255,251,244,.16);border:1px solid rgba(255,251,244,.45)}
.ct-chip.is-error{background:rgba(169,59,49,.9);border-color:#ffd7d1;max-width:38vw;overflow:hidden;text-overflow:ellipsis}
.ct-rules-button{pointer-events:auto;min-height:32px;padding:0 14px;border-radius:999px;cursor:pointer;
  font-family:var(--ct-body);font-size:.82rem;font-weight:600;color:#f7f1e7;
  border:1px solid rgba(255,251,244,.45);background:rgba(43,38,32,.55)}
.ct-rules-button:hover{background:rgba(43,38,32,.85);border-color:rgba(255,251,244,.8)}
.ct-seats{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.ct-seat{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:14px;min-width:190px;
  background:rgba(43,38,32,.72);border:1px solid rgba(255,255,255,.14);color:#f7f1e7}
.ct-seat.is-active{border-color:var(--ct-accent);background:rgba(43,38,32,.96);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--ct-accent) 60%,transparent),0 10px 26px rgba(0,0,0,.3);
  transform:translateY(-3px)}
.ct-seat.is-active::before{content:"▶";position:absolute;left:-16px;color:var(--ct-accent);font-size:.9rem}
.ct-seat{position:relative;transition:transform .15s ease}
.ct-seat.is-away{opacity:.5}
.ct-seat-dot{width:9px;height:34px;border-radius:5px;flex:0 0 auto}
.ct-seat-body{display:grid;gap:2px;min-width:0;flex:1 1 auto}
.ct-seat-name{display:flex;align-items:center;gap:7px;font-family:var(--ct-display);font-size:1.05rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-seat-bot{flex:0 0 auto;font-style:normal;font-family:var(--ct-body);font-size:.62rem;font-weight:700;
  letter-spacing:.09em;padding:2px 6px;border-radius:6px;color:#f7f1e7;
  background:rgba(255,251,244,.16);border:1px solid rgba(255,251,244,.4)}
.ct-seat.is-bot{border-style:dashed}
.ct-seat-meta{display:flex;align-items:baseline;gap:8px;font-size:.82rem;opacity:.85}
.ct-seat-meta b{font-family:var(--ct-display);font-size:1.35rem;opacity:1}
.ct-seat-meta i{font-style:normal;color:var(--ct-accent);font-weight:700}
.ct-seat-hand{display:flex;flex:0 0 auto}
.ct-mini{display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
.ct-stacks{display:flex;align-items:center;justify-content:center;gap:clamp(18px,3.4vw,52px);flex-wrap:wrap}
.ct-stack{display:grid;gap:10px;justify-items:center}
.ct-stack-cards{display:flex;align-items:flex-end}
.ct-stack-cards.is-pile{position:relative}
.ct-stack-cards.is-pile .ct-layer{position:absolute;left:0;top:0}
.ct-fan,.ct-layer{display:block;position:relative;filter:drop-shadow(0 8px 14px rgba(0,0,0,.35))}
.ct-fan[data-top]{filter:drop-shadow(0 10px 18px rgba(0,0,0,.45))}
.ct-slot{display:block;border-radius:10px;border:2px dashed rgba(247,241,231,.35);background:rgba(255,255,255,.06)}
.ct-stack-label{display:inline-flex;gap:8px;align-items:baseline;color:#f3ece0;font-size:1rem;
  background:rgba(43,38,32,.6);padding:4px 14px;border-radius:999px}
.ct-stack-label b{font-family:var(--ct-display);font-size:1.15rem}
.ct-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;pointer-events:auto}
.ct-action{pointer-events:auto;min-width:150px;min-height:52px;padding:0 22px;border-radius:14px;cursor:pointer;
  font-family:var(--ct-display);font-size:1.05rem;color:#fffbf4;border:2px solid rgba(255,251,244,.75);
  background:rgba(43,38,32,.82);transition:transform .12s ease,filter .12s ease}
.ct-action.is-primary{background:var(--ct-accent);border-color:#fffbf4}
.ct-action.is-danger{background:var(--ct-danger);border-color:#fffbf4}
.ct-action:hover:not(:disabled){transform:translateY(-2px);filter:brightness(1.08)}
.ct-action:disabled{opacity:.42;cursor:default}
.ct-rules{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:26px;
  background:rgba(36,49,58,.62);pointer-events:auto}
.ct-rules-card{width:min(1080px,100%);max-height:100%;display:grid;grid-template-rows:auto minmax(0,1fr);
  gap:14px;padding:22px 26px;border-radius:22px;background:var(--ct-surface);border:1px solid var(--ct-line);
  box-shadow:0 24px 70px rgba(60,43,26,.32)}
.ct-rules-card header{display:flex;align-items:center;justify-content:space-between;gap:20px}
.ct-rules-card h2{margin:0;font-family:var(--ct-display);font-size:1.9rem;font-weight:500}
.ct-rules-body{overflow:auto;columns:2;column-gap:34px}
.ct-rules-body section{break-inside:avoid;margin:0 0 18px}
.ct-rules-body h3{margin:0 0 6px;font-family:var(--ct-display);font-size:1.15rem;font-weight:500;color:var(--ct-accent)}
.ct-rules-body ul{margin:0;padding-left:20px;display:grid;gap:5px;line-height:1.45;font-size:1rem}
.ct-screen{width:min(760px,88%);padding:34px 40px;border-radius:24px;text-align:center;
  background:var(--ct-surface);border:1px solid var(--ct-line)}
.ct-screen h1{margin:0;font-family:var(--ct-display);font-size:2.6rem;font-weight:500}
.ct-screen-lead{margin:12px 0 0;color:var(--ct-muted);font-size:1.15rem}
.ct-screen-meta{display:flex;gap:34px;justify-content:center;margin:22px 0 0}
.ct-screen-meta div{display:grid;gap:2px}
.ct-screen-meta dt{color:var(--ct-muted);font-size:.85rem}
.ct-screen-meta dd{margin:0;font-family:var(--ct-display);font-size:1.25rem}
.ct-score{list-style:none;margin:24px 0 0;padding:0;display:grid;gap:8px;text-align:left}
.ct-score li{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:12px;
  padding:10px 16px;border-radius:12px;background:var(--ct-surface-muted);border:1px solid var(--ct-line)}
.ct-score li.is-lead{border-color:var(--ct-accent)}
.ct-score-rank{font-family:var(--ct-display);color:var(--ct-muted)}
.ct-score-dot{width:10px;height:10px;border-radius:50%}
.ct-score-name{display:flex;align-items:center;gap:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ct-score .ct-seat-bot{color:var(--ct-muted);background:transparent;border-color:var(--ct-line)}
.ct-score-total{font-family:var(--ct-display)}
.ct-score-total em{font-style:normal;color:var(--ct-success);margin-left:6px}
.ct-score-empty{justify-items:center;color:var(--ct-muted)}
.ct-wait{font-size:1.4rem;color:var(--ct-muted)}
`;
