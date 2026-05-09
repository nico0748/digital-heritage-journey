"use client";

// Synth-based audio for craft experiences. Every sound is generated
// procedurally via Web Audio API so we don't ship binary audio assets
// — bundle stays small, no licensing, no decode latency on first
// playback. Pattern adapted from TaikoStage's playBoom().
//
// Usage from a craft Stage component:
//
//   import { useAppStore } from "@/stores/useAppStore";
//   import { useMutedRef, playWoodCrack } from "@/lib/craftAudio";
//
//   function MyStep() {
//     const muted = useMutedRef();
//     return <button onClick={() => playWoodCrack({ mutedRef: muted })}>...</button>;
//   }
//
// The mutedRef pattern is essential — passing the boolean directly
// captures a stale value across renders. Each play function gates on
// `mutedRef.current` so toggling 🔇 takes effect immediately.

import { useRef } from "react";
import type { RefObject } from "react";
import { useAppStore } from "@/stores/useAppStore";

// ─────────────────────────────────────────────────────────────────────
// Shared AudioContext — lazily created, resumed on first call (browsers
// suspend the context until the first user gesture).
// ─────────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

// Hook for components to track useAppStore.muted as a ref. The ref
// value is updated SYNCHRONOUSLY during render so any handler that
// fires before the next paint (e.g. an immediate event-handler call
// after the toggle) sees the latest value. Codex flagged the previous
// useEffect-based update as a stale-read bug.
export function useMutedRef(): RefObject<boolean> {
  const muted = useAppStore((s) => s.muted);
  const ref = useRef(muted);
  ref.current = muted;
  return ref;
}

interface BaseOpts {
  mutedRef?: RefObject<boolean>;
  volume?: number; // 0..1, default 1
}

// Track every gain node we hand out so we can fade them to silence
// when the user toggles mute mid-playback. Without this, calling mute
// only blocks NEW sounds — anything already in the AudioContext keeps
// playing through to its natural decay. The set is pruned on each
// gain's natural end so it doesn't grow unbounded.
const activeGains: Set<GainNode> = new Set();

function trackGain(g: GainNode, c: AudioContext, endTime: number) {
  activeGains.add(g);
  const remainingMs = Math.max(0, (endTime - c.currentTime) * 1000) + 100;
  setTimeout(() => activeGains.delete(g), remainingMs);
}

function silenceAll() {
  const c = ctx;
  if (!c) return;
  const now = c.currentTime;
  for (const g of activeGains) {
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    } catch {
      /* best-effort */
    }
  }
  activeGains.clear();
}

// One-time subscription so toggling 🔇 in the UI silences any sound
// that's currently in flight, not just future sounds. Lives at module
// scope and fires once on the false→true transition.
if (typeof window !== "undefined") {
  let prevMuted = useAppStore.getState().muted;
  useAppStore.subscribe((state) => {
    const next = state.muted;
    if (next && !prevMuted) silenceAll();
    prevMuted = next;
  });
}

function gate(opts: BaseOpts | undefined): AudioContext | null {
  if (opts?.mutedRef?.current) return null;
  return getCtx();
}

// ─────────────────────────────────────────────────────────────────────
// Synth primitives
// Each function takes opts and is best-effort: any failure (e.g. no
// AudioContext available) silently no-ops.
// ─────────────────────────────────────────────────────────────────────

// Short percussive thud — drum hit, hammer strike, bowl placement.
// Default 95→42Hz exponential ramp matches the wadaiko boom.
export function playThud(
  opts: BaseOpts & {
    freqStart?: number;
    freqEnd?: number;
    duration?: number;
  } = {},
) {
  const c = gate(opts);
  if (!c) return;
  const {
    freqStart = 95,
    freqEnd = 42,
    duration = 0.5,
    volume = 1,
  } = opts;
  try {
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration * 0.65);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.55 * volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(c.destination);
    trackGain(gain, c, now + 1.5);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  } catch {
    /* best-effort */
  }
}

