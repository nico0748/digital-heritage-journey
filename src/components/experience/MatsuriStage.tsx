"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Hand } from "lucide-react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export function MatsuriStage({
  onComplete,
  palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const [beats, setBeats] = useState(0);
  const [pulsing, setPulsing] = useState(false);
  const [c1, c2, c3] = palette;
  const target = 8;

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
    const loop = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.fillStyle = "rgba(10,6,4,0.15)";
      ctx.fillRect(0, 0, w, h);

      particles.current = particles.current.filter((p) => p.life < p.maxLife);
      for (const p of particles.current) {
        p.vy += 0.06;
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.fillStyle = p.color.replace("ALPHA", alpha.toFixed(3));
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const explode = (x: number, y: number) => {
    const colors = [c3, c2, "#F9D976", "#F5EFE6"];
    for (let i = 0; i < 80; i++) {
      const angle = (Math.PI * 2 * i) / 80 + Math.random() * 0.1;
      const speed = 2 + Math.random() * 4;
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 0,
        maxLife: 60 + Math.random() * 40,
        color: colors[i % colors.length].startsWith("#")
          ? `rgba(${hexToRgb(colors[i % colors.length])}, ALPHA)`
          : `rgba(255,255,255, ALPHA)`,
      });
    }
  };

  const onBeat = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    explode(Math.random() * w * 0.8 + w * 0.1, Math.random() * h * 0.4 + h * 0.1);
    setBeats((b) => Math.min(b + 1, target));
    setPulsing(true);
    setTimeout(() => setPulsing(false), 180);
  };

  const complete = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onComplete(canvas.toDataURL("image/png"));
  };

  return (
    <div className="flex w-full flex-col items-center gap-6 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Hand size={14} /> Tap the drum
      </p>

      <div
        className="relative h-[min(60vh,32rem)] w-[min(90vw,36rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/40"
        style={{ background: c1 }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        <button
          type="button"
          onClick={onBeat}
          aria-label="Beat the drum"
          className="absolute left-1/2 top-[62%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-2xl shadow-black/60 transition active:scale-95"
          style={{
            background: `radial-gradient(circle at 35% 35%, ${c3} 0%, ${c2} 55%, ${c1} 100%)`,
            transform: `translate(-50%, -50%) scale(${pulsing ? 1.08 : 1})`,
            transition: "transform 120ms ease-out",
          }}
        >
          <span className="absolute inset-6 rounded-full border border-washi-50/20" />
          <span className="absolute inset-0 grid place-items-center font-jp text-4xl text-washi-50">
            鼓
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {Array.from({ length: target }).map((_, i) => (
          <span
            key={i}
            className="h-1 w-6 rounded-full bg-washi-50/20"
            style={{ background: i < beats ? c3 : undefined }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={complete}
        disabled={beats < target}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        <Check size={12} /> Complete
      </button>
    </div>
  );
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  return `${(bigint >> 16) & 255},${(bigint >> 8) & 255},${bigint & 255}`;
}
