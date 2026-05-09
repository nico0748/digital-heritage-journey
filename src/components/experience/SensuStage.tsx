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
// A flat strip of washi spans the canvas. The user taps along the
// strip to add folds. Folds alternate automatically between 山折り
// (mountain) and 谷折り (valley) — that's the actual accordion
// pattern that lets the fan open and close. After FOLD_TARGET folds,
// the strip is fully accordioned.
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

    // Washi strip dimensions — flat at 0 folds, accordioned at full.
    const stripY = h * 0.5;
    const x0 = w * 0.08;
    const x1 = w * 0.92;
    const stripW = x1 - x0;
    const segW = stripW / RIBS;
    // Half-height of the paper strip. Was 26 (52px tall) which felt
    // cramped vs the canvas; tripled to 78 (156px tall) so the folded
    // washi has room to breathe and the alternating mountain/valley
    // creases are clearly readable.
    const paperHalfH = 78;
    // Compression: fully folded, the strip is half its flat width.
    const compress = 1 - (foldsRef.current / FOLD_TARGET) * 0.45;
    const visW = stripW * compress;
    const offsetX = (stripW - visW) / 2;
    const visX0 = x0 + offsetX;

    // Draw each segment between folds. When folded, alternate segments
    // shear up (山, mountain) or down (谷, valley) at a small angle.
    // Peak scales with the new paper height so the fold amplitude
    // stays proportional to the strip rather than looking flat.
    const peak = (foldsRef.current / FOLD_TARGET) * 40;
    for (let i = 0; i < RIBS; i++) {
      const sx0 = visX0 + segW * compress * i;
      const sx1 = visX0 + segW * compress * (i + 1);
      const isMountain = i % 2 === 0;
      const leftFolded = i > 0 && i <= foldsRef.current;
      const rightFolded = i < foldsRef.current;
      const yLeft = leftFolded
        ? stripY + (isMountain ? -peak : peak)
        : stripY;
      const yRight = rightFolded
        ? stripY + (isMountain ? peak : -peak)
        : stripY;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx0, yLeft - paperHalfH);
      ctx.lineTo(sx1, yRight - paperHalfH);
      ctx.lineTo(sx1, yRight + paperHalfH);
      ctx.lineTo(sx0, yLeft + paperHalfH);
      ctx.closePath();
      ctx.clip();

      ctx.fillStyle = "#F8F1E0";
      ctx.fillRect(0, 0, w, h);

      const warm = ctx.createLinearGradient(
        sx0,
        yLeft - paperHalfH,
        sx0,
        yLeft + paperHalfH,
      );
      warm.addColorStop(0, "rgba(250,240,215,0)");
      warm.addColorStop(1, "rgba(170,140,100,0.18)");
      ctx.fillStyle = warm;
      ctx.fillRect(
        sx0 - 2,
        yLeft - paperHalfH - 2,
        sx1 - sx0 + 4,
        paperHalfH * 2 + 4,
      );

      for (const g of grain) {
        ctx.fillStyle = `rgba(120, 90, 60, ${g.a})`;
        ctx.beginPath();
        ctx.arc(g.x * w, g.y * h, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.strokeStyle = "rgba(70, 48, 26, 0.3)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(sx0, yLeft - paperHalfH);
      ctx.lineTo(sx1, yRight - paperHalfH);
      ctx.lineTo(sx1, yRight + paperHalfH);
      ctx.lineTo(sx0, yLeft + paperHalfH);
      ctx.closePath();
      ctx.stroke();

      if (rightFolded) {
        const isMountainCrease = isMountain;
        ctx.strokeStyle = isMountainCrease
          ? "rgba(20,12,5,0.55)"
          : "rgba(150,110,70,0.45)";
        ctx.lineWidth = isMountainCrease ? 1.4 : 1;
        ctx.setLineDash(isMountainCrease ? [] : [3, 2]);
        ctx.beginPath();
        ctx.moveTo(sx1, yRight - paperHalfH - 2);
        ctx.lineTo(sx1, yRight + paperHalfH + 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // HUD — count + 山/谷 hint
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `${foldsRef.current} / ${FOLD_TARGET} 折り`,
      w / 2,
      h * 0.16,
    );
    if (foldsRef.current < FOLD_TARGET) {
      const next = foldsRef.current + 1;
      const isMountain = (next - 1) % 2 === 0;
      ctx.fillStyle = "rgba(252,232,170,0.5)";
      ctx.font = "11px monospace";
      ctx.fillText(
        `次は ${isMountain ? "山折り" : "谷折り"}`,
        w / 2,
        h * 0.16 + 18,
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
// washi. Painting is captured into an offscreen buffer so the design
// can be composited into the final spread fan in Shiage.
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

    // The folded paper is shown FLAT here (so the user has a clear
    // canvas to paint on), but with crease lines marking each fold so
    // they remember the shape.
    const x0 = w * 0.08;
    const x1 = w * 0.92;
    const stripW = x1 - x0;
    const segW = stripW / RIBS;
    const stripY = h * 0.5;
    const stripH = h * 0.55;

    // Paper background
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#F8F1E0";
    ctx.fillRect(x0, stripY - stripH / 2, stripW, stripH);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, stripY - stripH / 2, stripW, stripH);
    ctx.clip();

    const warm = ctx.createLinearGradient(0, stripY - stripH / 2, 0, stripY + stripH / 2);
    warm.addColorStop(0, "rgba(250,240,215,0)");
    warm.addColorStop(1, "rgba(170,140,100,0.2)");
    ctx.fillStyle = warm;
    ctx.fillRect(x0, stripY - stripH / 2, stripW, stripH);

    for (const g of grain) {
      ctx.fillStyle = `rgba(120, 90, 60, ${g.a})`;
      ctx.beginPath();
      ctx.arc(g.x * w, g.y * h, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crease guide lines
    for (let i = 1; i < RIBS; i++) {
      const cx = x0 + segW * i;
      const isMountain = (i - 1) % 2 === 0;
      ctx.strokeStyle = isMountain
        ? "rgba(20,12,5,0.18)"
        : "rgba(150,110,70,0.22)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash(isMountain ? [] : [3, 2]);
      ctx.beginPath();
      ctx.moveTo(cx, stripY - stripH / 2);
      ctx.lineTo(cx, stripY + stripH / 2);
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
    ctx.strokeRect(x0, stripY - stripH / 2, stripW, stripH);
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

    // The painted design — when EtsukeStep captured it, the strokes
    // were laid on a FLAT rectangular paper (centred horizontally on
    // the canvas, ~55% of canvas height). Drawing that flat image
    // directly on a fan wedge clips most of it away because the fan
    // covers a different region of the canvas. We instead slice the
    // flat paint into RIBS vertical columns and lay each column down
    // along its corresponding fan rib — same UV-style mapping the
    // hanabi star bursts use, scaled by the rib radius.
    const img = paintImgRef.current;
    if (img && img.naturalWidth > 0) {
      // Source columns map to RIBS-1 wedge slots; the flat paper in
      // EtsukeStep spans x in [0.08w, 0.92w] (the visible strip).
      const srcStripStart = w * 0.08;
      const srcStripWidth = w * 0.84;
      const srcStripTop = h * 0.225; // (0.5 - 0.55/2) * h
      const srcStripHeight = h * 0.55;
      const srcSliceW = srcStripWidth / (RIBS - 1);
      const wedgeSpan = total / (RIBS - 1);
      // Half-angle a single slice should cover so neighbouring slices
      // overlap a hair — kills sub-pixel seams between ribs.
      const sliceHalfAngle = wedgeSpan * 0.55;
      for (let i = 0; i < RIBS - 1; i++) {
        const tMid = (i + 0.5) / (RIBS - 1);
        const aMid = startAngle + total * tMid;
        ctx.save();
        ctx.translate(pivot.x, pivot.y);
        // Rotate so the slice's local +y axis points outward along
        // the rib (canvas y grows downward, fan opens upward → rotate
        // so that aMid becomes the local "down" direction).
        ctx.rotate(aMid + Math.PI / 2);
        // Compute the screen width of the rib at radius r1 — gives a
        // dest rectangle that visually fills its wedge slot.
        const destWidthAtRim = 2 * r1 * Math.tan(sliceHalfAngle);
        const destWidthAtPivot = 2 * r0 * Math.tan(sliceHalfAngle);
        const destWidth = Math.max(destWidthAtRim, destWidthAtPivot);
        const srcX = srcStripStart + srcSliceW * i;
        ctx.drawImage(
          img,
          srcX,
          srcStripTop,
          srcSliceW,
          srcStripHeight,
          -destWidth / 2,
          -r1,
          destWidth,
          r1 - r0,
        );
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
          <Check size={12} /> Complete
        </button>
      </div>
    </div>
  );
}
