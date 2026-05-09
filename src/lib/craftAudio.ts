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

import { useEffect, useRef } from "react";
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
// value updates synchronously each render, so play functions can read
// `mutedRef.current` and respect the latest mute state.
export function useMutedRef(): RefObject<boolean> {
  const muted = useAppStore((s) => s.muted);
  const ref = useRef(muted);
  useEffect(() => {
    ref.current = muted;
  }, [muted]);
  return ref;
}

interface BaseOpts {
  mutedRef?: RefObject<boolean>;
  volume?: number; // 0..1, default 1
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
      osc.start(now);
      osc.stop(now + duration + 0.05);
    }
  } catch {
    /* best-effort */
  }
}

// Whistle — firework launch ascent. Rising sine from low to high.
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
    startFreq = 220,
    endFreq = 1400,
    duration = 0.55,
    volume = 1,
  } = opts;
  try {
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18 * volume, now + 0.05);
    gain.gain.setValueAtTime(0.18 * volume, now + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  } catch {
    /* best-effort */
  }
}

// Boom — deep explosion / firework burst / large drum.
export function playBoom(
  opts: BaseOpts & { freq?: number; duration?: number } = {},
) {
  return playThud({
    ...opts,
    freqStart: opts.freq ?? 70,
    freqEnd: 28,
    duration: opts.duration ?? 0.9,
  });
}

// Crackle — sparks, fire, multi-burst noise.
export function playCrackle(
  opts: BaseOpts & { duration?: number } = {},
) {
  const c = gate(opts);
  if (!c) return;
  const { duration = 0.6, volume = 1 } = opts;
  try {
    const now = c.currentTime;
    const noise = createNoiseBuffer(c, duration);
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2000;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12 * volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(now);
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
