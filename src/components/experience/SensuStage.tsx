"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brush, Check, Hand, Palette } from "lucide-react";
import clsx from "clsx";

type StepId = "spread" | "choose" | "paint" | "done";

const STEPS: {
  id: StepId;
  jp: string;
  en: string;
  hint: string;
  icon: typeof Hand;
}[] = [
  {
    id: "spread",
    jp: "扇を開く",
    en: "Unfold the fan",
    hint: "ドラッグして扇骨をひろげる",
    icon: Hand,
  },
  {
    id: "choose",
    jp: "筆を選ぶ",
    en: "Choose the brush",
    hint: "墨色と筆の太さを選ぶ",
    icon: Palette,
  },
  {
    id: "paint",
    jp: "絵を描く",
    en: "Paint the fan",
    hint: "扇面に自由に絵を描く",
    icon: Brush,
  },
  {
    id: "done",
    jp: "完成",
    en: "Complete",
    hint: "扇子が完成しました",
    icon: Check,
  },
];

const SIZE = 560;
const RIBS = 13;
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

export function SensuStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const spreadRef = useRef(0);
  const [spreadProgress, setSpreadProgress] = useState(0);
  const lastSpreadPt = useRef<{ x: number; y: number } | null>(null);

  const [inkId, setInkId] = useState<string>("sumi");
  const [sizeId, setSizeId] = useState<string>("medium");
  const ink = INKS.find((i) => i.id === inkId) ?? INKS[0];
  const brush = BRUSHES.find((b) => b.id === sizeId) ?? BRUSHES[1];

  const inkRef = useRef(ink.color);
  const sizeRef = useRef(brush.px);
  inkRef.current = ink.color;
  sizeRef.current = brush.px;

  const drawingRef = useRef(false);
  const lastPaintPt = useRef<{ x: number; y: number } | null>(null);
  const [hasPaint, setHasPaint] = useState(false);

  const grain = useMemo(() => {
    let s = 11;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 80 }, () => ({
      x: rng(),
      y: rng(),
      a: 0.04 + rng() * 0.07,
    }));
  }, []);

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

    const total =
      CLOSED_ANGLE + (OPEN_ANGLE - CLOSED_ANGLE) * spreadProgress;
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

    if (paintRef.current) {
      ctx.drawImage(paintRef.current, 0, 0, w, h);
    }

    ctx.restore();

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

    ctx.fillStyle = "#C9A227";
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1c120a";
    ctx.lineWidth = 1.4;
    ctx.stroke();

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
    if (step.id === "spread") {
      e.currentTarget.setPointerCapture(e.pointerId);
      lastSpreadPt.current = canvasPoint(e);
    } else if (step.id === "paint") {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      const p = canvasPoint(e);
      lastPaintPt.current = p;
      paintSegment(p, p);
      if (!hasPaint) setHasPaint(true);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (step.id === "spread") {
      if (!lastSpreadPt.current) return;
      const p = canvasPoint(e);
      const d = Math.hypot(
        p.x - lastSpreadPt.current.x,
        p.y - lastSpreadPt.current.y,
      );
      spreadRef.current = Math.min(
        1,
        spreadRef.current + d / SPREAD_DRAG_TARGET,
      );
      setSpreadProgress(spreadRef.current);
      if (spreadRef.current >= 1) {
        lastSpreadPt.current = null;
        setTimeout(
          () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1)),
          450,
        );
        return;
      }
      lastSpreadPt.current = p;
    } else if (step.id === "paint" && drawingRef.current) {
      const p = canvasPoint(e);
      paintSegment(lastPaintPt.current ?? p, p);
      lastPaintPt.current = p;
    }
  }

  function endPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drawingRef.current = false;
    lastPaintPt.current = null;
    if (step.id === "spread") lastSpreadPt.current = null;
  }

  function complete() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onComplete(canvas.toDataURL("image/png"));
  }

  const isInteractive = step.id === "spread" || step.id === "paint";

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <div className="flex items-center gap-3 sm:gap-5">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === stepIdx;
          const done = i < stepIdx;
          return (
            <div
              key={s.id}
              className={clsx(
                "flex flex-col items-center gap-1.5 transition",
                active
                  ? "text-washi-50"
                  : done
                    ? "text-washi-50/55"
                    : "text-washi-50/25",
              )}
            >
              <Icon size={14} />
              <span className="font-jp text-[0.6rem] tracking-wider whitespace-nowrap">
                {s.jp}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <p className="font-jp text-sm tracking-wider text-washi-50/90">
          {step.hint}
        </p>
        <p className="mt-1 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/45">
          {step.en}
        </p>
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
        className={clsx(
          "aspect-square w-[min(92vw,32rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60",
          step.id === "paint" ? "cursor-crosshair" : "cursor-pointer",
          !isInteractive && "pointer-events-none",
        )}
      />

      {step.id === "spread" && (
        <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
          <div
            className="h-full bg-washi-50 transition-[width] duration-150"
            style={{ width: `${spreadProgress * 100}%` }}
          />
        </div>
      )}

      {step.id === "choose" && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            {INKS.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setInkId(i.id)}
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-full border text-[0.7rem] font-jp transition",
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

          <div className="flex items-center gap-2">
            {BRUSHES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSizeId(b.id)}
                className={clsx(
                  "flex h-9 w-12 items-center justify-center rounded-full border text-[0.65rem] font-jp transition",
                  sizeId === b.id
                    ? "border-washi-50 bg-washi-50/10 text-washi-50"
                    : "border-washi-50/25 text-washi-50/70 hover:border-washi-50/50",
                )}
              >
                <span
                  className="rounded-full bg-current"
                  style={{ width: b.px * 1.6, height: b.px * 1.6 }}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setStepIdx((i) => i + 1)}
            className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100"
          >
            <Brush size={12} /> Start painting
          </button>
        </div>
      )}

      {step.id === "paint" && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/55">
            <span
              className="inline-block h-3 w-3 rounded-full ring-1 ring-washi-50/40"
              style={{ backgroundColor: ink.color }}
            />
            <span className="font-jp tracking-wider">{ink.jp}</span>
            <span className="text-washi-50/30">·</span>
            <span className="font-jp tracking-wider">{brush.jp}</span>
          </div>
          <button
            type="button"
            onClick={() => setStepIdx((i) => i + 1)}
            disabled={!hasPaint}
            className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
          >
            <Check size={12} /> Done
          </button>
        </div>
      )}

      {step.id === "done" && (
        <button
          type="button"
          onClick={complete}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100"
        >
          <Check size={12} /> Complete
        </button>
      )}
    </div>
  );
}
