"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flame,
  Hammer,
  Layers,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import {
  playChime,
  playClick,
  playFold,
  playWater,
  playWoodCrack,
  useMutedRef,
} from "@/lib/craftAudio";

// ─────────────────────────────────────────────────────────────────────
// 4-step craft flow mirroring 大館曲げわっぱ production:
//   1. へぎ   (Hegi)   — slice the cedar block into 0.7mm planks
//   2. 煮沸   (Nisai)  — soften the plank in 90°C water
//   3. 曲げ   (Mage)   — curl the hot plank into a circular form
//   4. 綴じ   (Toji)   — stitch the seam closed with cherry bark thread
//
// Real Akita workshop work has eight specialist phases; we condense the
// four most tactile ones so the user feels both the cutting and the
// stitching in one short experience.
// ─────────────────────────────────────────────────────────────────────

type Step = "hegi" | "nisai" | "mage" | "toji";

const SIZE = 560;
const HEGI_TARGET = 3; // 3 swipes to reach 0.7mm
const SWIPE_DISTANCE = 220; // px of drag needed to count one swipe
const NISAI_TARGET_MS = 4000;
const NISAI_TAP_BOOST_MS = 1100; // each tap fast-forwards this much
const MAGE_TARGET = 1; // 1.0 = 360°; we accept >= 0.75 (270°)
const MAGE_DONE = 0.75;
const MAGE_DRAG_TARGET = 720; // px to wrap to a full circle
const TOJI_STITCHES = 5; // 5 hint markers around the seam

// Cedar shaving particle.
interface Shaving {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  life: number;
  maxLife: number;
  hue: number;
}

interface Steam {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export function MagewappaStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const [step, setStep] = useState<Step>("hegi");
  const [layers, setLayers] = useState(0); // へぎ layers shaved
  const [stitches, setStitches] = useState(0); // 桜皮 stitches placed

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {step === "hegi" && (
        <HegiStep
          onConfirm={(n) => {
            setLayers(n);
            setStep("nisai");
          }}
        />
      )}
      {step === "nisai" && (
        <NisaiStep
          onConfirm={() => setStep("mage")}
          onBack={() => setStep("hegi")}
        />
      )}
      {step === "mage" && (
        <MageStep
          onConfirm={() => setStep("toji")}
          onBack={() => setStep("nisai")}
        />
      )}
      {step === "toji" && (
        <TojiStep
          onComplete={onComplete}
          onBack={() => setStep("mage")}
          onStitchesChange={setStitches}
        />
      )}
      <RecipeBadge layers={layers} stitches={stitches} step={step} />
    </div>
  );
}

