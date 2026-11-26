/** The combo sound keeps rising up to this many in a row. */
const MAX_COMBO_PITCH = 20;

/** Tiny synthesised sound effects (no audio files). Muted state is remembered. */
const KEY = "turf.muted";
let context: AudioContext | null = null;

export function isMuted(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setMuted(muted: boolean) {
  try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch { /* storage unavailable */ }
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, type: OscillatorType, volume: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(ctx.currentTime + start);
  oscillator.stop(ctx.currentTime + start + duration + 0.02);
}

export type Sound = "excellent" | "great" | "ok" | "slow" | "wrong" | "win" | "tick" | "tap" | "go";


/**
 * `combo` raises the pitch of the Excellent and Great sounds a little with
 * each step, reaching one octave higher at a combo of 20.
 */
export function play(sound: Sound, combo = 0) {
  if (typeof window === "undefined" || isMuted()) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const ctx = context;
    const lift = 2 ** (Math.min(Math.max(combo, 0), MAX_COMBO_PITCH) / MAX_COMBO_PITCH);
    if (sound === "excellent") {
      // Bright three-note sparkle.
      tone(ctx, 660 * lift, 0, 0.11, "sine", 0.17);
      tone(ctx, 880 * lift, 0.07, 0.13, "sine", 0.17);
      tone(ctx, 1320 * lift, 0.14, 0.26, "triangle", 0.14);
    } else if (sound === "great") {
      tone(ctx, 587 * lift, 0, 0.12, "sine", 0.17);
      tone(ctx, 880 * lift, 0.09, 0.2, "sine", 0.17);
    } else if (sound === "ok") {
      tone(ctx, 523, 0, 0.16, "sine", 0.15);
    } else if (sound === "slow") {
      tone(ctx, 330, 0, 0.2, "triangle", 0.15);
    } else if (sound === "wrong") { tone(ctx, 220, 0, 0.16, "triangle", 0.2); tone(ctx, 165, 0.12, 0.26, "triangle", 0.2); }
    else if (sound === "tick") { tone(ctx, 520, 0, 0.08, "sine", 0.1); }
    else if (sound === "tap") { tone(ctx, 740, 0, 0.05, "sine", 0.09); }
    else if (sound === "go") { tone(ctx, 784, 0, 0.1, "sine", 0.16); tone(ctx, 1047, 0.08, 0.22, "sine", 0.16); }
    else { [523, 659, 784, 1047].forEach((f, i) => tone(ctx, f, i * 0.11, 0.26, "sine", 0.18)); }
  } catch { /* audio not available */ }
}
