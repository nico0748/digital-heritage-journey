"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brush, Check, Flame } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "@/lib/i18n";

type StepId = "light" | "draw" | "done";

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

interface Stroke {
  points: { x: number; y: number }[];
}

interface Ripple {
  x: number;
  y: number;
  start: number;
}

const W = 480;
const H = 600;
const LIGHT_TARGET = 8;
const DRAW_TARGET = 220;

export function LanternStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const t = useTranslations();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState<StepId>("light");
  const [lights, setLights] = useState(0);
  const [drawProgress, setDrawProgress] = useState(0);

  const lightsRef = useRef(0);
  const glowRef = useRef(0);
  const embersRef = useRef<Ember[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const drawLengthRef = useRef(0);
  const drawingRef = useRef(false);
  const stepRef = useRef<StepId>("light");
  const advanceTimerRef = useRef<number | null>(null);

  const stars = useMemo<Star[]>(() => {
    let s = 11;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 80 }, () => ({
      x: rng(),
      y: rng() * 0.7,
      size: 0.4 + rng() * 1.4,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Step 1 → 2 transition
  useEffect(() => {
    if (lights >= LIGHT_TARGET && step === "light") {
      const t = window.setTimeout(() => setStep("draw"), 700);
      return () => window.clearTimeout(t);
    }
  }, [lights, step]);

  // Cleanup any pending advance timer on unmount
  useEffect(
    () => () => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }
    },
    [],
  );

  // Animation loop — single rAF, ref-driven so React state changes don't restart it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const start = performance.now();

    const cx = W / 2;
    const cy = H * 0.48;
    const lw = 180;
    const lh = 240;

    const loop = () => {
      const tSec = (performance.now() - start) / 1000;

      // Smooth glow toward lit count
      const target = lightsRef.current / LIGHT_TARGET;
      glowRef.current += (target - glowRef.current) * 0.08;
      const glow = glowRef.current;

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#070410");
      sky.addColorStop(0.55, "#120816");
      sky.addColorStop(1, "#1A0E0A");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Stars
      for (const star of stars) {
        const a = 0.25 + Math.sin(tSec * 1.4 + star.phase) * 0.35;
        ctx.fillStyle = `rgba(255,240,210,${Math.max(0, a)})`;
        ctx.beginPath();
        ctx.arc(star.x * W, star.y * H, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Halo around the lantern
      if (glow > 0.04) {
        const halo = ctx.createRadialGradient(
          cx,
          cy,
          lw * 0.35,
          cx,
          cy,
          lw * 2.1,
        );
        const a = glow * 0.55;
        halo.addColorStop(0, `rgba(249, 217, 118, ${a})`);
        halo.addColorStop(0.45, `rgba(192, 61, 43, ${a * 0.45})`);
        halo.addColorStop(1, "rgba(192, 61, 43, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, lw * 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Festival mode hangs every lantern from a single horizontal
      // hemp rope strung across the top of the canvas with a slight
      // catenary sag, like real matsuri street decoration. Compute
      // the rope geometry once so all hanging cords (centre + 4
      // satellites) attach to it consistently.
      const isFestival = stepRef.current === "done";
      const ropeBaseY = 60;
      const ropeSag = 14;
      const ropeYAt = (xx: number) => {
        if (!isFestival) return 0;
        // Soft droop — 0 at the anchor poles, max sag at canvas centre.
        const xn = xx / W;
        return ropeBaseY + ropeSag * (1 - Math.cos(xn * Math.PI * 2)) * 0.5;
      };

      if (isFestival) {
        // The rope itself — slightly wobbly hemp tone.
        ctx.strokeStyle = "rgba(60,42,22,0.85)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let xx = 0; xx <= W; xx += 8) {
          const yy = ropeYAt(xx);
          if (xx === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        // Pole anchors at each end so the rope reads as "hung between
        // two posts" rather than floating from nothing.
        ctx.fillStyle = "#3E2A1F";
        ctx.fillRect(2, ropeYAt(0) - 14, 4, 26);
        ctx.fillRect(W - 6, ropeYAt(W) - 14, 4, 26);
      }

      // Centre lantern's hanging cord — anchored to the rope in
      // festival mode, otherwise straight up to the top of the canvas
      // (the original "single isolated lantern" look while drawing).
      ctx.strokeStyle = "rgba(40,28,18,0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, isFestival ? ropeYAt(cx) : 0);
      ctx.lineTo(cx, cy - lh / 2 - 22);
      ctx.stroke();

      // Top cap
      const capW = lw * 0.46;
      const capH = 18;
      ctx.fillStyle = "#3E2A1F";
      ctx.beginPath();
      ctx.roundRect(cx - capW / 2, cy - lh / 2 - 22, capW, capH, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255,200,140,0.18)";
      ctx.fillRect(cx - capW / 2 + 4, cy - lh / 2 - 21, capW - 8, 3);

      // Center lantern body + ribs + calligraphy
      drawLanternBody(ctx, cx, cy, lw, lh, glow);
      drawLanternRibs(ctx, cx, cy, lw, lh, glow);
      if (strokesRef.current.length > 0 || currentStrokeRef.current) {
        drawCalligraphy(ctx, cx, cy, lw, lh, glow);
      }

      // Bottom cap + tassel for the centre lantern
      ctx.fillStyle = "#3E2A1F";
      ctx.beginPath();
      ctx.roundRect(cx - capW / 2, cy + lh / 2 + 4, capW, capH, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(192, 61, 43, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + lh / 2 + 22);
      ctx.lineTo(cx, cy + lh / 2 + 50);
      ctx.stroke();
      ctx.fillStyle = "rgba(201, 162, 39, 0.92)";
      ctx.beginPath();
      ctx.arc(cx, cy + lh / 2 + 54, 4, 0, Math.PI * 2);
      ctx.fill();

      // Festival mode — hang the user's lantern alongside four "祭"
      // satellites along the same rope so the final scene reads as a
      // matsuri street with lanterns evenly strung between two poles.
      // Heights are nearly uniform (just a few px of organic stagger)
      // and each lantern's cord goes UP to the rope, not to the top
      // of the canvas — the previous "every lantern dangling from
      // the sky" look was the surreal part the user flagged.
      if (isFestival) {
        const satellites = [
          { dx: -lw * 1.05, dyJitter: 8, scale: 0.6, phase: 1.3 },
          { dx: -lw * 0.62, dyJitter: 4, scale: 0.74, phase: 0.6 },
          { dx: lw * 0.62, dyJitter: 6, scale: 0.74, phase: 1.7 },
          { dx: lw * 1.05, dyJitter: 10, scale: 0.6, phase: 2.2 },
        ];
        for (const sat of satellites) {
          const sway = Math.sin(tSec * 0.7 + sat.phase) * 3;
          const sxBase = cx + sat.dx;
          const sx = sxBase + sway;
          // All satellites hang at roughly the same y as the centre
          // lantern, with only a few px of organic variation. Outer
          // lanterns sit a hair lower than inner ones to mimic how a
          // weighted rope sags toward its centre, but the spread is
          // tiny (≤ 10px) — not the 56px chaos that made the previous
          // version feel surreal.
          const sy = cy + sat.dyJitter + Math.sin(tSec * 0.45 + sat.phase) * 1.5;
          const slw = lw * sat.scale;
          const slh = lh * sat.scale;
          const sg = Math.min(
            1,
            glow * 0.88 + Math.sin(tSec * 1.1 + sat.phase * 2) * 0.06,
          );
          // Cord from the rope down to the satellite's top cap.
          const cordTopY = ropeYAt(sxBase);
          const cordBottomY = sy - slh / 2 - slh * 0.06;
          ctx.strokeStyle = "rgba(40,28,18,0.78)";
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(sxBase, cordTopY);
          // Cord follows the lantern's sway slightly so the bottom
          // attachment moves with the body.
          ctx.lineTo(sx, cordBottomY);
          ctx.stroke();
          // Halo
          if (sg > 0.05) {
            const halo = ctx.createRadialGradient(
              sx,
              sy,
              slw * 0.3,
              sx,
              sy,
              slw * 1.7,
            );
            const a = sg * 0.45;
            halo.addColorStop(0, `rgba(249, 217, 118, ${a})`);
            halo.addColorStop(1, "rgba(192, 61, 43, 0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(sx, sy, slw * 1.7, 0, Math.PI * 2);
            ctx.fill();
          }
          // Top cap (matches the centre lantern style — gives the
          // satellite a real hardware piece for the cord to attach to,
          // instead of the cord disappearing into the paper).
          const sCapW = slw * 0.46;
          const sCapH = slh * 0.075;
          ctx.fillStyle = "#3E2A1F";
          ctx.fillRect(
            sx - sCapW / 2,
            sy - slh / 2 - sCapH - 2,
            sCapW,
            sCapH,
          );
          drawLanternBody(ctx, sx, sy, slw, slh, sg);
          drawLanternRibs(ctx, sx, sy, slw, slh, sg);
          // "祭" calligraphy
          ctx.save();
          ctx.beginPath();
          drawLanternPath(ctx, sx, sy, slw, slh);
          ctx.clip();
          ctx.fillStyle = `rgba(20,10,5,${0.82 - sg * 0.1})`;
          ctx.font = `bold ${Math.floor(slh * 0.5)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("祭", sx, sy);
          ctx.restore();
          // Bottom cap + tiny tassel — matches the centre lantern.
          ctx.fillStyle = "#3E2A1F";
          ctx.fillRect(sx - sCapW / 2, sy + slh / 2 + 2, sCapW, sCapH);
          ctx.strokeStyle = "rgba(192, 61, 43, 0.8)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(sx, sy + slh / 2 + sCapH + 4);
          ctx.lineTo(sx, sy + slh / 2 + sCapH + 14);
          ctx.stroke();
        }
      }

      // Spawn embers when lit
      if (glow > 0.22 && Math.random() < 0.12 + glow * 0.45) {
        embersRef.current.push({
          x: cx + (Math.random() - 0.5) * lw * 0.55,
          y: cy + lh / 2 - 8 - Math.random() * 12,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -0.35 - Math.random() * 0.4,
          life: 0,
          maxLife: 80 + Math.random() * 70,
          size: 0.7 + Math.random() * 1.3,
          hue: 28 + Math.random() * 22,
        });
      }

      // Update embers
      for (const e of embersRef.current) {
        e.life += 1;
        e.x += e.vx;
        e.y += e.vy;
        e.vy *= 0.99;
        e.vx += (Math.random() - 0.5) * 0.025;
      }
      embersRef.current = embersRef.current.filter((e) => e.life < e.maxLife);
      for (const e of embersRef.current) {
        const a = (1 - e.life / e.maxLife) * 0.85;
        ctx.fillStyle = `hsla(${e.hue}, 95%, 70%, ${a})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Click ripples
      const now = performance.now();
      ripplesRef.current = ripplesRef.current.filter(
        (r) => now - r.start < 600,
      );
      for (const r of ripplesRef.current) {
        const age = (now - r.start) / 600;
        ctx.strokeStyle = `rgba(255, 220, 150, ${(1 - age) * 0.55})`;
        ctx.lineWidth = 2 - age * 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 6 + age * 50, 0, Math.PI * 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stars]);

  function drawLanternPath(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    lw: number,
    lh: number,
  ) {
    const topW = lw * 0.78;
    const botW = lw * 0.78;
    const topY = cy - lh / 2;
    const midY = cy;
    const botY = cy + lh / 2;
    const bulge = lw / 2 + 6;
    ctx.moveTo(cx - topW / 2, topY);
    ctx.quadraticCurveTo(cx - bulge, midY, cx - botW / 2, botY);
    ctx.lineTo(cx + botW / 2, botY);
    ctx.quadraticCurveTo(cx + bulge, midY, cx + topW / 2, topY);
    ctx.closePath();
  }

  function drawLanternBody(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    lw: number,
    lh: number,
    glow: number,
  ) {
    ctx.save();
    ctx.beginPath();
    drawLanternPath(ctx, cx, cy, lw, lh);
    ctx.clip();

    // Paper base color blends from dark to warm cream as glow rises
    const r = Math.floor(0x2a + (0xfb - 0x2a) * glow);
    const g = Math.floor(0x1d + (0xf7 - 0x1d) * glow);
    const b = Math.floor(0x14 + (0xf0 - 0x14) * glow);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(cx - lw / 2 - 2, cy - lh / 2 - 2, lw + 4, lh + 4);

    // Inner candle glow
    if (glow > 0.04) {
      const inner = ctx.createRadialGradient(cx, cy, 4, cx, cy, lw * 0.7);
      inner.addColorStop(0, `rgba(249, 217, 118, ${0.95 * glow})`);
      inner.addColorStop(0.5, `rgba(220, 110, 60, ${0.65 * glow})`);
      inner.addColorStop(1, `rgba(120, 40, 20, ${0.32 * glow})`);
      ctx.fillStyle = inner;
      ctx.fillRect(cx - lw / 2 - 2, cy - lh / 2 - 2, lw + 4, lh + 4);
    }

    // Subtle paper grain
    ctx.strokeStyle = `rgba(140,90,50,${0.05 + glow * 0.05})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const yy = cy - lh / 2 + (lh / 16) * i + Math.sin(i * 1.7) * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - lw / 2, yy);
      ctx.lineTo(cx + lw / 2, yy);
      ctx.stroke();
    }

    ctx.restore();

    // Outline
    ctx.strokeStyle = "rgba(30,18,10,0.78)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    drawLanternPath(ctx, cx, cy, lw, lh);
    ctx.stroke();
  }

  function drawLanternRibs(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    lw: number,
    lh: number,
    glow: number,
  ) {
    ctx.save();
    ctx.beginPath();
    drawLanternPath(ctx, cx, cy, lw, lh);
    ctx.clip();
    // Horizontal bamboo rings — chōchin's signature
    const ribCount = 11;
    ctx.strokeStyle = `rgba(40,25,15,${0.55 - glow * 0.18})`;
    ctx.lineWidth = 1.4;
    for (let i = 1; i < ribCount; i++) {
      const yy = cy - lh / 2 + (lh / ribCount) * i;
      ctx.beginPath();
      ctx.moveTo(cx - lw / 2 - 4, yy);
      ctx.lineTo(cx + lw / 2 + 4, yy);
      ctx.stroke();
    }
    // Vertical guide ribs
    ctx.strokeStyle = `rgba(40,25,15,${0.22})`;
    ctx.lineWidth = 0.8;
    for (let i = -1; i <= 1; i++) {
      const xx = cx + i * lw * 0.3;
      ctx.beginPath();
      ctx.moveTo(xx, cy - lh / 2 + 4);
      ctx.lineTo(xx, cy + lh / 2 - 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCalligraphy(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    lw: number,
    lh: number,
    glow: number,
  ) {
    ctx.save();
    ctx.beginPath();
    drawLanternPath(ctx, cx, cy, lw, lh);
    ctx.clip();

    ctx.strokeStyle = `rgba(20, 10, 5, ${0.85 - glow * 0.1})`;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 9;

    const all = [...strokesRef.current];
    if (currentStrokeRef.current) all.push(currentStrokeRef.current);
    for (const s of all) {
      if (s.points.length < 2) {
        if (s.points.length === 1) {
          const p = s.points[0];
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(20, 10, 5, 0.85)";
          ctx.fill();
        }
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  function isInLantern(x: number, y: number) {
    const cx = W / 2;
    const cy = H * 0.48;
    const lw = 180;
    const lh = 240;
    return Math.abs(x - cx) < lw / 2 + 6 && Math.abs(y - cy) < lh / 2 + 6;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = canvasPoint(e);
    if (stepRef.current === "light") {
      if (lightsRef.current >= LIGHT_TARGET) return;
      ripplesRef.current.push({ x, y, start: performance.now() });
      lightsRef.current = Math.min(LIGHT_TARGET, lightsRef.current + 1);
      setLights(lightsRef.current);
    } else if (stepRef.current === "draw") {
      if (!isInLantern(x, y)) return;
      drawingRef.current = true;
      currentStrokeRef.current = { points: [{ x, y }] };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (stepRef.current !== "draw" || !drawingRef.current) return;
    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    const { x, y } = canvasPoint(e);
    const last = stroke.points[stroke.points.length - 1];
    const d = Math.hypot(x - last.x, y - last.y);
    if (d < 2) return;
    stroke.points.push({ x, y });
    drawLengthRef.current += d;
    setDrawProgress(Math.min(1, drawLengthRef.current / DRAW_TARGET));
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (drawingRef.current && currentStrokeRef.current) {
      strokesRef.current.push(currentStrokeRef.current);
      currentStrokeRef.current = null;
      drawingRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      // Auto-advance was here — removed because a single confident
      // stroke crossed the threshold before the user was done drawing,
      // jumping to "done" against their will. The user now decides
      // when to finish via the explicit "提灯を完成させる" button
      // below the canvas (enabled once drawLength >= DRAW_TARGET).
    }
  }

  const drawDone = drawProgress >= 1;
  const finishDrawing = () => {
    if (stepRef.current !== "draw") return;
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setStep("done");
  };

  function complete() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onComplete(canvas.toDataURL("image/png"));
  }

  const lightProgress = lights / LIGHT_TARGET;

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <div className="flex items-center gap-5">
        <StepPill
          icon={<Flame size={14} />}
          jp="火を灯す"
          active={step === "light"}
          done={step !== "light"}
        />
        <StepPill
          icon={<Brush size={14} />}
          jp="文字を描く"
          active={step === "draw"}
          done={step === "done"}
        />
        <StepPill
          icon={<Check size={14} />}
          jp="完成"
          active={step === "done"}
          done={false}
        />
      </div>

      <div className="text-center">
        <p className="text-sm tracking-wider text-washi-50/90">
          {t(`stages.lantern.${step}.hint`)}
        </p>
        <p className="mt-1 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/45">
          {t(`stages.lantern.${step}.en`)}
        </p>
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={clsx(
          "h-[min(76vh,38rem)] w-[min(90vw,30rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60",
          step === "light" && "cursor-pointer",
          step === "draw" && "cursor-crosshair",
          step === "done" && "cursor-default",
        )}
        style={{ background: "#070410" }}
      />

      {step !== "done" && (
        <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
          <div
            className="h-full bg-amber-300 transition-[width] duration-150"
            style={{
              width: `${
                (step === "light" ? lightProgress : drawProgress) * 100
              }%`,
            }}
          />
        </div>
      )}

      {step === "light" && (
        <p className="text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/55">
          {lights} / {LIGHT_TARGET}
        </p>
      )}

      {step === "draw" && (
        <button
          type="button"
          onClick={finishDrawing}
          disabled={!drawDone}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check size={12} />{" "}
          <span className="font-jp">提灯を完成させる</span>
        </button>
      )}

      {step === "done" && (
        <button
          type="button"
          onClick={complete}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100"
        >
          <Check size={12} /> {t("common.complete")}
        </button>
      )}
    </div>
  );
}

function StepPill({
  icon,
  jp,
  active,
  done,
}: {
  icon: React.ReactNode;
  jp: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center gap-1.5 transition",
        active
          ? "text-washi-50"
          : done
            ? "text-washi-50/55"
            : "text-washi-50/25",
      )}
    >
      {icon}
      <span className="font-jp text-[0.6rem] tracking-wider whitespace-nowrap">
        {jp}
      </span>
    </div>
  );
}
