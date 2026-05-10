"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brush,
  Check,
  Layers,
  Scissors,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────
// 4-step craft flow mirroring the real 京扇子 production sequence:
//   1. 竹割り (Wari-take)  — split bamboo into ribs
//   2. 紙折り (Kami-ori)   — accordion-fold the washi
//   3. 絵付け (Etsuke)     — choose ink/brush, paint the design
//   4. 仕上げ (Shiage)     — set the 要 (rivet) & spread the finished fan
//
// Real Kyoto fan-making has ~87 distinct specialist tasks; we condense
// to four representative phases that each give the user something
// concrete and tactile to do.
// ─────────────────────────────────────────────────────────────────────

type Step = "wari" | "ori" | "etsuke" | "shiage";

const SIZE = 560;
const RIBS = 13; // odd number — middle rib aligns with the spine
const SPLIT_TARGET = RIBS - 1; // 12 splits make 13 ribs
const FOLD_TARGET = RIBS - 1; // one fold per inter-rib gap
const SPREAD_DRAG_TARGET = 520;
const CLOSED_ANGLE = 0.16;
const OPEN_ANGLE = (150 * Math.PI) / 180;

const INKS: { id: string; jp: string; color: string }[] = [
  { id: "sumi", jp: "墨", color: "#1A1613" },
  { id: "shu", jp: "朱", color: "#C03D2B" },
  { id: "ai", jp: "藍", color: "#2B4A6F" },
  { id: "kin", jp: "金", color: "#C9A227" },
];

const BRUSHES: { id: string; jp: string; px: number }[] = [
  { id: "small", jp: "細", px: 2.4 },
  { id: "medium", jp: "中", px: 4.8 },
  { id: "large", jp: "太", px: 8.5 },
];

// Stable PRNG — same seed gives the same grain on every render so the
// washi texture doesn't flicker between frames or step transitions.
function seededGrain(seed: number, count: number) {
  let s = seed;
  const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: count }, () => ({
    x: rng(),
    y: rng(),
    a: 0.04 + rng() * 0.07,
  }));
}