// Sharp tick / click — UI tap, brush dab, single hammer chink.
export function playClick(
  opts: BaseOpts & { freq?: number; duration?: number } = {},
) {
  const c = gate(opts);
  if (!c) return;
  const { freq = 1800, duration = 0.06, volume = 1 } = opts;
  try {
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18 * volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(c.destination);
    trackGain(gain, c, now + 1.5);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch {
    /* best-effort */
  }
}

// Wood crack — bamboo split, knife cut, dry-stick snap.
// Built from a short noise burst + a pitched transient.
export function playWoodCrack(opts: BaseOpts = {}) {
  const c = gate(opts);
  if (!c) return;
  const { volume = 1 } = opts;
  try {
    const now = c.currentTime;
    const noise = createNoiseBuffer(c, 0.08);
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2200;
    filter.Q.value = 0.7;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.4 * volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    src.connect(filter).connect(gain).connect(c.destination);
    trackGain(gain, c, now + 1.5);
    src.start(now);
    // Pitched transient on top adds the "crack" pitch.
    const osc = c.createOscillator();
    const ogain = c.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.05);
    ogain.gain.setValueAtTime(0.0001, now);
    ogain.gain.exponentialRampToValueAtTime(0.15 * volume, now + 0.003);
    ogain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(ogain).connect(c.destination);
    trackGain(ogain, c, now + 1.5);
    osc.start(now);
    osc.stop(now + 0.08);
  } catch {
    /* best-effort */
  }
}

// Metal ring — anvil strike, casting dimple, brass bowl tap.
// Pitched square wave with long decay for the "ring".
export function playMetalRing(
  opts: BaseOpts & { freq?: number; duration?: number } = {},
) {
  const c = gate(opts);
  if (!c) return;
  const { freq = 880, duration = 0.6, volume = 1 } = opts;
  try {
    const now = c.currentTime;
    // Strike attack (short noise burst).
    const noise = createNoiseBuffer(c, 0.03);
    const src = c.createBufferSource();
    src.buffer = noise;
    const sgain = c.createGain();
    sgain.gain.setValueAtTime(0.0001, now);
    sgain.gain.exponentialRampToValueAtTime(0.25 * volume, now + 0.003);
    sgain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    src.connect(sgain).connect(c.destination);
    trackGain(sgain, c, now + 1.5);
    src.start(now);
    // Ring tone (fundamental + 5th harmonic for metallic colour).
    for (const [mult, vol] of [
      [1, 0.3],
      [2.76, 0.1],
      [5.4, 0.06],
    ] as const) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * mult, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(vol * volume, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(c.destination);
      trackGain(gain, c, now + 1.5);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    }
  } catch {
    /* best-effort */
  }
}

