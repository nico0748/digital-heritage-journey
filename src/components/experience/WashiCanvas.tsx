"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Droplets, Hammer, Hand, Sun, Wind } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "@/lib/i18n";

type StepId = "stir" | "beat" | "scoop" | "press" | "dry" | "done";

const STEPS: {
  id: StepId;
  jp: string;
  en: string;
  hint: string;
  icon: typeof Droplets;
}[] = [
  {
    id: "stir",
    jp: "繊維をほぐす",
    en: "Loosen the fibers",
    hint: "水の中で円を描いて、楮(こうぞ)の繊維をほぐす",
    icon: Droplets,
  },
  {
    id: "beat",
    jp: "叩く",
    en: "Beat the bundle",
    hint: "杵で叩いて繊維をほぐす",
    icon: Hammer,
  },
  {
    id: "scoop",
    jp: "紙を漉く",
    en: "Sukikiri",
    hint: "簀桁(すげた)を左右に揺らして繊維を重ねる",
    icon: Hand,
  },
  {
    id: "press",
    jp: "水気を絞る",
    en: "Press out the water",
    hint: "押さえつけて水分を抜く(長押し)",
    icon: Wind,
  },
  {
    id: "dry",
    jp: "板で干す",
    en: "Dry on the board",
    hint: "陽の光で乾かす",
    icon: Sun,
  },
  {
    id: "done",
    jp: "完成",
    en: "Complete",
    hint: "和紙が完成しました",
    icon: Check,
  },
];

const STIR_TARGET = 1; // 0..1 progress
const BEAT_TARGET = 12; // taps required
const SCOOP_TARGET_SWEEPS = 8; // half-sweeps; 4 full back-and-forths
const PRESS_TARGET_MS = 2400;
const SIZE = 640;