function RecipeBadge({
  layers,
  stitches,
  step,
}: {
  layers: number;
  stitches: number;
  step: Step;
}) {
  // Recipe accumulates as the user finishes each step; on the very first
  // step there's nothing to show yet.
  if (step === "hegi" || layers === 0) return null;
  const stitchSegment =
    stitches > 0
      ? ` · 桜皮 ${stitches}綴じ`
      : step === "toji"
        ? ` · 桜皮 — 綴じ`
        : "";
  return (
    <p className="font-jp text-[0.6rem] uppercase tracking-[0.35em] text-washi-50/55">
      大館曲げわっぱ · 厚 0.7mm{stitchSegment}
    </p>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 1 — へぎ (Hegi) — slice the thick cedar block into 0.7mm planks.
//
// A horizontal cedar block is shown on the bench from the side. The
// user drags a 鉋 (kanna, plane) horizontally across the top face;
// when they accumulate SWIPE_DISTANCE px of horizontal motion in one
// gesture, one layer is shaved off. The block visibly gets thinner
// each time, and warm-coloured shavings curl off the cut.
// ═════════════════════════════════════════════════════════════════════
function HegiStep({ onConfirm }: { onConfirm: (layers: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState(0);
  const layersRef = useRef(0);
  const shavings = useRef<Shaving[]>([]);
  const dragRef = useRef<{
    x: number;
    y: number;
    accumX: number;
    consumed: boolean;
  } | null>(null);
  const planeRef = useRef<{ x: number; y: number } | null>(null);
  const muted = useMutedRef();

  const ready = layers >= HEGI_TARGET;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Workshop bench backdrop — dark cedar grain.
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1d130a");
    bg.addColorStop(1, "#0a0604");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Cedar block. Thickness shrinks as layers are shaved.
    const x0 = w * 0.1;
    const x1 = w * 0.9;
    const blockW = x1 - x0;
    const baseY = h * 0.62;
    // Each layer shaves about 18% of the block height — visual feedback
    // matters more than physical realism.
    const thickness = h * 0.32 * (1 - (layersRef.current / HEGI_TARGET) * 0.7);
    const topY = baseY - thickness;

    // Block fill with cedar grain stripes.
    const grad = ctx.createLinearGradient(0, topY, 0, baseY);
    grad.addColorStop(0, "#b07a3c");
    grad.addColorStop(0.5, "#7c4f23");
    grad.addColorStop(1, "#3c2410");
    ctx.fillStyle = grad;
    ctx.fillRect(x0, topY, blockW, thickness);

    ctx.strokeStyle = "rgba(40,24,10,0.45)";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 14; i++) {
      const y = topY + (thickness / 14) * i;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      // Slight wave so grain looks natural.
      for (let xx = x0; xx <= x1; xx += 16) {
        const wave = Math.sin(xx * 0.04 + i * 0.7) * 1.5;
        ctx.lineTo(xx, y + wave);
      }
      ctx.stroke();
    }

    // Top cut surface — slightly lighter to suggest fresh wood after
    // the plane went through.
    if (layersRef.current > 0) {
      ctx.fillStyle = "rgba(245,220,175,0.18)";
      ctx.fillRect(x0, topY, blockW, 4);
    }

    // Drop shadow under the block.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x0 - 6, baseY, blockW + 12, 6);

    // 鉋 (kanna / plane) — only visible while the user is dragging. It
    // tracks the pointer; the cutting blade is on the underside.
    const plane = planeRef.current;
    if (plane && !ready) {
      const px = Math.max(x0 + 30, Math.min(x1 - 30, plane.x));
      const py = Math.max(topY - 36, Math.min(topY - 10, plane.y));
      ctx.save();
      ctx.translate(px, py);
      // Wooden body.
      ctx.fillStyle = "#3a2210";
      ctx.fillRect(-32, -16, 64, 22);
      ctx.fillStyle = "#572f15";
      ctx.fillRect(-32, -16, 64, 4);
      // Blade.
      ctx.fillStyle = "#d8d8d8";
      ctx.fillRect(-3, -10, 6, 18);
      // Handle peg.
      ctx.fillStyle = "#8a5a28";
      ctx.fillRect(-22, -22, 6, 12);
      ctx.restore();
    }

    // Shaving particles — curl up & away on each successful swipe.
    for (const s of shavings.current) {
      s.life += 1;
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.12;
      s.rot += s.vrot;
    }
    shavings.current = shavings.current.filter((s) => s.life < s.maxLife);

    for (const s of shavings.current) {
      const a = 1 - s.life / s.maxLife;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = `hsla(${s.hue}, 65%, 55%, ${a})`;
      // Curled-up shaving as a small thin rounded rectangle.
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // HUD
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `${layersRef.current} / ${HEGI_TARGET} layer · 0.7mm`,
      w / 2,
      h * 0.16,
    );
  }, [ready]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
    };
  }

  function spawnShavings(x: number, y: number) {
    for (let i = 0; i < 14; i++) {
      shavings.current.push({
        x: x + (Math.random() - 0.5) * 50,
        y,
        vx: (Math.random() - 0.5) * 1.4 - 0.6,
        vy: -1.6 - Math.random() * 1.8,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        life: 0,
        maxLife: 50 + Math.random() * 30,
        hue: 30 + Math.random() * 18,
      });
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (layersRef.current >= HEGI_TARGET) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    dragRef.current = { x: p.x, y: p.y, accumX: 0, consumed: false };
    planeRef.current = p;
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const p = canvasPoint(e);
    planeRef.current = p;
    if (!drag || drag.consumed) return;
    drag.accumX += Math.abs(p.x - drag.x);
    drag.x = p.x;
    drag.y = p.y;
    if (drag.accumX >= SWIPE_DISTANCE && layersRef.current < HEGI_TARGET) {
      drag.consumed = true;
      layersRef.current += 1;
      setLayers(layersRef.current);
      // Lower-pitched bandpass crack reads as cedar splitting under the
      // plane rather than a sharp knife cut.
      playWoodCrack({ mutedRef: muted, volume: 0.85 });
      // The plane is roughly along the top surface; spawn shavings just
      // below it so they appear to peel out from under the blade.
      const baseY = SIZE * 0.62;
      const thickness =
        SIZE * 0.32 * (1 - ((layersRef.current - 1) / HEGI_TARGET) * 0.7);
      const topY = baseY - thickness;
      spawnShavings(p.x, topY);
    }
  }

  function endPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    planeRef.current = null;
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Hammer size={14} /> Step 1 / 4 · へぎ
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        秋田杉を 0.7mm に削ぐ
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        鉋(かんな)を木目に沿って横に滑らせる。木屑が舞い、薄板が現れる。
      </p>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
        className={clsx(
          "aspect-square w-[min(92vw,32rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60",
          ready ? "cursor-default" : "cursor-ew-resize",
        )}
      />

      <div className="flex items-center gap-2">
        {Array.from({ length: HEGI_TARGET }).map((_, i) => (
          <span
            key={i}
            className={clsx(
              "h-1 w-6 rounded-full transition-colors",
              i < layers ? "bg-amber-300" : "bg-washi-50/20",
            )}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onConfirm(layers)}
        disabled={!ready}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        煮沸へ
        <ArrowRight size={12} />
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 2 — 煮沸 (Nisai) — soften the plank in 90°C water.
//
// The thin plank is shown submerged in a copper pot. Steam rises in
// gentle plumes. A 4 s soak timer auto-progresses; tapping the pot
// agitates the water and shortens the wait, so impatient users can
// fast-forward in 3 taps. Audio replays on each tap and ambient on
// entry so muting takes effect immediately on the next loop.
// ═════════════════════════════════════════════════════════════════════
function NisaiStep({
  onConfirm,
  onBack,
}: {
  onConfirm: () => void;
  onBack: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const steam = useRef<Steam[]>([]);
  // Elapsed soak time, in ms. Time accumulates from rAF deltas; taps
  // add NISAI_TAP_BOOST_MS each.
  const elapsedRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const muted = useMutedRef();

  const ready = progress >= 1;

  // Ambient water audio — replay every ~3.6 s while on this step. The
  // gate inside the audio fn checks muted at call time, so toggling 🔇
  // takes effect on the very next loop.
  useEffect(() => {
    playWater({ mutedRef: muted, duration: 4.0 });
    const id = setInterval(() => {
      if (elapsedRef.current >= NISAI_TARGET_MS) return;
      playWater({ mutedRef: muted, duration: 4.0, volume: 0.7 });
    }, 3600);
    return () => clearInterval(id);
  }, [muted]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1d130a");
    bg.addColorStop(1, "#0a0604");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Hearth glow under the pot.
    const glowR = w * 0.32;
    const gx = w / 2;
    const gy = h * 0.78;
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, glowR);
    glow.addColorStop(0, "rgba(220,80,30,0.35)");
    glow.addColorStop(0.4, "rgba(120,40,10,0.18)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, gy - glowR, w, glowR * 2);

    // Copper pot — drawn as a wide ellipse (rim) + body trapezoid.
    const potTopY = h * 0.5;
    const potBotY = h * 0.78;
    const potTopHalfW = w * 0.34;
    const potBotHalfW = w * 0.28;
    const cx = w / 2;

    // Body
    ctx.beginPath();
    ctx.moveTo(cx - potTopHalfW, potTopY);
    ctx.lineTo(cx + potTopHalfW, potTopY);
    ctx.lineTo(cx + potBotHalfW, potBotY);
    ctx.lineTo(cx - potBotHalfW, potBotY);
    ctx.closePath();
    const potGrad = ctx.createLinearGradient(
      cx - potTopHalfW,
      0,
      cx + potTopHalfW,
      0,
    );
    potGrad.addColorStop(0, "#3a1d0a");
    potGrad.addColorStop(0.5, "#a05a22");
    potGrad.addColorStop(1, "#3a1d0a");
    ctx.fillStyle = potGrad;
    ctx.fill();

    // Pot rim ellipse.
    ctx.beginPath();
    ctx.ellipse(cx, potTopY, potTopHalfW, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#7a3f17";
    ctx.fill();

    // Water surface — slightly inset from rim, with ripple lines.
    const waterY = potTopY + 2;
    const waterHalfW = potTopHalfW - 4;
    ctx.beginPath();
    ctx.ellipse(cx, waterY, waterHalfW, 11, 0, 0, Math.PI * 2);
    const waterGrad = ctx.createRadialGradient(
      cx,
      waterY,
      4,
      cx,
      waterY,
      waterHalfW,
    );
    waterGrad.addColorStop(0, "rgba(200, 220, 230, 0.55)");
    waterGrad.addColorStop(1, "rgba(60, 100, 120, 0.85)");
    ctx.fillStyle = waterGrad;
    ctx.fill();

    // Plank submerged in the water — visible as a thin rectangle just
    // beneath the rippling surface.
    const plankW = waterHalfW * 1.6;
    const plankH = 6;
    ctx.fillStyle = "rgba(180,130,80,0.7)";
    ctx.fillRect(cx - plankW / 2, waterY - plankH / 2 + 2, plankW, plankH);
    ctx.strokeStyle = "rgba(80,50,20,0.6)";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(cx - plankW / 2, waterY - plankH / 2 + 2, plankW, plankH);

    // Ripples — concentric ellipses pulsing with progress.
    const t = performance.now() / 1000;
    ctx.strokeStyle = "rgba(220,240,255,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const phase = (t + i * 0.6) % 1.6;
      const r = waterHalfW * (0.25 + phase * 0.35);
      const a = Math.max(0, 0.5 - phase * 0.3);
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.ellipse(cx, waterY, r, r * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Steam particles.
    // Spawn from the rim — biased toward the centre.
    if (Math.random() < 0.6 && elapsedRef.current < NISAI_TARGET_MS + 500) {
      steam.current.push({
        x: cx + (Math.random() - 0.5) * waterHalfW * 1.3,
        y: waterY - 4,
        vy: -0.5 - Math.random() * 0.7,
        life: 0,
        maxLife: 70 + Math.random() * 40,
        size: 14 + Math.random() * 14,
      });
    }
    for (const s of steam.current) {
      s.life += 1;
      s.y += s.vy;
      s.vy *= 0.997;
      s.x += Math.sin(t * 1.1 + s.life * 0.02) * 0.4;
    }
    steam.current = steam.current.filter((s) => s.life < s.maxLife);

    for (const s of steam.current) {
      const a = (1 - s.life / s.maxLife) * 0.35;
      const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
      grd.addColorStop(0, `rgba(245,245,255,${a})`);
      grd.addColorStop(1, "rgba(245,245,255,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // HUD
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    const pct = Math.round(
      Math.min(100, (elapsedRef.current / NISAI_TARGET_MS) * 100),
    );
    ctx.fillText(`${pct}% · 90°C`, cx, h * 0.16);
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (elapsedRef.current < NISAI_TARGET_MS) {
        elapsedRef.current = Math.min(
          NISAI_TARGET_MS,
          elapsedRef.current + dt,
        );
        const p = elapsedRef.current / NISAI_TARGET_MS;
        // Avoid setState every frame: only update when crossing percent
        // bumps so the React-driven UI doesn't thrash.
        const pp = Math.min(1, Math.floor(p * 50) / 50);
        if (Math.abs(pp - progressRef.current) > 0.01) {
          progressRef.current = pp;
          setProgress(pp);
        }
      } else if (progressRef.current < 1) {
        progressRef.current = 1;
        setProgress(1);
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  // Local progress ref so the rAF loop can avoid setState spam.
  const progressRef = useRef(0);

  function onCanvasTap() {
    if (elapsedRef.current >= NISAI_TARGET_MS) return;
    elapsedRef.current = Math.min(
      NISAI_TARGET_MS,
      elapsedRef.current + NISAI_TAP_BOOST_MS,
    );
    playWater({ mutedRef: muted, duration: 0.9, volume: 0.9 });
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Flame size={14} /> Step 2 / 4 · 煮沸
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        熱湯で繊維を柔らかく
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        90°C で 30 分。湯気の中で杉が曲がる準備を整える。タップで時間を早送り。
      </p>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={onCanvasTap}
        className={clsx(
          "aspect-square w-[min(92vw,32rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60",
          ready ? "cursor-default" : "cursor-pointer",
        )}
      />

      <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300 transition-[width] duration-150"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 削ぎ直す
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          曲げへ
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 3 — 曲げ (Mage) — curl the warm plank around a circular form.
//
// The plank is a flexible strip wrapped around an invisible cylinder
// at the canvas centre. Drag distance (in any direction) accumulates
// and feeds a `bend` value 0..1 where 1 = full 360° wrap. The plank
// is rendered as a ring sector spanning `bend * 2π` radians; the user
// can stop once they cross MAGE_DONE (270°). Periodic playFold cues
// fire at every 80px of accumulated drag, so the wood "creaks" while
// being bent.
// ═════════════════════════════════════════════════════════════════════
function MageStep({
  onConfirm,
  onBack,
}: {
  onConfirm: () => void;
  onBack: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bendRef = useRef(0);
  const [bend, setBend] = useState(0);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  // Audio cadence: a fold sound plays every FOLD_INTERVAL_PX of drag.
  const foldDistRef = useRef(0);
  const muted = useMutedRef();
  const FOLD_INTERVAL_PX = 80;

  const ready = bend >= MAGE_DONE;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1d130a");
    bg.addColorStop(1, "#0a0604");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.55;
    const rOuter = w * 0.3;
    const rInner = rOuter - 14; // plank thickness

    // The bend value drives both the arc angle and where the un-bent
    // tail trails off. When bend is 0 the plank is fully horizontal;
    // as bend grows it eats into the ring and the tail shortens.
    const b = bendRef.current;
    const arc = b * Math.PI * 2;
    const startAngle = Math.PI; // start at 9 o'clock, sweep clockwise
    const endAngle = startAngle + arc;

    // Plank background guide ring (faint) so the user knows the target.
    ctx.strokeStyle = "rgba(252,232,170,0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, (rOuter + rInner) / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Wrapped portion — drawn as a ring sector.
    if (arc > 0.001) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, startAngle, endAngle, false);
      ctx.arc(cx, cy, rInner, endAngle, startAngle, true);
      ctx.closePath();
      const grad = ctx.createLinearGradient(cx - rOuter, cy, cx + rOuter, cy);
      grad.addColorStop(0, "#7c4f23");
      grad.addColorStop(0.5, "#c8924f");
      grad.addColorStop(1, "#7c4f23");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(40,24,10,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inner grain — short tangent strokes along the ring.
      ctx.strokeStyle = "rgba(40,24,10,0.35)";
      ctx.lineWidth = 0.8;
      const segs = Math.max(6, Math.floor(arc * 14));
      for (let i = 0; i < segs; i++) {
        const a = startAngle + (arc * i) / segs;
        const r = rInner + 4 + ((i * 7) % 8);
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        const tx = -Math.sin(a) * 5;
        const ty = Math.cos(a) * 5;
        ctx.beginPath();
        ctx.moveTo(Math.round(px - tx), Math.round(py - ty));
        ctx.lineTo(Math.round(px + tx), Math.round(py + ty));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Un-bent tail — straight strip emerging tangentially from the
    // current end-of-arc, length proportional to how much wood is
    // still un-wrapped. Hidden once the wrap closes the circle.
    const tailLen = Math.max(0, (1 - b) * (Math.PI * 2 * (rOuter + rInner) / 2 / 2));
    if (tailLen > 4) {
      const tipX = cx + Math.cos(endAngle) * ((rOuter + rInner) / 2);
      const tipY = cy + Math.sin(endAngle) * ((rOuter + rInner) / 2);
      // Tangent direction (perpendicular to radius, going clockwise).
      const tx = -Math.sin(endAngle);
      const ty = Math.cos(endAngle);
      const farX = tipX + tx * tailLen;
      const farY = tipY + ty * tailLen;
      // Plank thickness across the tangent — same width as the ring.
      const nx = Math.cos(endAngle);
      const ny = Math.sin(endAngle);
      const t = 7;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(Math.round(tipX + nx * t), Math.round(tipY + ny * t));
      ctx.lineTo(Math.round(farX + nx * t), Math.round(farY + ny * t));
      ctx.lineTo(Math.round(farX - nx * t), Math.round(farY - ny * t));
      ctx.lineTo(Math.round(tipX - nx * t), Math.round(tipY - ny * t));
      ctx.closePath();
      const tailGrad = ctx.createLinearGradient(tipX, tipY, farX, farY);
      tailGrad.addColorStop(0, "#c8924f");
      tailGrad.addColorStop(1, "#5a3a1c");
      ctx.fillStyle = tailGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(40,24,10,0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Pivot peg at centre — wooden form the plank wraps around.
    ctx.fillStyle = "#2a1808";
    ctx.beginPath();
    ctx.arc(cx, cy, rInner - 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(252,232,170,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rInner - 12, 0, Math.PI * 2);
    ctx.stroke();

    // HUD: degrees + target
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    const deg = Math.round(b * 360);
    ctx.fillText(`${deg}° / 270° 円弧`, cx, h * 0.16);
    if (b >= MAGE_DONE) {
      ctx.fillStyle = "rgba(255, 220, 120, 0.85)";
      ctx.fillText(`良い形になった`, cx, h * 0.16 + 18);
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPt.current = canvasPoint(e);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!lastPt.current) return;
    const p = canvasPoint(e);
    const d = Math.hypot(p.x - lastPt.current.x, p.y - lastPt.current.y);
    bendRef.current = Math.min(MAGE_TARGET, bendRef.current + d / MAGE_DRAG_TARGET);
    setBend(bendRef.current);
    foldDistRef.current += d;
    while (foldDistRef.current >= FOLD_INTERVAL_PX) {
      foldDistRef.current -= FOLD_INTERVAL_PX;
      playFold({ mutedRef: muted, volume: 0.7 });
    }
    lastPt.current = p;
  }

  function endPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    lastPt.current = null;
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Layers size={14} /> Step 3 / 4 · 曲げ
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        熱いうちに型へ巻きつける
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        中央の型に合わせて、両端を引き寄せる。冷めたら形が固定される。
      </p>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
        className={clsx(
          "aspect-square w-[min(92vw,32rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60",
          ready ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
      />

      <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300 transition-[width] duration-100"
          style={{ width: `${Math.min(100, (bend / MAGE_DONE) * 100)}%` }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 煮直す
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          綴じへ
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 4 — 綴じ (Toji) — stitch the seam closed with cherry-bark thread.
//
// The bent cedar is shown from above as a circular ring with a visible
// seam where the two ends meet. Five hint markers sit along the seam;
// the user taps each to thread a sakura-pink stitch through it. Once
// every stitch is placed the ring is locked and the chime announces a
// finished 曲げわっぱ.
// ═════════════════════════════════════════════════════════════════════
function TojiStep({
  onComplete,
  onBack,
  onStitchesChange,
}: {
  onComplete: (dataUrl: string) => void;
  onBack: () => void;
  onStitchesChange: (n: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Stitches are placed in order, 0..TOJI_STITCHES-1, so the user works
  // from one end of the seam to the other.
  const [placed, setPlaced] = useState(0);
  const placedRef = useRef(0);
  const finalizingRef = useRef(false);
  const [finalizing, setFinalizing] = useState(false);
  const muted = useMutedRef();

  const ready = placed >= TOJI_STITCHES;

  // Stitch positions along a vertical seam at the right side of the
  // The finished magewappa is now drawn as a 和風お弁当箱 (Japanese
  // lunchbox): a rounded-corner rectangle ~1.5:1 with a center
  // partition, instead of the previous round bowl. Stitch points sit
  // along the bottom seam where the lid meets the base.
  const BOX_W_FACTOR = 0.6;  // box width = SIZE * 0.6 → ~1.5:1 with height
  const BOX_H_FACTOR = 0.4;
  const stitchPoints = useMemo(() => {
    const cx = SIZE / 2;
    const cy = SIZE * 0.55;
    const w = SIZE * BOX_W_FACTOR;
    const h = SIZE * BOX_H_FACTOR;
    const seamY = cy + h / 2; // bottom edge = lid/base seam
    // 5 stitches evenly spaced across the seam, with insets so the
    // outermost stitches sit just inside the rounded corners.
    const inset = w * 0.08;
    return Array.from({ length: TOJI_STITCHES }, (_, i) => {
      const tNorm = i / (TOJI_STITCHES - 1);
      const x = cx - w / 2 + inset + (w - 2 * inset) * tNorm;
      return {
        x: Math.round(x),
        y: Math.round(seamY),
      };
    });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1d130a");
    bg.addColorStop(1, "#0a0604");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.55;
    const boxW = w * BOX_W_FACTOR;
    const boxH = h * BOX_H_FACTOR;
    const x0 = cx - boxW / 2;
    const y0 = cy - boxH / 2;
    const radius = 14;

    // Bento box body — rounded-corner rectangle viewed from above.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, boxW, boxH, radius);
    // Cedar wood gradient (lighter on the lit upper-left edge).
    const grad = ctx.createLinearGradient(x0, y0, x0 + boxW, y0 + boxH);
    grad.addColorStop(0, "#b88554");
    grad.addColorStop(0.55, "#9a6a32");
    grad.addColorStop(1, "#6e4a22");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(40,24,10,0.55)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // Wood grain — long horizontal strokes following the cedar plank.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0 + 2, y0 + 2, boxW - 4, boxH - 4, radius - 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(40,24,10,0.18)";
    ctx.lineWidth = 0.8;
    for (let yy = y0 + 6; yy < y0 + boxH - 4; yy += 6) {
      const wobble = Math.sin(yy * 0.21) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x0 + 4, yy + wobble);
      ctx.lineTo(x0 + boxW - 4, yy - wobble);
      ctx.stroke();
    }
    ctx.restore();

    // Center partition (おかず / ご飯 仕切り) — the divider that gives
    // the box its bento identity.
    ctx.save();
    ctx.strokeStyle = "rgba(40,24,10,0.32)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.round(cx), Math.round(y0 + 8));
    ctx.lineTo(Math.round(cx), Math.round(y0 + boxH - 8));
    ctx.stroke();
    // Partition wall thin shadow line for depth.
    ctx.strokeStyle = "rgba(40,24,10,0.16)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(Math.round(cx + 1), Math.round(y0 + 9));
    ctx.lineTo(Math.round(cx + 1), Math.round(y0 + boxH - 7));
    ctx.stroke();
    ctx.restore();

    // Seam — horizontal line along the bottom edge where the lid
    // meets the base. The cherry-bark stitches sit on this line.
    ctx.save();
    ctx.strokeStyle = "rgba(20,12,5,0.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x0 + 6), Math.round(y0 + boxH));
    ctx.lineTo(Math.round(x0 + boxW - 6), Math.round(y0 + boxH));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Stitch markers — pulsing dashed rings at unplaced points.
    const t = performance.now() / 1000;
    for (let i = 0; i < stitchPoints.length; i++) {
      const p = stitchPoints[i]!;
      if (i < placedRef.current) {
        // Already stitched — draw a sakura-pink figure-8 stitch.
        ctx.save();
        ctx.strokeStyle = "#d57894";
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x - 9, p.y - 4);
        ctx.lineTo(p.x + 9, p.y + 4);
        ctx.moveTo(p.x - 9, p.y + 4);
        ctx.lineTo(p.x + 9, p.y - 4);
        ctx.stroke();
        // Tiny knot dot in the middle.
        ctx.fillStyle = "#b85773";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Not yet placed — pulsing hint ring on the next-up marker only.
        const isNext = i === placedRef.current;
        const pulse = isNext ? 0.6 + Math.sin(t * 4) * 0.4 : 0.25;
        ctx.save();
        ctx.strokeStyle = `rgba(213,120,148,${pulse})`;
        ctx.lineWidth = isNext ? 1.6 : 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, isNext ? 8 : 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // 弁 kanji watermark inside each compartment so the bento intent
    // reads even at thumbnail sizes.
    ctx.fillStyle = "rgba(252,232,170,0.14)";
    ctx.font = "italic 28px serif";
    ctx.textAlign = "center";
    ctx.fillText("飯", cx - boxW / 4, cy + 10);
    ctx.fillText("菜", cx + boxW / 4, cy + 10);

    // HUD
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `${placedRef.current} / ${TOJI_STITCHES} 桜皮綴じ`,
      cx,
      h * 0.16,
    );
  }, [stitchPoints]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (placedRef.current >= TOJI_STITCHES) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE;
    // Generous hit radius — tapping near the next marker counts.
    const target = stitchPoints[placedRef.current]!;
    const d = Math.hypot(x - target.x, y - target.y);
    if (d > 36) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    placedRef.current += 1;
    setPlaced(placedRef.current);
    onStitchesChange(placedRef.current);
    playClick({ mutedRef: muted, freq: 1800, volume: 0.9 });
  }

  function endPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function complete() {
    if (finalizingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    finalizingRef.current = true;
    setFinalizing(true);
    playChime({ mutedRef: muted });
    onComplete(canvas.toDataURL("image/png"));
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Sparkles size={14} /> Step 4 / 4 · 綴じ
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        桜皮で接合部を縫う
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        山桜の樹皮を細く割いた紐で 5 ヶ所を縫い綴じる。秋田の桜皮も誇り高い伝統素材。
      </p>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={onPointerDown}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        className={clsx(
          "aspect-square w-[min(92vw,32rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60",
          ready ? "cursor-default" : "cursor-pointer",
        )}
      />

      <div className="flex items-center gap-2">
        {Array.from({ length: TOJI_STITCHES }).map((_, i) => (
          <span
            key={i}
            className={clsx(
              "h-1 w-5 rounded-full transition-colors",
              i < placed ? "bg-pink-300" : "bg-washi-50/20",
            )}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 曲げ直す
        </button>
        <button
          type="button"
          onClick={complete}
          disabled={!ready || finalizing}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> 完成
        </button>
      </div>
    </div>
  );
}