export function SensuStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const [step, setStep] = useState<Step>("wari");
  // The painted layer is captured as a data URL after Etsuke so the
  // final Shiage canvas can composite it onto the spread fan.
  const [paintDataUrl, setPaintDataUrl] = useState<string | null>(null);
  const [inkId, setInkId] = useState<string>("sumi");
  const [sizeId, setSizeId] = useState<string>("medium");

  if (step === "wari") {
    return <WaritakeStep onConfirm={() => setStep("ori")} />;
  }
  if (step === "ori") {
    return (
      <OrikamiStep
        onConfirm={() => setStep("etsuke")}
        onBack={() => setStep("wari")}
      />
    );
  }
  if (step === "etsuke") {
    return (
      <EtsukeStep
        inkId={inkId}
        sizeId={sizeId}
        onInkChange={setInkId}
        onSizeChange={setSizeId}
        onConfirm={(dataUrl) => {
          setPaintDataUrl(dataUrl);
          setStep("shiage");
        }}
        onBack={() => setStep("ori")}
      />
    );
  }
  return (
    <ShiageStep
      paintDataUrl={paintDataUrl}
      onComplete={onComplete}
      onBack={() => setStep("etsuke")}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 1 — Wari-take (竹割り) — split bamboo into ribs
//
// A horizontal bamboo segment is shown. Each tap (anywhere on the log)
// adds the next split line at a deterministic position, like a 花火師
// dividing a length of bamboo with a knife. After SPLIT_TARGET taps,
// the log visibly fans out into individual ribs.
// ═════════════════════════════════════════════════════════════════════
function WaritakeStep({ onConfirm }: { onConfirm: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [splits, setSplits] = useState(0);
  const splitsRef = useRef(0);

  const ready = splits >= SPLIT_TARGET;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Workshop floor
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1d130a");
    bg.addColorStop(1, "#0a0604");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // The bamboo log lies horizontally across the workshop bench.
    const cy = h * 0.5;
    const logHalfH = 28;
    const x0 = w * 0.08;
    const x1 = w * 0.92;
    const logW = x1 - x0;

    // As splits are made, the ribs visibly fan out around the centre
    // (interpolate from 0 spread → small fan).
    const spread = splitsRef.current / SPLIT_TARGET;
    const tilt = spread * 0.18; // radians of total fan-out

    for (let i = 0; i < RIBS; i++) {
      const t = i / (RIBS - 1);
      // When un-split, every "rib" draws on top of the others as one log.
      const visible = i <= splitsRef.current;
      if (!visible) continue;

      const ribW = logW / RIBS;
      const cxRest = x0 + ribW * (i + 0.5);
      // Each rib drifts away from centre by tilt × distance-from-centre.
      const angle = (t - 0.5) * tilt;
      const cx = cxRest;
      const ribCy = cy + Math.abs(t - 0.5) * 8 * spread;

      ctx.save();
      ctx.translate(cx, ribCy);
      ctx.rotate(angle);

      // Lighter mid-tone so the rib reads against the near-black bg.
      const grad = ctx.createLinearGradient(0, -logHalfH, 0, logHalfH);
      grad.addColorStop(0, "#5a3b22");
      grad.addColorStop(0.5, "#8a5a30");
      grad.addColorStop(1, "#3d2716");
      ctx.fillStyle = grad;
      ctx.fillRect(-ribW * 0.42, -logHalfH, ribW * 0.84, logHalfH * 2);

      // Top-edge highlight — adds a single bright stroke that lifts the
      // bamboo off the dark workshop floor without changing palette.
      ctx.strokeStyle = "rgba(255,235,200,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-ribW * 0.42, -logHalfH + 1);
      ctx.lineTo(ribW * 0.42, -logHalfH + 1);
      ctx.stroke();

      // Bamboo joints — horizontal nodes on each rib, hint at material.
      ctx.strokeStyle = "rgba(20,12,5,0.55)";
      ctx.lineWidth = 1;
      for (let j = 1; j < 4; j++) {
        const ny = -logHalfH + (logHalfH * 2 * j) / 4;
        ctx.beginPath();
        ctx.moveTo(-ribW * 0.42, ny);
        ctx.lineTo(ribW * 0.42, ny);
        ctx.stroke();
      }

      ctx.restore();
    }

    // If un-split portion remains, draw it as a continuous bamboo block
    // sitting where future ribs would emerge from.
    const remaining = SPLIT_TARGET - splitsRef.current;
    if (remaining > 0) {
      const startI = splitsRef.current;
      const blockX0 = x0 + (logW / RIBS) * startI;
      const blockX1 = x1;
      // Match the rib mid-tone so the un-split block visually reads as
      // the same material at the same lit angle.
      const grad = ctx.createLinearGradient(0, cy - logHalfH, 0, cy + logHalfH);
      grad.addColorStop(0, "#5a3b22");
      grad.addColorStop(0.5, "#8a5a30");
      grad.addColorStop(1, "#3d2716");
      ctx.fillStyle = grad;
      ctx.fillRect(blockX0, cy - logHalfH, blockX1 - blockX0, logHalfH * 2);
      // Top-edge highlight on the unsplit block so it doesn't go dark.
      ctx.strokeStyle = "rgba(255,235,200,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(blockX0, cy - logHalfH + 1);
      ctx.lineTo(blockX1, cy - logHalfH + 1);
      ctx.stroke();
      // Pending split markers — faint vertical dashes.
      ctx.strokeStyle = "rgba(252,232,170,0.18)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (let i = 0; i < remaining; i++) {
        const sx = blockX0 + (logW / RIBS) * (i + 1);
        ctx.beginPath();
        ctx.moveTo(sx, cy - logHalfH - 6);
        ctx.lineTo(sx, cy + logHalfH + 6);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // HUD — count + tap hint
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `${splitsRef.current} / ${SPLIT_TARGET} 割り`,
      w / 2,
      h * 0.18,
    );
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

  function onCanvasTap() {
    if (splitsRef.current >= SPLIT_TARGET) return;
    splitsRef.current += 1;
    setSplits(splitsRef.current);
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Scissors size={14} /> Step 1 / 4 · 竹割り
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        竹を割って扇骨を作る
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        一本の竹を細く均等に裂いて 13 本の扇骨に。タップで一筋ずつ割いていく。
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

      <div className="flex items-center gap-2">
        {Array.from({ length: SPLIT_TARGET }).map((_, i) => (
          <span
            key={i}
            className={clsx(
              "h-1 w-3 rounded-full transition-colors",
              i < splits ? "bg-amber-300" : "bg-washi-50/20",
            )}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={!ready}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        紙折りへ
        <ArrowRight size={12} />
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 2 — Kami-ori (紙折り) — accordion-fold the washi
//
// A wedge-shaped sheet of washi (the actual fan blank, 地紙) sits in
// the canvas. The user taps to add folds along radial crease lines.
// Folds alternate automatically between 山折り (mountain) and 谷折り
// (valley) — that's the accordion pattern that lets a fan open and
// close. As folds accumulate the wedge compresses angularly toward
// the closed (narrow) form.
// ═════════════════════════════════════════════════════════════════════
function OrikamiStep({
  onConfirm,
  onBack,
}: {
  onConfirm: () => void;
  onBack: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [folds, setFolds] = useState(0);
  const foldsRef = useRef(0);
  const grain = useMemo(() => seededGrain(11, 80), []);

  const ready = folds >= FOLD_TARGET;

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

    // Fan geometry — pivot at bottom-center, wedge fans upward. Same
    // pivot/r0/r1 as Etsuke and Shiage so the painted washi composes
    // cleanly across all three steps.
    const pivot = { x: w / 2, y: h * 0.94 };
    const r0 = 42;
    const r1 = w * 0.44;

    // Compress the wedge angularly as folds accumulate. Fully folded
    // sits at 35% of the open angle — narrow but still legibly a fan.
    const compress = 1 - (foldsRef.current / FOLD_TARGET) * 0.65;
    const total = OPEN_ANGLE * compress;
    const startAngle = -Math.PI / 2 - total / 2;
    const endAngle = -Math.PI / 2 + total / 2;
    const wedge = total / (RIBS - 1);

    const fanPath = new Path2D();
    fanPath.arc(pivot.x, pivot.y, r1, startAngle, endAngle, false);
    fanPath.arc(pivot.x, pivot.y, r0, endAngle, startAngle, true);
    fanPath.closePath();

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#F8F1E0";
    ctx.fill(fanPath);
    ctx.restore();

    ctx.save();
    ctx.clip(fanPath);

    const warm = ctx.createLinearGradient(0, pivot.y - r1, 0, pivot.y);
    warm.addColorStop(0, "rgba(250,240,215,0)");
    warm.addColorStop(1, "rgba(170,140,100,0.2)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, w, h);

    for (const g of grain) {
      ctx.fillStyle = `rgba(120, 90, 60, ${g.a})`;
      ctx.beginPath();
      ctx.arc(g.x * w, g.y * h, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Per-segment shading — folded segments alternate light/shadow so
    // the accordion takes shape visually as the user adds creases.
    for (let i = 0; i < RIBS - 1; i++) {
      const isFolded = i < foldsRef.current;
      if (!isFolded) continue;
      const a0 = startAngle + wedge * i;
      const a1 = startAngle + wedge * (i + 1);
      const isMountainSeg = i % 2 === 0;
      ctx.save();
      const segPath = new Path2D();
      segPath.arc(pivot.x, pivot.y, r1, a0, a1, false);
      segPath.arc(pivot.x, pivot.y, r0, a1, a0, true);
      segPath.closePath();
      ctx.clip(segPath);
      ctx.fillStyle = isMountainSeg
        ? "rgba(255,240,200,0.10)"
        : "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    ctx.restore();

    // Radial crease lines — solid (山折り) or dashed (谷折り) once the
    // user has folded that crease; faint dotted guide otherwise.
    for (let i = 1; i < RIBS; i++) {
      const a = startAngle + wedge * i;
      const folded = i <= foldsRef.current;
      if (!folded) {
        ctx.strokeStyle = "rgba(252,232,170,0.18)";
        ctx.lineWidth = 0.7;
        ctx.setLineDash([3, 4]);
      } else {
        const isMountain = (i - 1) % 2 === 0;
        ctx.strokeStyle = isMountain
          ? "rgba(20,12,5,0.55)"
          : "rgba(150,110,70,0.45)";
        ctx.lineWidth = isMountain ? 1.4 : 1;
        ctx.setLineDash(isMountain ? [] : [3, 2]);
      }
      ctx.beginPath();
      ctx.moveTo(
        pivot.x + Math.cos(a) * r0,
        pivot.y + Math.sin(a) * r0,
      );
      ctx.lineTo(
        pivot.x + Math.cos(a) * r1,
        pivot.y + Math.sin(a) * r1,
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Outer paper border
    ctx.strokeStyle = "rgba(70,48,26,0.55)";
    ctx.lineWidth = 1.2;
    ctx.stroke(fanPath);

    // HUD — count + 山/谷 hint, anchored above the wedge.
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `${foldsRef.current} / ${FOLD_TARGET} 折り`,
      w / 2,
      h * 0.10,
    );
    if (foldsRef.current < FOLD_TARGET) {
      const next = foldsRef.current + 1;
      const isMountain = (next - 1) % 2 === 0;
      ctx.fillStyle = "rgba(252,232,170,0.5)";
      ctx.font = "11px monospace";
      ctx.fillText(
        `次は ${isMountain ? "山折り" : "谷折り"}`,
        w / 2,
        h * 0.10 + 18,
      );
    }
  }, [grain]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  function onCanvasTap() {
    if (foldsRef.current >= FOLD_TARGET) return;
    foldsRef.current += 1;
    setFolds(foldsRef.current);
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Layers size={14} /> Step 2 / 4 · 紙折り
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        和紙を山折り・谷折りで畳む
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        山折りと谷折りを交互に。タップごとに次の折り筋が入る。蛇腹に畳まれた紙が扇の地紙になる。
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

      <div className="flex items-center gap-2">
        {Array.from({ length: FOLD_TARGET }).map((_, i) => (
          <span
            key={i}
            className={clsx(
              "h-1 w-3 rounded-full transition-colors",
              i < folds ? "bg-amber-300" : "bg-washi-50/20",
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
          <ArrowLeft size={12} /> 竹を割り直す
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          絵付けへ
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 3 — Etsuke (絵付け) — pick ink + brush, paint on the folded
// washi. The wedge is shown fully open here (so the user has a clear
// surface to paint on) with radial creases marking each fold. The
// paint buffer is the same SIZE × SIZE as the canvas, so Shiage can
// rotate-sample it slice-by-slice as the fan opens.
// ═════════════════════════════════════════════════════════════════════
function EtsukeStep({
  inkId,
  sizeId,
  onInkChange,
  onSizeChange,
  onConfirm,
  onBack,
}: {
  inkId: string;
  sizeId: string;
  onInkChange: (id: string) => void;
  onSizeChange: (id: string) => void;
  onConfirm: (paintDataUrl: string) => void;
  onBack: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement | null>(null);
  const ink = INKS.find((i) => i.id === inkId) ?? INKS[0]!;
  const brush = BRUSHES.find((b) => b.id === sizeId) ?? BRUSHES[1]!;
  const inkRef = useRef(ink.color);
  const sizeRef = useRef(brush.px);
  inkRef.current = ink.color;
  sizeRef.current = brush.px;

  const drawingRef = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [hasPaint, setHasPaint] = useState(false);
  const grain = useMemo(() => seededGrain(11, 80), []);

  // Allocate the offscreen paint buffer once.
  useEffect(() => {
    if (paintRef.current) return;
    const c = document.createElement("canvas");
    c.width = SIZE;
    c.height = SIZE;
    paintRef.current = c;
  }, []);

  // Fan geometry shared with the buffer's clip path so painting that
  // strays outside the wedge is masked out (otherwise it would show as
  // stray pixels when Shiage composites slice-by-slice).
  const fan = {
    pivotX: SIZE / 2,
    pivotY: SIZE * 0.94,
    r0: 42,
    r1: SIZE * 0.44,
    total: OPEN_ANGLE,
    startAngle: -Math.PI / 2 - OPEN_ANGLE / 2,
    endAngle: -Math.PI / 2 + OPEN_ANGLE / 2,
  };

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

    const pivot = { x: w / 2, y: h * 0.94 };
    const r0 = 42;
    const r1 = w * 0.44;
    const total = OPEN_ANGLE;
    const startAngle = -Math.PI / 2 - total / 2;
    const endAngle = -Math.PI / 2 + total / 2;
    const wedge = total / (RIBS - 1);

    const fanPath = new Path2D();
    fanPath.arc(pivot.x, pivot.y, r1, startAngle, endAngle, false);
    fanPath.arc(pivot.x, pivot.y, r0, endAngle, startAngle, true);
    fanPath.closePath();

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#F8F1E0";
    ctx.fill(fanPath);
    ctx.restore();

    ctx.save();
    ctx.clip(fanPath);

    const warm = ctx.createLinearGradient(0, pivot.y - r1, 0, pivot.y);
    warm.addColorStop(0, "rgba(250,240,215,0)");
    warm.addColorStop(1, "rgba(170,140,100,0.2)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, w, h);

    for (const g of grain) {
      ctx.fillStyle = `rgba(120, 90, 60, ${g.a})`;
      ctx.beginPath();
      ctx.arc(g.x * w, g.y * h, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Radial crease guides — alternating 山折り (solid) and 谷折り
    // (dashed). They're faint so they don't dominate the painting.
    for (let i = 1; i < RIBS; i++) {
      const a = startAngle + wedge * i;
      const isMountain = (i - 1) % 2 === 0;
      ctx.strokeStyle = isMountain
        ? "rgba(20,12,5,0.18)"
        : "rgba(150,110,70,0.22)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash(isMountain ? [] : [3, 2]);
      ctx.beginPath();
      ctx.moveTo(
        pivot.x + Math.cos(a) * r0,
        pivot.y + Math.sin(a) * r0,
      );
      ctx.lineTo(
        pivot.x + Math.cos(a) * r1,
        pivot.y + Math.sin(a) * r1,
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Composite the painted layer on top.
    if (paintRef.current) {
      ctx.drawImage(paintRef.current, 0, 0, w, h);
    }

    ctx.restore();

    // Paper border
    ctx.strokeStyle = "rgba(70,48,26,0.55)";
    ctx.lineWidth = 1.2;
    ctx.stroke(fanPath);
  }, [grain]);

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

  function paintSegment(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    const buf = paintRef.current;
    if (!buf) return;
    const bctx = buf.getContext("2d");
    if (!bctx) return;
    bctx.save();
    // Clip strokes to the fan wedge — anything outside is invisible
    // both here and in Shiage's slice-rotated composite.
    bctx.beginPath();
    bctx.arc(fan.pivotX, fan.pivotY, fan.r1, fan.startAngle, fan.endAngle, false);
    bctx.arc(fan.pivotX, fan.pivotY, fan.r0, fan.endAngle, fan.startAngle, true);
    bctx.closePath();
    bctx.clip();
    bctx.lineCap = "round";
    bctx.lineJoin = "round";
    bctx.strokeStyle = inkRef.current;
    bctx.lineWidth = sizeRef.current;
    bctx.beginPath();
    bctx.moveTo(from.x, from.y);
    bctx.lineTo(to.x, to.y);
    bctx.stroke();
    bctx.restore();
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = canvasPoint(e);
    lastPt.current = p;
    paintSegment(p, p);
    if (!hasPaint) setHasPaint(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = canvasPoint(e);
    paintSegment(lastPt.current ?? p, p);
    lastPt.current = p;
  }

  function endPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drawingRef.current = false;
    lastPt.current = null;
  }

  function confirm() {
    const buf = paintRef.current;
    if (!buf) return;
    onConfirm(buf.toDataURL("image/png"));
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Brush size={14} /> Step 3 / 4 · 絵付け
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        地紙に絵を描く
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        畳んだ和紙の上に、墨や色で自由に描く。折り筋を活かしても、無視しても良い。
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          {INKS.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => onInkChange(i.id)}
              className={clsx(
                "flex h-9 w-9 items-center justify-center rounded-full border text-[0.65rem] font-jp transition",
                inkId === i.id
                  ? "scale-110 border-washi-50 text-washi-50"
                  : "border-washi-50/25 text-washi-50/70 hover:border-washi-50/50",
              )}
              style={{ backgroundColor: i.color }}
              aria-label={i.jp}
            >
              <span className="drop-shadow">{i.jp}</span>
            </button>
          ))}
        </div>
        <span className="text-washi-50/30">|</span>
        <div className="flex items-center gap-2">
          {BRUSHES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onSizeChange(b.id)}
              className={clsx(
                "flex h-8 w-10 items-center justify-center rounded-full border text-[0.6rem] font-jp transition",
                sizeId === b.id
                  ? "border-washi-50 bg-washi-50/10 text-washi-50"
                  : "border-washi-50/25 text-washi-50/70 hover:border-washi-50/50",
              )}
            >
              <span
                className="rounded-full bg-current"
                style={{ width: b.px * 1.4, height: b.px * 1.4 }}
              />
            </button>
          ))}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
        className="aspect-square w-[min(92vw,32rem)] touch-none cursor-crosshair rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 紙を折り直す
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!hasPaint}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          仕上げへ
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 4 — Shiage (仕上げ) — set the 要 (rivet) and spread the
// finished fan. The painted washi from Etsuke is composited onto the
// fan during draw, so the final saved snapshot shows the user's design
// fanned out across the ribs.
// ═════════════════════════════════════════════════════════════════════
function ShiageStep({
  paintDataUrl,
  onComplete,
  onBack,
}: {
  paintDataUrl: string | null;
  onComplete: (dataUrl: string) => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintImgRef = useRef<HTMLImageElement | null>(null);
  const spreadRef = useRef(0);
  const [spreadProgress, setSpreadProgress] = useState(0);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [done, setDone] = useState(false);
  const finalizingRef = useRef(false);
  const [finalizing, setFinalizing] = useState(false);
  const grain = useMemo(() => seededGrain(11, 80), []);

  // Load the painted layer once so it can be drawn each frame.
  useEffect(() => {
    if (!paintDataUrl) return;
    const img = new Image();
    img.onload = () => {
      paintImgRef.current = img;
    };
    img.src = paintDataUrl;
  }, [paintDataUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createRadialGradient(
      w / 2,
      h * 0.94,
      40,
      w / 2,
      h * 0.4,
      w * 0.85,
    );
    bg.addColorStop(0, "#1d130a");
    bg.addColorStop(1, "#070403");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const pivot = { x: w / 2, y: h * 0.94 };
    const r0 = 42;
    const r1 = w * 0.44;

    const total = CLOSED_ANGLE + (OPEN_ANGLE - CLOSED_ANGLE) * spreadProgress;
    const startAngle = -Math.PI / 2 - total / 2;
    const endAngle = -Math.PI / 2 + total / 2;

    const paperPath = new Path2D();
    paperPath.arc(pivot.x, pivot.y, r1, startAngle, endAngle, false);
    paperPath.arc(pivot.x, pivot.y, r0, endAngle, startAngle, true);
    paperPath.closePath();

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "#F8F1E0";
    ctx.fill(paperPath);
    ctx.restore();

    ctx.save();
    ctx.clip(paperPath);

    const warm = ctx.createLinearGradient(0, pivot.y - r1, 0, pivot.y);
    warm.addColorStop(0, "rgba(250, 240, 215, 0)");
    warm.addColorStop(1, "rgba(170, 140, 100, 0.22)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, w, h);

    for (const g of grain) {
      ctx.fillStyle = `rgba(120, 90, 60, ${g.a})`;
      ctx.beginPath();
      ctx.arc(g.x * w, g.y * h, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Inner rib creases — one line per rib boundary inside the paper.
    ctx.strokeStyle = "rgba(70, 48, 26, 0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i < RIBS; i++) {
      const t = i / (RIBS - 1);
      const a = startAngle + total * t;
      ctx.beginPath();
      ctx.moveTo(pivot.x + Math.cos(a) * r0, pivot.y + Math.sin(a) * r0);
      ctx.lineTo(pivot.x + Math.cos(a) * r1, pivot.y + Math.sin(a) * r1);
      ctx.stroke();
    }

    // The painted design — EtsukeStep captures the brushwork onto a
    // wedge that matches OPEN_ANGLE (the fully spread fan). When the
    // current spread is narrower we slice that fully-open paint into
    // (RIBS-1) angular wedges and rotate each into its current rib
    // slot. Result: the painted strokes follow the ribs as the fan
    // opens, like real folded washi spreading apart.
    const img = paintImgRef.current;
    if (img && img.naturalWidth > 0) {
      const srcStartAngle = -Math.PI / 2 - OPEN_ANGLE / 2;
      const wedgeFull = OPEN_ANGLE / (RIBS - 1);
      const wedgeCurrent = total / (RIBS - 1);
      for (let i = 0; i < RIBS - 1; i++) {
        const srcMid = srcStartAngle + (i + 0.5) * wedgeFull;
        const dstMid = startAngle + (i + 0.5) * wedgeCurrent;
        const rot = dstMid - srcMid;
        ctx.save();
        // Clip to the dest wedge slice so neighbouring rotations
        // don't bleed into each other.
        const a0 = startAngle + i * wedgeCurrent;
        const a1 = startAngle + (i + 1) * wedgeCurrent;
        const slicePath = new Path2D();
        slicePath.arc(pivot.x, pivot.y, r1, a0, a1, false);
        slicePath.arc(pivot.x, pivot.y, r0, a1, a0, true);
        slicePath.closePath();
        ctx.clip(slicePath);
        // Rotate the paint canvas around the pivot by the angle delta
        // between source slice and dest slice.
        ctx.translate(pivot.x, pivot.y);
        ctx.rotate(rot);
        ctx.translate(-pivot.x, -pivot.y);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
      }
    }

    ctx.restore();

    // Bamboo ribs on top of the paper.
    for (let i = 0; i < RIBS; i++) {
      const t = i / (RIBS - 1);
      const a = startAngle + total * t;
      const isEdge = i === 0 || i === RIBS - 1;
      const x0 = pivot.x + Math.cos(a) * (r0 - 4);
      const y0 = pivot.y + Math.sin(a) * (r0 - 4);
      const x1 = pivot.x + Math.cos(a) * (r1 + 6);
      const y1 = pivot.y + Math.sin(a) * (r1 + 6);
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, "#1c120a");
      grad.addColorStop(1, isEdge ? "#4b2e1a" : "#3b2516");
      ctx.strokeStyle = grad;
      ctx.lineCap = "round";
      ctx.lineWidth = isEdge ? 6 : 4.4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // 要 (kaname) — gold rivet at the pivot.
    ctx.fillStyle = "#C9A227";
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1c120a";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Vignette
    const vig = ctx.createRadialGradient(
      w / 2,
      h * 0.55,
      w * 0.3,
      w / 2,
      h * 0.55,
      w * 0.7,
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }, [spreadProgress, grain]);

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
    if (done) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPt.current = canvasPoint(e);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!lastPt.current || done) return;
    const p = canvasPoint(e);
    const d = Math.hypot(p.x - lastPt.current.x, p.y - lastPt.current.y);
    spreadRef.current = Math.min(1, spreadRef.current + d / SPREAD_DRAG_TARGET);
    setSpreadProgress(spreadRef.current);
    if (spreadRef.current >= 1) {
      lastPt.current = null;
      setDone(true);
      return;
    }
    lastPt.current = p;
  }

  function endPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    lastPt.current = null;
  }

  function complete() {
    if (finalizingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    finalizingRef.current = true;
    setFinalizing(true);
    onComplete(canvas.toDataURL("image/png"));
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Sparkles size={14} /> Step 4 / 4 · 仕上げ
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        要を打ち、扇を開く
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        竹骨を地紙に差し、要(かなめ)で留める。最後にゆっくり開いて出来上がり。ドラッグして扇骨をひろげる。
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
          done ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
      />

      <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-washi-50 transition-[width] duration-150"
          style={{ width: `${spreadProgress * 100}%` }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 描き直す
        </button>
        <button
          type="button"
          onClick={complete}
          disabled={!done || finalizing}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> {t("common.complete")}
        </button>
      </div>
    </div>
  );
}
