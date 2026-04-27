"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Droplets, Hand, Sun } from "lucide-react";
import clsx from "clsx";

type Step = 0 | 1 | 2 | 3;

const steps: { icon: typeof Droplets; label: string }[] = [
  { icon: Droplets, label: "Soak" },
  { icon: Hand, label: "Scoop" },
  { icon: Sun, label: "Dry" },
  { icon: Check, label: "Done" },
];

export function WashiCanvas({
  onComplete,
  palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState<Step>(0);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [c1, c2, c3] = palette;
  const size = 480;

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, progress]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background layer changes with step
    if (step === 0) {
      // Water vat
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, c2);
      g.addColorStop(1, c1);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Ripples
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      const t = Date.now() / 500;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(
          w / 2,
          h / 2,
          60 + i * 30 + Math.sin(t + i) * 6,
          20 + i * 10,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    } else if (step === 1) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Accumulating pulp sheet
      const fill = Math.min(progress, 1);
      ctx.fillStyle = `rgba(251, 247, 240, ${0.1 + fill * 0.85})`;
      const pad = 40;
      ctx.fillRect(pad, pad + (1 - fill) * 160, w - pad * 2, (h - pad * 2) * fill);
    } else if (step === 2) {
      ctx.fillStyle = c3;
      ctx.fillRect(0, 0, w, h);
      // Dry sheet with fiber lines
      const pad = 40;
      ctx.fillStyle = "#FBF7F0";
      ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
      ctx.strokeStyle = "rgba(163, 146, 111, 0.35)";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.moveTo(pad + Math.random() * (w - pad * 2), pad);
        ctx.lineTo(pad + Math.random() * (w - pad * 2), h - pad);
        ctx.stroke();
      }
      // Sun ray overlay based on progress
      ctx.fillStyle = `rgba(255, 220, 140, ${progress * 0.25})`;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = "#FBF7F0";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(163, 146, 111, 0.3)";
      for (let i = 0; i < 60; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * w, Math.random() * h);
        ctx.lineTo(Math.random() * w, Math.random() * h);
        ctx.stroke();
      }
    }
  };

  // Animate ripples on step 0
  useEffect(() => {
    if (step !== 0) return;
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Step 2 auto-progress (drying)
  useEffect(() => {
    if (step !== 2) return;
    progressRef.current = 0;
    setProgress(0);
    const id = setInterval(() => {
      progressRef.current = Math.min(progressRef.current + 0.02, 1);
      setProgress(progressRef.current);
      if (progressRef.current >= 1) {
        clearInterval(id);
        setStep(3);
      }
    }, 60);
    return () => clearInterval(id);
  }, [step]);

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (step === 0 || step === 1) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (lastPt.current) {
        const dx = x - lastPt.current.x;
        const dy = y - lastPt.current.y;
        const d = Math.hypot(dx, dy);
        progressRef.current = Math.min(progressRef.current + d * 0.0015, 1);
        setProgress(progressRef.current);
        if (progressRef.current >= 1) {
          lastPt.current = null;
          progressRef.current = 0;
          setProgress(0);
          setStep((s) => (s + 1) as Step);
          return;
        }
      }
      lastPt.current = { x, y };
    }
  };

  const onPointerLeave = () => {
    lastPt.current = null;
  };

  const complete = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onComplete(canvas.toDataURL("image/png"));
  };

  return (
    <div className="flex w-full flex-col items-center gap-6 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Hand size={14} />{" "}
        {step === 0
          ? "Move across the water"
          : step === 1
            ? "Scoop the fibers"
            : step === 2
              ? "Drying…"
              : "Complete"}
      </p>

      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className="aspect-square w-[min(90vw,28rem)] cursor-pointer touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/40"
      />

      {/* Step indicator */}
      <div className="flex items-center gap-4">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <div
              key={i}
              className={clsx(
                "flex flex-col items-center gap-1 text-[0.6rem] uppercase tracking-[0.3em]",
                active ? "text-washi-50" : done ? "text-washi-50/60" : "text-washi-50/30",
              )}
            >
              <Icon size={14} />
              {s.label}
            </div>
          );
        })}
      </div>

      {/* Progress bar for interactive steps */}
      {(step === 0 || step === 1 || step === 2) && (
        <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
          <div
            className="h-full bg-washi-50 transition-[width] duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {step === 3 && (
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