// Whistle — firework launch ascent. Rising sine from low to high.
// Whistle — firework launch ascent. Real launches are MOSTLY a wide-
// band gas hiss with a faint pitched component, not a clean sine
// sweep. Layer a band-pass-filtered noise (the propellant exhaust)
// under a soft rising sine (the pitched air column resonating in the
// mortar). Hiss carries 80% of the energy; sine adds the "whoooo".
export function playWhistle(
  opts: BaseOpts & {
    startFreq?: number;
    endFreq?: number;
    duration?: number;
  } = {},
) {
  const c = gate(opts);
  if (!c) return;
  const {
    startFreq = 280,
    endFreq = 1500,
    duration = 0.55,
    volume = 1,
  } = opts;
  try {
    const now = c.currentTime;
    // 1. Gas hiss — band-pass noise centred ~800Hz, the dominant
    //    audible component of a real launch.
    const hissBuf = createNoiseBuffer(c, duration + 0.1);
    const hSrc = c.createBufferSource();
    hSrc.buffer = hissBuf;
    const hFilter = c.createBiquadFilter();
    hFilter.type = "bandpass";
    hFilter.frequency.setValueAtTime(600, now);
    hFilter.frequency.exponentialRampToValueAtTime(1400, now + duration);
    hFilter.Q.value = 0.7;
    const hGain = c.createGain();
    hGain.gain.setValueAtTime(0.0001, now);
    hGain.gain.exponentialRampToValueAtTime(0.16 * volume, now + 0.05);
    hGain.gain.setValueAtTime(0.16 * volume, now + duration - 0.12);
    hGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    hSrc.connect(hFilter).connect(hGain).connect(c.destination);
    trackGain(hGain, c, now + duration);
    hSrc.start(now);

    // 2. Pitched component — quieter rising sine sits underneath the
    //    hiss for the "whoo" character.
    const osc = c.createOscillator();
    const oGain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    oGain.gain.setValueAtTime(0.0001, now);
    oGain.gain.exponentialRampToValueAtTime(0.05 * volume, now + 0.07);
    oGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(oGain).connect(c.destination);
    trackGain(oGain, c, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  } catch {
    /* best-effort */
  }
}

// Boom — fireworks burst / deep explosion. Real bursts are layered:
// (1) a sharp full-spectrum transient at t=0, (2) a sub-bass sine
// thump that sustains 0.5-1s, (3) a low-pass filtered noise rumble
// for the outdoor reverb tail. The previous implementation was just
// a sine ramp, which sounded synthetic — adding the transient and
// rumble layers makes it read as a real explosion.
export function playBoom(
  opts: BaseOpts & { freq?: number; duration?: number } = {},
) {
  const c = gate(opts);
  if (!c) return;
  const { freq = 70, duration = 0.9, volume = 1 } = opts;
  try {
    const now = c.currentTime;

    // 1. Initial transient — short noise burst, the "crack".
    const transient = createNoiseBuffer(c, 0.05);
    const tSrc = c.createBufferSource();
    tSrc.buffer = transient;
    const tFilter = c.createBiquadFilter();
    tFilter.type = "lowpass";
    tFilter.frequency.value = 2000;
    const tGain = c.createGain();
    tGain.gain.setValueAtTime(0.0001, now);
    tGain.gain.exponentialRampToValueAtTime(0.5 * volume, now + 0.003);
    tGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    tSrc.connect(tFilter).connect(tGain).connect(c.destination);
    trackGain(tGain, c, now + 0.06);
    tSrc.start(now);

    // 2. Sub-bass body — pitched sine with slow downward sweep.
    const osc = c.createOscillator();
    const oGain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freq * 0.4),
      now + duration * 0.7,
    );
    oGain.gain.setValueAtTime(0.0001, now);
    oGain.gain.exponentialRampToValueAtTime(0.6 * volume, now + 0.018);
    oGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(oGain).connect(c.destination);
    trackGain(oGain, c, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.05);

    // 3. Rumble tail — low-pass-filtered noise for the outdoor reverb
    //    that lingers after the thump. ~1.6× the sine duration so the
    //    boom keeps echoing after the pitched body fades.
    const rumbleDur = duration * 1.6;
    const rumble = createNoiseBuffer(c, rumbleDur);
    const rSrc = c.createBufferSource();
    rSrc.buffer = rumble;
    const rFilter = c.createBiquadFilter();
    rFilter.type = "lowpass";
    rFilter.frequency.value = 220;
    rFilter.Q.value = 0.5;
    const rGain = c.createGain();
    rGain.gain.setValueAtTime(0.0001, now);
    rGain.gain.exponentialRampToValueAtTime(0.32 * volume, now + 0.06);
    rGain.gain.exponentialRampToValueAtTime(0.0001, now + rumbleDur);
    rSrc.connect(rFilter).connect(rGain).connect(c.destination);
    trackGain(rGain, c, now + rumbleDur);
    rSrc.start(now);
  } catch {
    /* best-effort */
  }
}

// Crackle — fireworks tail crackle / sparks / popping fire. Real
// crackle is granular: dozens of tiny independent pops at random
// times, NOT a continuous noise burst. Spawn ~25 micro-pops per
// second with random pitch + slight time jitter so the texture
// reads as popcorn / sparks rather than a wash of static.
export function playCrackle(
  opts: BaseOpts & { duration?: number } = {},
) {
  const c = gate(opts);
  if (!c) return;
  const { duration = 0.6, volume = 1 } = opts;
  try {
    const now = c.currentTime;
    const popsPerSec = 28;
    const popCount = Math.max(4, Math.floor(duration * popsPerSec));
    for (let i = 0; i < popCount; i++) {
      // Linear time slot + jitter, so pops aren't perfectly periodic.
      const slot = (i / popCount) * duration;
      const jitter = (Math.random() - 0.5) * (duration / popCount) * 0.9;
      const start = now + slot + jitter;
      const popLen = 0.005 + Math.random() * 0.012;
      const popBuf = createNoiseBuffer(c, popLen);
      const src = c.createBufferSource();
      src.buffer = popBuf;
      const filter = c.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1500 + Math.random() * 2000;
      const gain = c.createGain();
      // Front-loaded volume so the crackle is denser at the start
      // and thins toward the end, like a real burst tail.
      const fade = 1 - (i / popCount) * 0.55;
      const peak = (0.07 + Math.random() * 0.06) * volume * fade;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.0015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + popLen);
      src.connect(filter).connect(gain).connect(c.destination);
      trackGain(gain, c, start + popLen);
      src.start(start);
    }
  } catch {
    /* best-effort */
  }
}