export function WashiCanvas({
  onComplete,
  palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const t = useTranslations();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const [, , c3] = palette;

  // Single tracked timer for "advance to next step after a short pause"
  // — every step transition runs through `scheduleAdvance` so we can
  // cancel it on unmount and avoid the stale-closure trap of capturing
  // `stepIdx` from a setTimeout callback.
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAdvance = useCallback((delayMs: number) => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => {
      setStepIdx((i) => i + 1);
      advanceTimerRef.current = null;
    }, delayMs);
  }, []);
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // Stir
  const stirRef = useRef(0);
  const [stirProgress, setStirProgress] = useState(0);
  const lastStirPt = useRef<{ x: number; y: number } | null>(null);

  // Beat
  const [beatCount, setBeatCount] = useState(0);
  const beatPulses = useRef<{ x: number; y: number; t: number }[]>([]);

  // Scoop
  const [sweeps, setSweeps] = useState(0);
  const lastScoopX = useRef<number | null>(null);
  const sweepDir = useRef<"left" | "right" | null>(null);
  const sweepDist = useRef(0);

  // Press
  const pressRef = useRef(0);
  const [pressProgress, setPressProgress] = useState(0);
  const isPressingRef = useRef(false);
  const dropsRef = useRef<{ x: number; y: number; v: number; life: number }[]>(
    [],
  );

  // Dry
  const dryRef = useRef(0);
  const [dryProgress, setDryProgress] = useState(0);

  // Texture data — generated once, reused on every redraw so the paper
  // grain doesn't flicker.
  const clumps = useMemo(() => {
    let s = 7;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 12 }, () => ({
      x: rng() * SIZE,
      y: rng() * SIZE,
      r: 18 + rng() * 24,
    }));
  }, []);

  const totalProgress =
    step.id === "stir"
      ? stirProgress / STIR_TARGET
      : step.id === "beat"
        ? beatCount / BEAT_TARGET
        : step.id === "scoop"
          ? sweeps / SCOOP_TARGET_SWEEPS
          : step.id === "press"
            ? pressProgress
            : step.id === "dry"
              ? dryProgress
              : 1;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (step.id === "stir") drawStir(ctx, w, h);
    else if (step.id === "beat") drawBeat(ctx, w, h);
    else if (step.id === "scoop") drawScoop(ctx, w, h);
    else if (step.id === "press") drawPress(ctx, w, h);
    else if (step.id === "dry") drawDry(ctx, w, h);
    else drawDone(ctx, w, h);
  }, [step.id, stirProgress, beatCount, sweeps, pressProgress, dryProgress]);

  // ─────────────────────────────────────────────────────────────────
  // Step 1 — stir
  // ─────────────────────────────────────────────────────────────────
  function drawStir(ctx: CanvasRenderingContext2D, w: number, h: number) {
    drawWoodenBackground(ctx, w, h);
    const pad = 28;
    const grad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      40,
      w / 2,
      h / 2,
      w * 0.7,
    );
    grad.addColorStop(0, "#5b7a8f");
    grad.addColorStop(1, "#1f2e3a");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, 8);
    ctx.fill();

    // Water shimmer
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    const t = Date.now() / 700;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(
        w / 2,
        h / 2,
        80 + i * 28 + Math.sin(t + i * 0.6) * 4,
        24 + i * 8,
        Math.sin(t * 0.3) * 0.1,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    const dispersion = 1 - stirProgress;
    for (const c of clumps) {
      const r = c.r * (0.55 + dispersion * 0.45);
      const alpha = 0.55 * dispersion + 0.18 * stirProgress;
      ctx.fillStyle = `rgba(245, 240, 225, ${alpha})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (stirProgress > 0.3) {
      ctx.fillStyle = `rgba(245, 240, 225, ${(stirProgress - 0.3) * 0.25})`;
      ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 2 — beat
  // ─────────────────────────────────────────────────────────────────
  function drawBeat(ctx: CanvasRenderingContext2D, w: number, h: number) {
    drawWoodenBackground(ctx, w, h);
    // Stone basin
    const pad = 50;
    const grad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      30,
      w / 2,
      h / 2,
      w / 2,
    );
    grad.addColorStop(0, "#3e3a35");
    grad.addColorStop(1, "#1a1612");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - pad, h / 2 - pad, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pulp pile in basin — gets flatter as we beat
    const flatness = beatCount / BEAT_TARGET;
    ctx.fillStyle = "#e9e1c9";
    ctx.beginPath();
    ctx.ellipse(
      w / 2,
      h / 2,
      (w / 2 - pad) * (0.45 + flatness * 0.45),
      (h / 2 - pad) * (0.32 - flatness * 0.18),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // Active beat pulses
    const now = Date.now();
    beatPulses.current = beatPulses.current.filter((p) => now - p.t < 600);
    for (const p of beatPulses.current) {
      const age = (now - p.t) / 600;
      ctx.strokeStyle = `rgba(255, 240, 200, ${(1 - age) * 0.7})`;
      ctx.lineWidth = 3 - age * 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18 + age * 70, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 3 — scoop (bamboo screen)
  // ─────────────────────────────────────────────────────────────────
  function drawScoop(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = "#3a2a1c";
    ctx.fillRect(0, 0, w, h);
    const innerPad = 36;
    ctx.fillStyle = "#4a3422";
    ctx.fillRect(innerPad, innerPad, w - innerPad * 2, h - innerPad * 2);
    ctx.strokeStyle = "rgba(110, 78, 44, 0.65)";
    ctx.lineWidth = 1;
    const stripCount = 60;
    for (let i = 1; i < stripCount; i++) {
      const y = innerPad + ((h - innerPad * 2) / stripCount) * i;
      ctx.beginPath();
      ctx.moveTo(innerPad, y);
      ctx.lineTo(w - innerPad, y);
      ctx.stroke();
    }

    const fiberDensity = sweeps / SCOOP_TARGET_SWEEPS;
    ctx.fillStyle = `rgba(95, 120, 138, ${0.4 - fiberDensity * 0.3})`;
    ctx.fillRect(innerPad, innerPad, w - innerPad * 2, h - innerPad * 2);

    const layerAlpha = 0.12;
    ctx.fillStyle = `rgba(248, 244, 230, ${layerAlpha})`;
    for (let i = 0; i < sweeps; i++) {
      const offset = (i % 2 === 0 ? 1 : -1) * (i * 0.6);
      ctx.fillRect(
        innerPad + 4 + offset,
        innerPad + 6,
        w - innerPad * 2 - 8,
        h - innerPad * 2 - 12,
      );
    }
    ctx.strokeStyle = "rgba(255, 220, 170, 0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(innerPad, innerPad, w - innerPad * 2, h - innerPad * 2);
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 4 — press (squeeze water out)
  // ─────────────────────────────────────────────────────────────────
  function drawPress(ctx: CanvasRenderingContext2D, w: number, h: number) {
    drawWoodenBackground(ctx, w, h);
    // Stack of wet sheets compressing
    const compress = pressProgress;
    const pad = 70;
    // Top board (descending as press progresses)
    const boardH = 24;
    const boardY = pad - 14 + compress * 22;
    ctx.fillStyle = "#3e2a1a";
    ctx.fillRect(pad - 10, boardY, w - (pad - 10) * 2, boardH);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad - 10, boardY, w - (pad - 10) * 2, boardH);

    // Paper stack between
    const stackTop = boardY + boardH;
    const stackH = h - stackTop - pad - 10 - boardH;
    ctx.fillStyle = "#f4ecd8";
    ctx.fillRect(pad, stackTop, w - pad * 2, stackH);
    // Layer separators showing it's a stack
    ctx.strokeStyle = "rgba(170, 145, 110, 0.4)";
    ctx.lineWidth = 0.8;
    for (let i = 1; i < 5; i++) {
      const y = stackTop + (stackH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }

    // Bottom board
    const bbY = stackTop + stackH;
    ctx.fillStyle = "#3e2a1a";
    ctx.fillRect(pad - 10, bbY, w - (pad - 10) * 2, boardH);

    // Water drops falling from sides
    const now = Date.now();
    if (isPressingRef.current && Math.random() < 0.4) {
      dropsRef.current.push({
        x:
          Math.random() < 0.5
            ? pad - 6 + Math.random() * 8
            : w - pad - 2 + Math.random() * 8,
        y: stackTop + 4 + Math.random() * stackH,
        v: 0.5 + Math.random() * 1.2,
        life: now,
      });
    }
    dropsRef.current = dropsRef.current.filter(
      (d) => d.y < h - pad - boardH && now - d.life < 1500,
    );
    for (const d of dropsRef.current) {
      d.y += d.v;
      d.v += 0.05;
      ctx.fillStyle = "rgba(140,180,210,0.7)";
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 1.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 5 — dry
  // ─────────────────────────────────────────────────────────────────
  function drawDry(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = c3;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(60, 40, 24, 0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (i / 12) * h);
      ctx.lineTo(w, (i / 12) * h + Math.sin(i) * 6);
      ctx.stroke();
    }

    const pad = 50;
    const opacity = 0.45 + dryProgress * 0.55;
    ctx.fillStyle = `rgba(251, 247, 236, ${opacity})`;
    drawDeckleEdge(ctx, pad, pad, w - pad * 2, h - pad * 2);
    ctx.fill();

    const ray = ctx.createLinearGradient(0, 0, w, 0);
    ray.addColorStop(0, `rgba(255, 220, 140, ${dryProgress * 0.18})`);
    ray.addColorStop(1, `rgba(255, 220, 140, 0)`);
    ctx.fillStyle = ray;
    ctx.fillRect(0, 0, w, h);
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 6 — done (clean, minimal — let the paper speak)
  // ─────────────────────────────────────────────────────────────────
  function drawDone(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Dark backdrop so the paper lifts off the page.
    const bgGrad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      60,
      w / 2,
      h / 2,
      w * 0.7,
    );
    bgGrad.addColorStop(0, "#1c130b");
    bgGrad.addColorStop(1, "#070403");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const pad = 36;

    // Drop shadow under the paper for depth.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = "#f7eed8";
    drawDeckleEdge(ctx, pad, pad, w - pad * 2, h - pad * 2);
    ctx.fill();
    ctx.restore();

    // Clip everything else inside the paper.
    ctx.save();
    drawDeckleEdge(ctx, pad, pad, w - pad * 2, h - pad * 2);
    ctx.clip();

    // Soft warm gradient — light from the upper-left, deepening to the
    // lower-right. Adds depth without busy ornament.
    const warm = ctx.createLinearGradient(pad, pad, w - pad, h - pad);
    warm.addColorStop(0, "rgba(255, 248, 226, 0.65)");
    warm.addColorStop(1, "rgba(170, 140, 100, 0.22)");
    ctx.fillStyle = warm;
    ctx.fillRect(pad - 4, pad - 4, w - (pad - 4) * 2, h - (pad - 4) * 2);

    ctx.restore();

    // Vignette for added depth (subtle, just at the edges).
    ctx.save();
    drawDeckleEdge(ctx, pad, pad, w - pad * 2, h - pad * 2);
    ctx.clip();
    const vig = ctx.createRadialGradient(
      w / 2,
      h / 2,
      w * 0.28,
      w / 2,
      h / 2,
      w * 0.55,
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(45, 30, 15, 0.22)");
    ctx.fillStyle = vig;
    ctx.fillRect(pad - 4, pad - 4, w - (pad - 4) * 2, h - (pad - 4) * 2);
    ctx.restore();
  }

  function drawWoodenBackground(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ) {
    ctx.fillStyle = "#3a2a1c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(20,12,6,0.4)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (i / 18) * h + Math.sin(i) * 4);
      ctx.lineTo(w, (i / 18) * h + Math.cos(i) * 4);
      ctx.stroke();
    }
  }

  function drawDeckleEdge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const wob = 4;
    let s = 21;
    const rng = () => {
      s = (s * 9301 + 49297) % 233280;
      return (s / 233280 - 0.5) * 2;
    };
    ctx.beginPath();
    const segs = 24;
    ctx.moveTo(x, y);
    for (let i = 1; i <= segs; i++)
      ctx.lineTo(x + (w * i) / segs, y + rng() * wob);
    for (let i = 1; i <= segs; i++)
      ctx.lineTo(x + w + rng() * wob, y + (h * i) / segs);
    for (let i = 1; i <= segs; i++)
      ctx.lineTo(x + w - (w * i) / segs, y + h + rng() * wob);
    for (let i = 1; i <= segs; i++)
      ctx.lineTo(x + rng() * wob, y + h - (h * i) / segs);
    ctx.closePath();
  }

  // ─────────────────────────────────────────────────────────────────
  // Animation loop
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  // Auto-progress: dry
  useEffect(() => {
    if (step.id !== "dry") return;
    dryRef.current = 0;
    setDryProgress(0);
    const id = setInterval(() => {
      dryRef.current = Math.min(dryRef.current + 0.018, 1);
      setDryProgress(dryRef.current);
      if (dryRef.current >= 1) {
        clearInterval(id);
        scheduleAdvance(400);
      }
    }, 60);
    return () => clearInterval(id);
  }, [step.id]);

  // Press: hold-to-progress
  useEffect(() => {
    if (step.id !== "press") return;
    pressRef.current = 0;
    setPressProgress(0);
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (isPressingRef.current) {
        pressRef.current = Math.min(
          1,
          pressRef.current + dt / PRESS_TARGET_MS,
        );
        setPressProgress(pressRef.current);
        if (pressRef.current >= 1) {
          isPressingRef.current = false;
          scheduleAdvance(400);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step.id]);

  // ─────────────────────────────────────────────────────────────────
  // Pointer interactions
  // ─────────────────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (step.id === "beat") {
      const { x, y } = canvasPoint(e);
      if (beatCount >= BEAT_TARGET) return;
      beatPulses.current.push({ x, y, t: Date.now() });
      setBeatCount((n) => {
        const next = Math.min(n + 1, BEAT_TARGET);
        if (next >= BEAT_TARGET) {
          scheduleAdvance(500);
        }
        return next;
      });
    } else if (step.id === "press") {
      isPressingRef.current = true;
    }
  }

  function onPointerUp() {
    if (step.id === "press") isPressingRef.current = false;
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    const { x, y } = canvasPoint(e);

    if (step.id === "stir") {
      const last = lastStirPt.current;
      if (last) {
        const d = Math.hypot(x - last.x, y - last.y);
        stirRef.current = Math.min(1, stirRef.current + d * 0.0014);
        setStirProgress(stirRef.current);
        if (stirRef.current >= 1) {
          lastStirPt.current = null;
          scheduleAdvance(400);
          return;
        }
      }
      lastStirPt.current = { x, y };
    } else if (step.id === "scoop") {
      const lastX = lastScoopX.current;
      if (lastX !== null) {
        const dx = x - lastX;
        if (Math.abs(dx) > 1) {
          const dir: "left" | "right" = dx > 0 ? "right" : "left";
          if (sweepDir.current === null) {
            sweepDir.current = dir;
            sweepDist.current = 0;
          } else if (dir !== sweepDir.current) {
            if (sweepDist.current > 80) {
              setSweeps((n) => {
                const next = n + 1;
                if (next >= SCOOP_TARGET_SWEEPS) {
                  scheduleAdvance(400);
                }
                return Math.min(next, SCOOP_TARGET_SWEEPS);
              });
            }
            sweepDir.current = dir;
            sweepDist.current = 0;
          } else {
            sweepDist.current += Math.abs(dx);
          }
        }
      }
      lastScoopX.current = x;
    }
  }

  function onPointerLeave() {
    lastStirPt.current = null;
    lastScoopX.current = null;
    sweepDir.current = null;
    sweepDist.current = 0;
    isPressingRef.current = false;
  }

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
    };
  }

  function complete() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onComplete(canvas.toDataURL("image/png"));
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      {/* Step pills */}
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

      {/* Step hint */}
      <div className="text-center">
        <p className="text-sm tracking-wider text-washi-50/90">
          {t(`stages.washi.${step.id}.hint`)}
        </p>
        <p className="mt-1 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/45">
          {t(`stages.washi.${step.id}.en`)}
        </p>
      </div>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        className="aspect-square w-[min(94vw,38rem)] cursor-pointer touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/50"
      />

      {step.id !== "done" && (
        <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
          <div
            className="h-full bg-washi-50 transition-[width] duration-150"
            style={{ width: `${totalProgress * 100}%` }}
          />
        </div>
      )}

      {step.id === "beat" && (
        <p className="text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/55">
          {beatCount} / {BEAT_TARGET}
        </p>
      )}

      {step.id === "done" && (
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

