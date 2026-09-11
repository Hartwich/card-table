/**
 * Tischgeräusche.
 *
 * Der Klang entsteht im Code, genau wie die Karten selbst als SVG entstehen -
 * es wird also keine Audiodatei ausgeliefert. Zwei Geräusche reichen: das
 * Klacken einer einzelnen Karte auf dem Tisch und das weichere Schieben, wenn
 * ein Stich abgeräumt wird. Beide sind kurz und leise; der Tisch soll nicht
 * dauernd Aufmerksamkeit fordern.
 *
 * Gespielt wird nur auf dem Host. Vier gleichzeitig klackernde Handys wären
 * Lärm, und am echten Tisch macht auch der Tisch das Geräusch, nicht die Hand.
 */

type AudioContextConstructor = new () => AudioContext;

let context: AudioContext | null = null;
let enabled = true;

function audioContext(): AudioContext | null {
  if (!enabled || typeof window === "undefined") {
    return null;
  }

  if (context) {
    return context;
  }

  const ctor =
    (window as unknown as { AudioContext?: AudioContextConstructor }).AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;

  if (!ctor) {
    enabled = false;
    return null;
  }

  try {
    context = new ctor();
  } catch {
    enabled = false;
    return null;
  }

  return context;
}

/**
 * Browser starten Audio erst nach einer Nutzeraktion. Der Host ruft das beim
 * ersten Klick auf; bis dahin bleiben die Geräusche einfach aus.
 */
export function resumeTableAudio(): void {
  const ctx = audioContext();

  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
}

/** Kurzes Rauschen als Grundlage beider Geräusche. */
function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < frames; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

function play(build: (ctx: AudioContext, now: number) => void): void {
  const ctx = audioContext();

  if (!ctx || ctx.state === "suspended") {
    return;
  }

  try {
    build(ctx, ctx.currentTime);
  } catch {
    // Ton ist Beiwerk - wenn er nicht geht, spielt der Tisch trotzdem weiter.
    enabled = false;
  }
}

/** Eine Karte landet auf dem Tisch: kurzes Klacken mit etwas Tiefe darunter. */
export function playCardDrop(): void {
  play((ctx, now) => {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, 0.08);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1_900;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
    source.stop(now + 0.09);

    // Der dumpfe Anteil: die Tischplatte, nicht die Karte.
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(160, now);
    thump.frequency.exponentialRampToValueAtTime(70, now + 0.07);
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.06, now + 0.008);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(now);
    thump.stop(now + 0.09);
  });
}

/** Ein Stich wird abgeräumt: längeres, weiches Schieben statt Klacken. */
export function playTrickSweep(): void {
  play((ctx, now) => {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, 0.34);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.linearRampToValueAtTime(2_600, now + 0.13);
    filter.frequency.linearRampToValueAtTime(700, now + 0.32);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
    source.stop(now + 0.35);
  });
}
