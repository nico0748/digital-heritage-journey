"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Drum } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { useTranslations } from "@/lib/i18n";

const TARGET_HITS = 8;
// Rhythm-game cadence — sub-second spawn so the experience reads as a
// steady musical pulse (~86 BPM) rather than a slow tap counter, with
// 1.5 beats of lookahead so the user can read the incoming ring
// before it hits the drum head.
const TRAVEL_MS = 1050;
const SPAWN_INTERVAL_MS = 700;
const HIT_WINDOW = 0.18;
const PERFECT_WINDOW = 0.07;

interface BeatTarget {
  spawn: number;
  hit: boolean;
  hitAt: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  strength: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

export function TaikoStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const t = useTranslations();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetsRef = useRef<BeatTarget[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const lastSpawnRef = useRef(0);
  const shakeRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const muted = useAppStore((s) => s.muted);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const [hits, setHits] = useState(0);
  const hitsRef = useRef(0);
  const [feedback, setFeedback] = useState<"perfect" | "good" | "miss" | null>(
    null,
  );
  const feedbackTimerRef = useRef<number | null>(null);
  const finalizingRef = useRef(false);

  function ensureCtx(): AudioContext | null {
    if (!audioCtxRef.current) {
      const Ctor =
        (typeof window !== "undefined" &&
          (window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext)) ||
        null;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    const ctx = audioCtxRef.current;
    if (!ctx) return null;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function playBoom() {
    if (mutedRef.current) return;
    try {
      const ctx = ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.32);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.55, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.55);
    } catch {
      /* audio is best-effort; ignore failures */
    }
  }

  // Metronome tock — short woody click played at every spawn so the
  // rhythm is audible and the user can predict the hit moment without
  // relying on visual ring tracking alone. Downbeats (every 4th) get
  // a slightly lower pitch + louder gain to give the loop a 4/4 feel.
  function playTock(downbeat: boolean) {
    if (mutedRef.current) return;
    try {
      const ctx = ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      const f = downbeat ? 320 : 480;
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.6, now + 0.04);
      const peak = downbeat ? 0.22 : 0.13;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const start = performance.now();
    lastSpawnRef.current = start - SPAWN_INTERVAL_MS + 900;

    const loop = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const now = performance.now();

      if (
        !finalizingRef.current &&
        hitsRef.current < TARGET_HITS &&
        now - lastSpawnRef.current >= SPAWN_INTERVAL_MS
      ) {
        const beatIdx = targetsRef.current.length;
        targetsRef.current.push({ spawn: now, hit: false, hitAt: 0 });
        lastSpawnRef.current = now;
        // Audible metronome: every spawn ticks; first beat of each
        // 4-beat cycle gets the lower 'downbeat' tock so the rhythm
        // reads as music rather than an undifferentiated stream.
        playTock(beatIdx % 4 === 0);
      }

      const bg = ctx.createRadialGradient(
        w * 0.5,
        h * 0.62,
        0,
        w * 0.5,
        h * 0.62,
        Math.max(w, h),
      );
      bg.addColorStop(0, "#5A2E1F");
      bg.addColorStop(0.55, "#2C1810");
      bg.addColorStop(1, "#1A0E0A");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const floor = ctx.createRadialGradient(
        w * 0.5,
        h * 0.93,
        0,
        w * 0.5,
        h * 0.93,
        w * 0.6,
      );
      floor.addColorStop(0, "rgba(255, 180, 90, 0.12)");
      floor.addColorStop(1, "rgba(255, 180, 90, 0)");
      ctx.fillStyle = floor;
      ctx.fillRect(0, 0, w, h);

      const shake = shakeRef.current;
      shakeRef.current = Math.max(0, shake - 0.05);
      const shakeX = shake * (Math.random() - 0.5) * 14;
      const shakeY = shake * (Math.random() - 0.5) * 14;

      ctx.save();
      ctx.translate(shakeX, shakeY);

      const cx = w * 0.5;
      const cy = h * 0.46;
      const headRx = Math.min(w * 0.32, h * 0.32);
      const headRy = headRx * 0.34;
      const bodyHalfH = headRx * 0.55;
      const headTopY = cy - bodyHalfH;
      const baseY = cy + bodyHalfH + headRy;

      drawStand(ctx, cx, baseY, headRx);
      drawBody(ctx, cx, cy, headRx, bodyHalfH, headRy);
      drawLashings(ctx, cx, cy, headRx, bodyHalfH, headRy);
      drawHead(ctx, cx, headTopY, headRx, headRy, ripplesRef.current);

      for (const t of targetsRef.current) {
        if (t.hit) continue;
        const progress = (now - t.spawn) / TRAVEL_MS;
        const inbound = Math.min(progress, 1);
        const outbound = Math.max(0, progress - 1);
        const radius =
          progress < 1
            ? lerp(headRx * 2.6, headRx, inbound)
            : lerp(headRx, headRx * 0.55, Math.min(outbound, 1));
        const ringAlpha =
          progress < 1
            ? 0.32 + 0.55 * progress
            : Math.max(0, 0.85 - outbound * 1.6);
        ctx.strokeStyle = `rgba(232, 184, 96, ${ringAlpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, headTopY, radius, radius * 0.34, 0, 0, Math.PI * 2);
        ctx.stroke();

        if (Math.abs(progress - 1) < HIT_WINDOW) {
          ctx.strokeStyle = "rgba(255, 240, 180, 0.55)";
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.ellipse(
            cx,
            headTopY,
            radius + 4,
            (radius + 4) * 0.34,
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
      }

      targetsRef.current = targetsRef.current.filter((t) => {
        const progress = (now - t.spawn) / TRAVEL_MS;
        if (t.hit) return now - t.hitAt < 300;
        return progress < 1 + HIT_WINDOW + 0.2;
      });

      for (const r of ripplesRef.current) {
        r.life += 1;
        r.radius += 2.6;
      }
      ripplesRef.current = ripplesRef.current.filter(
        (r) => r.life < r.maxLife,
      );

      for (const p of sparksRef.current) {
        p.life += 1;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.07;
        p.vx *= 0.99;
      }
      sparksRef.current = sparksRef.current.filter(
        (p) => p.life < p.maxLife,
      );
      for (const p of sparksRef.current) {
        const a = 1 - p.life / p.maxLife;
        ctx.fillStyle = `hsla(${p.hue}, 85%, 70%, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      const vg = ctx.createRadialGradient(
        w / 2,
        h / 2,
        h * 0.3,
        w / 2,
        h / 2,
        h * 0.85,
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
      try {
        audioCtxRef.current?.close();
      } catch {
        /* ignore */
      }
      audioCtxRef.current = null;
    };
  }, []);

  function spawnSparks(x: number, y: number, count = 24) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1.1 + Math.random() * 3.2;
      sparksRef.current.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1.4,
        life: 0,
        maxLife: 30 + Math.random() * 22,
        size: 1.1 + Math.random() * 1.5,
        hue: 28 + Math.random() * 22,
      });
    }
  }

  function flashFeedback(kind: "perfect" | "good" | "miss") {
    setFeedback(kind);
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, 520);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (finalizingRef.current) return;
    if (hitsRef.current >= TARGET_HITS) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const now = performance.now();

    let best: BeatTarget | null = null;
    let bestErr = Infinity;
    for (const t of targetsRef.current) {
      if (t.hit) continue;
      const progress = (now - t.spawn) / TRAVEL_MS;
      const err = Math.abs(progress - 1);
      if (err < HIT_WINDOW && err < bestErr) {
        bestErr = err;
        best = t;
      }
    }

    if (best) {
      const isPerfect = bestErr < PERFECT_WINDOW;
      best.hit = true;
      best.hitAt = now;
      hitsRef.current = Math.min(TARGET_HITS, hitsRef.current + 1);
      setHits(hitsRef.current);
      shakeRef.current = Math.min(1, shakeRef.current + (isPerfect ? 1 : 0.7));
      ripplesRef.current.push({
        x,
        y,
        radius: 6,
        life: 0,
        maxLife: 38,
        strength: isPerfect ? 1 : 0.75,
      });
      spawnSparks(x, y, isPerfect ? 28 : 18);
      flashFeedback(isPerfect ? "perfect" : "good");
      playBoom();
    } else {
      ripplesRef.current.push({
        x,
        y,
        radius: 4,
        life: 0,
        maxLife: 18,
        strength: 0.4,
      });
      flashFeedback("miss");
    }
  }

  function complete() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    finalizingRef.current = true;
    window.setTimeout(() => {
      const dataUrl = canvas.toDataURL("image/png");
      onComplete(dataUrl);
    }, 600);
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Drum size={14} />{" "}
        <span className="font-jp tracking-[0.3em]">鼓を打つ</span> · タイミングを合わせて
      </p>

      <div
        className="relative h-[min(60vh,32rem)] w-[min(92vw,42rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60"
        style={{ background: "#1A0E0A" }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none select-none"
        />

        {feedback && (
          <div
            className={`pointer-events-none absolute right-3 top-3 rounded-full px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] backdrop-blur ${
              feedback === "perfect"
                ? "bg-amber-300/35 text-amber-50"
                : feedback === "good"
                  ? "bg-amber-200/20 text-amber-100/85"
                  : "bg-black/40 text-washi-50/55"
            }`}
          >
            <span className="font-jp tracking-wider">
              {feedback === "perfect"
                ? "見事"
                : feedback === "good"
                  ? "良し"
                  : "外し"}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {Array.from({ length: TARGET_HITS }).map((_, i) => (
          <span
            key={i}
            className={`h-1 w-6 rounded-full transition-colors ${
              i < hits ? "bg-amber-300" : "bg-washi-50/20"
            }`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={complete}
        disabled={hits < TARGET_HITS}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        <Check size={12} /> {t("common.finale")}
      </button>
    </div>
  );
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function drawStand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  drumRx: number,
) {
  const half = drumRx * 0.92;
  const top = baseY - drumRx * 0.08;
  const bottom = baseY + drumRx * 0.45;

  ctx.save();
  ctx.lineCap = "round";

  ctx.lineWidth = drumRx * 0.11;
  ctx.strokeStyle = "#2E180D";
  ctx.beginPath();
  ctx.moveTo(cx - half, bottom);
  ctx.lineTo(cx + half * 0.55, top);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + half, bottom);
  ctx.lineTo(cx - half * 0.55, top);
  ctx.stroke();

  ctx.lineWidth = drumRx * 0.025;
  ctx.strokeStyle = "rgba(180, 110, 60, 0.55)";
  ctx.beginPath();
  ctx.moveTo(cx - half, bottom);
  ctx.lineTo(cx + half * 0.55, top);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + half, bottom);
  ctx.lineTo(cx - half * 0.55, top);
  ctx.stroke();

  ctx.restore();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  bodyHalfH: number,
  headRy: number,
) {
  const xL = cx - rx;
  const xR = cx + rx;
  const yT = cy - bodyHalfH;
  const yB = cy + bodyHalfH;

  const grad = ctx.createLinearGradient(xL, 0, xR, 0);
  grad.addColorStop(0, "#1B0E08");
  grad.addColorStop(0.5, "#4A2412");
  grad.addColorStop(1, "#1B0E08");
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(xL, yT);
  ctx.quadraticCurveTo(xL - rx * 0.06, cy, xL, yB);
  ctx.lineTo(xR, yB);
  ctx.quadraticCurveTo(xR + rx * 0.06, cy, xR, yT);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#2A1409";
  ctx.beginPath();
  ctx.ellipse(cx, yB, rx, headRy, 0, 0, Math.PI);
  ctx.lineTo(xL, yB);
  ctx.closePath();
  ctx.fill();
}

function drawLashings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  bodyHalfH: number,
  headRy: number,
) {
  const yT = cy - bodyHalfH;
  const yB = cy + bodyHalfH;

  const drawBand = (yCenter: number) => {
    const bandH = headRy * 0.85;
    const yTop = yCenter - bandH * 0.5;
    const yBot = yCenter + bandH * 0.5;

    ctx.fillStyle = "rgba(220, 180, 130, 0.06)";
    ctx.fillRect(cx - rx, yTop, rx * 2, bandH);

    const N = 28;
    for (let i = 0; i < N; i++) {
      const a = Math.PI * (i / (N - 1));
      const x = cx - Math.cos(a) * rx;
      const edgeFactor = Math.sin(a);
      const alpha = 0.18 + 0.55 * edgeFactor;
      ctx.strokeStyle = `rgba(245, 232, 200, ${alpha})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, yTop + bandH * 0.12);
      ctx.lineTo(x, yBot - bandH * 0.12);
      ctx.stroke();
    }
  };

  drawBand(yT + headRy * 0.4);
  drawBand(yB - headRy * 0.4);
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  rx: number,
  ry: number,
  ripples: Ripple[],
) {
  const grad = ctx.createRadialGradient(
    cx - rx * 0.25,
    topY - ry * 0.4,
    0,
    cx,
    topY,
    rx,
  );
  grad.addColorStop(0, "#F2D4A0");
  grad.addColorStop(0.55, "#E0B070");
  grad.addColorStop(1, "#9A6A40");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(60, 28, 14, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, topY, rx - 1, ry - 1, 0, 0, Math.PI * 2);
  ctx.clip();
  for (const r of ripples) {
    const a = Math.max(0, 1 - r.life / r.maxLife) * r.strength;
    ctx.strokeStyle = `rgba(60, 30, 15, ${a * 0.55})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