// Brush stroke — painting, ink, soft swipe. Pink-noise-ish via lowpass.
export function playBrush(
  opts: BaseOpts & { duration?: number } = {},
) {
  const c = gate(opts);
  if (!c) return;
  const { duration = 0.25, volume = 1 } = opts;
  try {
    const now = c.currentTime;
    const noise = createNoiseBuffer(c, duration);
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    filter.Q.value = 0.4;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07 * volume, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(gain).connect(c.destination);
    trackGain(gain, c, now + 1.5);
    src.start(now);
  } catch {
    /* best-effort */
  }
}

// Chime — completion, bell. Warm two-tone harmonic stack.
export function playChime(
  opts: BaseOpts & { freq?: number } = {},
) {
  const c = gate(opts);
  if (!c) return;
  const { freq = 880, volume = 1 } = opts;
  try {
    const now = c.currentTime;
    for (const [mult, vol, dur] of [
      [1, 0.18, 1.2],
      [2.0, 0.08, 1.0],
      [3.0, 0.04, 0.8],
    ] as const) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * mult, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(vol * volume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain).connect(c.destination);
      trackGain(gain, c, now + 1.5);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }
  } catch {
    /* best-effort */
  }
}

// Pour — molten iron, water, liquid. Filtered noise that swells then ebbs.
export function playPour(opts: BaseOpts & { duration?: number } = {}) {
  const c = gate(opts);
  if (!c) return;
  const { duration = 1.4, volume = 1 } = opts;
  try {
    const now = c.currentTime;
    const noise = createNoiseBuffer(c, duration);
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.5;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12 * volume, now + 0.3);
    gain.gain.setValueAtTime(0.12 * volume, now + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(gain).connect(c.destination);
    trackGain(gain, c, now + 1.5);
    src.start(now);
  } catch {
    /* best-effort */
  }
}

// Paper fold — washi crease, sharp short rustle.
export function playFold(opts: BaseOpts = {}) {
  const c = gate(opts);
  if (!c) return;
  const { volume = 1 } = opts;
  try {
    const now = c.currentTime;
    const noise = createNoiseBuffer(c, 0.18);
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 3200;
    filter.Q.value = 1.5;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08 * volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    src.connect(filter).connect(gain).connect(c.destination);
    trackGain(gain, c, now + 1.5);
    src.start(now);
  } catch {
    /* best-effort */
  }
}

// Water splash — bingata wash, rinse.
export function playWater(opts: BaseOpts & { duration?: number } = {}) {
  const c = gate(opts);
  if (!c) return;
  const { duration = 1.0, volume = 1 } = opts;
  try {
    const now = c.currentTime;
    const noise = createNoiseBuffer(c, duration);
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    filter.Q.value = 0.3;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1 * volume, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(gain).connect(c.destination);
    trackGain(gain, c, now + 1.5);
    src.start(now);
  } catch {
    /* best-effort */
  }
}

// Flame whoosh — kiln firing, ignition.
export function playFire(opts: BaseOpts & { duration?: number } = {}) {
  const c = gate(opts);
  if (!c) return;
  const { duration = 1.6, volume = 1 } = opts;
  try {
    const now = c.currentTime;
    const noise = createNoiseBuffer(c, duration);
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.3;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15 * volume, now + 0.2);
    gain.gain.setValueAtTime(0.15 * volume, now + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(gain).connect(c.destination);
    trackGain(gain, c, now + 1.5);
    src.start(now);
  } catch {
    /* best-effort */
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function createNoiseBuffer(
  c: AudioContext,
  durationSec: number,
): AudioBuffer {
  const length = Math.max(1, Math.floor(c.sampleRate * durationSec));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
