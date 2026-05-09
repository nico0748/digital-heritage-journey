"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";

type Pattern = "peony" | "chrysanthemum" | "willow" | "senrin";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  trail: boolean;
  size: number;
  isFlash?: boolean;
}

interface Rocket {
  x: number;
  yNorm: number; // 0..1 (1 at bottom of canvas, decreases as it rises)
  vyNorm: number;
  targetYNorm: number;
  hue: number;
  pattern: Pattern;
  charge: number;
}

interface Star {
  x: number; // 0..1
  y: number; // 0..1 (upper portion only)
  size: number;
  phase: number;
}

interface SkylineSeg {
  x0: number;
  x1: number;
  h: number;
  isTower: boolean;
}

const TARGET_BURSTS = 5;
const MAX_CHARGE_MS = 1200;
// Edo-fireworks-friendly hues. 朱(red)・金(gold)・藍(indigo)・紅(crimson)・紫(purple)・緑(green).
const HUES = [16, 48, 205, 340, 285, 100];
const PATTERN_NAMES: Record<Pattern, string> = {
  peony: "牡丹",
  chrysanthemum: "菊",
  willow: "柳",
  senrin: "千輪",
};

export function HanabiStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const rockets = useRef<Rocket[]>([]);
  const chargeRef = useRef<{ x: number; start: number } | null>(null);

  const [bursts, setBursts] = useState(0);
  const burstsRef = useRef(0);
  const [chargeProgress, setChargeProgress] = useState(0);
  const [latestPattern, setLatestPattern] = useState<Pattern | null>(null);
  const finalizingRef = useRef(false);
  const mountedRef = useRef(true);
  // Tracks every setTimeout used by the finale so we can cancel them if
  // the user navigates away mid-bloom — otherwise the deferred
  // `onComplete` callback would fire against an unmounted component and
  // trigger navigation/state updates after teardown.
  const finaleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      for (const id of finaleTimersRef.current) clearTimeout(id);
      finaleTimersRef.current = [];
    };
  }, []);

  // Background — deterministic, generated once.
  const stars = useMemo<Star[]>(() => {
    let s = 17;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 90 }, () => ({
      x: rng(),
      y: rng() * 0.55, // stars only in upper sky
      size: 0.4 + rng() * 1.6,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const skyline = useMemo<SkylineSeg[]>(() => {
    let s = 33;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const segs: SkylineSeg[] = [];
    let x = -0.02;
    while (x < 1.05) {
      const w = 0.04 + rng() * 0.07;
      const h = 0.04 + rng() * 0.08;
      const isTower = rng() < 0.12;
      segs.push({
        x0: x,
        x1: x + w,
        h: isTower ? h * 1.9 : h,
        isTower,
      });
      x += w;
    }
    return segs;
  }, []);

  // Single, stable animation loop. Reads everything via refs so it
  // doesn't restart when React state changes.
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
    const loop = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const tSec = (performance.now() - start) / 1000;

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#070b1d");
      sky.addColorStop(0.7, "#0e1535");
      sky.addColorStop(1, "#1a2245");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Motion-blur veil — softens trails, builds up the bloom afterglow.
      ctx.fillStyle = "rgba(7,11,29,0.18)";
      ctx.fillRect(0, 0, w, h);

      // Stars
      for (const star of stars) {
        const alpha = 0.4 + Math.sin(tSec * 1.5 + star.phase) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Skyline silhouette
      const baseline = h * 0.92;
      ctx.fillStyle = "#02050d";
      ctx.beginPath();
      ctx.moveTo(0, baseline);
      for (const seg of skyline) {
        const sx0 = seg.x0 * w;
        const sx1 = seg.x1 * w;
        const sy = baseline - seg.h * h;
        ctx.lineTo(sx0, baseline);
        ctx.lineTo(sx0, sy);
        if (seg.isTower) {
          // Pagoda eaves silhouette
          const cx = (sx0 + sx1) / 2;
          ctx.lineTo(sx0 - 4, sy);
          ctx.lineTo(cx, sy - 10);
          ctx.lineTo(sx1 + 4, sy);
        } else {
          // Sloped roof
          ctx.lineTo((sx0 + sx1) / 2, sy - 4);
        }
        ctx.lineTo(sx1, sy);
        ctx.lineTo(sx1, baseline);
      }
      ctx.lineTo(w, baseline);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      // Water reflection band
      const waterTop = baseline + 4;
      const waterGrad = ctx.createLinearGradient(0, waterTop, 0, h);
      waterGrad.addColorStop(0, "rgba(20,30,80,0.6)");
      waterGrad.addColorStop(1, "rgba(5,8,20,0.2)");
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, waterTop, w, h - waterTop);
      ctx.strokeStyle = "rgba(120,160,220,0.08)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const yy = waterTop + 8 + i * 10 + Math.sin(tSec * 1.2 + i) * 2;
        ctx.moveTo(0, yy);
        ctx.lineTo(w, yy);
        ctx.stroke();
      }

      // Charge indicator (glow at the bottom under the cursor)
      const charging = chargeRef.current;
      if (charging) {
        const cx = charging.x;
        const cy = baseline - 6;
        const charge = Math.min(
          1,
          (performance.now() - charging.start) / MAX_CHARGE_MS,
        );
        const pulseR = 8 + charge * 22;
        const pulseGrad = ctx.createRadialGradient(
          cx,
          cy,
          0,
          cx,
          cy,
          pulseR * 2.4,
        );
        pulseGrad.addColorStop(0, `hsla(50, 100%, 75%, ${0.55 + charge * 0.35})`);
        pulseGrad.addColorStop(1, "hsla(50, 100%, 75%, 0)");
        ctx.fillStyle = pulseGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, pulseR * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "hsla(50, 100%, 78%, 0.95)";
        ctx.beginPath();
        ctx.arc(cx, cy, 3 + charge * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rockets
      for (const r of rockets.current) {
        r.yNorm += r.vyNorm;
        r.vyNorm *= 0.998;
        const ry = r.yNorm * h;
        // Trail sparks
        if (Math.random() < 0.7) {
          particles.current.push({
            x: r.x + (Math.random() - 0.5) * 4,
            y: ry + (Math.random() - 0.5) * 2,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 0.4 + Math.random() * 0.4,
            life: 0,
            maxLife: 16 + Math.random() * 10,
            hue: r.hue,
            trail: false,
            size: 1.1,
          });
        }
        // Rocket head
        ctx.fillStyle = "rgba(255, 240, 180, 0.95)";
        ctx.beginPath();
        ctx.arc(r.x, ry, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "rgba(255, 230, 150, 0.9)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(r.x, ry, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (r.yNorm <= r.targetYNorm) {
          spawnBurst(r.x, ry, r.charge, r.hue, r.pattern, w, h);
          r.yNorm = -1;
          if (!finalizingRef.current) {
            burstsRef.current = Math.min(TARGET_BURSTS, burstsRef.current + 1);
            setBursts(burstsRef.current);
            setLatestPattern(r.pattern);
          }
        }
      }
      rockets.current = rockets.current.filter((r) => r.yNorm >= 0);

      // Particles physics + trails
      for (const p of particles.current) {
        p.life += 1;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04;
        p.vx *= 0.992;
        p.vy *= 0.992;
        if (p.trail && p.life % 2 === 0 && p.life < p.maxLife * 0.7) {
          particles.current.push({
            x: p.x,
            y: p.y,
            vx: 0,
            vy: 0.3 + Math.random() * 0.3,
            life: 0,
            maxLife: 10 + Math.random() * 8,
            hue: p.hue,
            trail: false,
            size: p.size * 0.55,
          });
        }
      }
      particles.current = particles.current.filter((p) => p.life < p.maxLife);

      for (const p of particles.current) {
        const a = 1 - p.life / p.maxLife;
        if (p.isFlash) {
          const grd = ctx.createRadialGradient(
            p.x,
            p.y,
            0,
            p.x,
            p.y,
            p.size,
          );
          grd.addColorStop(0, `hsla(${p.hue}, 100%, 80%, ${a * 0.9})`);
          grd.addColorStop(0.5, `hsla(${p.hue}, 100%, 65%, ${a * 0.4})`);
          grd.addColorStop(1, `hsla(${p.hue}, 100%, 60%, 0)`);
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Update charge progress for the React-driven UI bar.
      if (charging) {
        const c = Math.min(
          1,
          (performance.now() - charging.start) / MAX_CHARGE_MS,
        );
        if (Math.abs(c - chargeProgressRef.current) > 0.02) {
          chargeProgressRef.current = c;
          setChargeProgress(c);
        }
      } else if (chargeProgressRef.current > 0) {
        chargeProgressRef.current = 0;
        setChargeProgress(0);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [stars, skyline]);

  // Local ref for charge progress so the loop can avoid setState spam.
  const chargeProgressRef = useRef(0);

  function spawnBurst(
    x: number,
    y: number,
    charge: number,
    hue: number,
    pattern: Pattern,
    _w: number,
    _h: number,
  ) {
    // Central glow flash
    particles.current.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 22,
      hue,
      trail: false,
      size: 70 + charge * 70,
      isFlash: true,
    });

    if (pattern === "senrin") {
      // 千輪 — many small simultaneous mini-bursts.
      const cores = 5 + Math.floor(charge * 4);
      for (let m = 0; m < cores; m++) {
        const ox = (Math.random() - 0.5) * 90;
        const oy = (Math.random() - 0.5) * 60;
        for (let i = 0; i < 14; i++) {
          const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.1;
          const speed = 0.7 + Math.random() * 0.6;
          particles.current.push({
            x: x + ox,
            y: y + oy,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            life: 0,
            maxLife: 38 + Math.random() * 20,
            hue: hue + (Math.random() - 0.5) * 30,
            trail: false,
            size: 1.4,
          });
        }
      }
      return;
    }

    const count = 60 + Math.floor(charge * 100);
    const baseSpeed = 1.6 + charge * 2.6;
    const trailing = pattern === "chrysanthemum" || pattern === "willow";

    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.05;
      const v =
        pattern === "willow"
          ? baseSpeed * (0.4 + Math.random() * 0.3)
          : baseSpeed * (0.85 + Math.random() * 0.3);
      const lifeFactor = pattern === "willow" ? 1.5 : 1;
      particles.current.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (pattern === "willow" ? 0 : 0.3),
        life: 0,
        maxLife: (50 + Math.random() * 25) * lifeFactor,
        hue: hue + (Math.random() - 0.5) * 30,
        trail: trailing,
        size: 1.6,
      });
    }
  }

  function spawnRocket(canvasX: number, charge: number) {
    const hue = HUES[Math.floor(Math.random() * HUES.length)];
    const patterns: Pattern[] = [
      "peony",
      "chrysanthemum",
      "willow",
      "senrin",
    ];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    rockets.current.push({
      x: canvasX,
      yNorm: 1,
      vyNorm: -(0.011 + charge * 0.006),
      targetYNorm: 0.5 - charge * 0.22,
      hue,
      pattern,
      charge,
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (burstsRef.current >= TARGET_BURSTS) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    chargeRef.current = { x, start: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!chargeRef.current) return;
    const charge = Math.min(
      1,
      (performance.now() - chargeRef.current.start) / MAX_CHARGE_MS,
    );
    spawnRocket(chargeRef.current.x, charge);
    chargeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function onPointerCancel() {
    chargeRef.current = null;
  }

  function complete() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    finalizingRef.current = true;
    // Grand finale — three overlapping bursts. All deferred work is
    // tracked in finaleTimersRef so we can cancel it on unmount and
    // never call onComplete (which navigates) against a torn-down tree.
    spawnRocket(w * 0.22, 1);
    finaleTimersRef.current.push(
      setTimeout(() => {
        if (mountedRef.current) spawnRocket(w * 0.5, 1);
      }, 160),
    );
    finaleTimersRef.current.push(
      setTimeout(() => {
        if (mountedRef.current) spawnRocket(w * 0.78, 1);
      }, 320),
    );
    finaleTimersRef.current.push(
      setTimeout(() => {
        if (!mountedRef.current) return;
        const dataUrl = canvas.toDataURL("image/png");
        onComplete(dataUrl);
      }, 1700),
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Sparkles size={14} /> 押して溜める · 離して打ち上げる
      </p>

      <div
        className="relative h-[min(60vh,32rem)] w-[min(92vw,42rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60"
        style={{ background: "#070b1d" }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        />

        {/* Latest pattern badge — subtle indicator of the bloom kind */}
        {latestPattern && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/40 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/85 backdrop-blur">
            <span className="font-jp tracking-wider">
              {PATTERN_NAMES[latestPattern]}
            </span>
          </div>
        )}
      </div>

      {/* Charge bar */}
      <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300 transition-[width] duration-100"
          style={{ width: `${chargeProgress * 100}%` }}
        />
      </div>

      {/* Burst counter */}
      <div className="flex items-center gap-2">
        {Array.from({ length: TARGET_BURSTS }).map((_, i) => (
          <span
            key={i}
            className={`h-1 w-6 rounded-full transition-colors ${
              i < bursts ? "bg-amber-300" : "bg-washi-50/20"
            }`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={complete}
        disabled={bursts < TARGET_BURSTS}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        <Check size={12} /> Finale
      </button>
    </div>
  );
}
