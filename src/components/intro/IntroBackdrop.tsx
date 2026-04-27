"use client";

import { useEffect, useRef } from "react";

interface Blot {
  x: number;
  y: number;
  r: number;
  delay: number;
  drift: number;
}

export function IntroBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const blots: Blot[] = Array.from({ length: 14 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      r: 40 + Math.random() * 160,
      delay: Math.random() * 4,
      drift: 0.0008 + Math.random() * 0.0014,
    }));

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    let start = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);

      for (const b of blots) {
        const phase = t + b.delay;
        const pulse = 0.35 + 0.25 * Math.sin(phase * 0.6);
        const x = (b.x + Math.sin(phase * b.drift * 30) * 0.02) * width;
        const y = (b.y + Math.cos(phase * b.drift * 30) * 0.02) * height;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, b.r);
        grad.addColorStop(0, `rgba(26, 22, 19, ${0.22 * pulse})`);
        grad.addColorStop(0.5, `rgba(26, 22, 19, ${0.08 * pulse})`);
        grad.addColorStop(1, "rgba(26, 22, 19, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full opacity-70"
      aria-hidden
    />
  );
}
