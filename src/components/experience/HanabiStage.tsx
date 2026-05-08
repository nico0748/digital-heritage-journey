"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Palette,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";

type Pattern = "peony" | "chrysanthemum" | "willow" | "senrin";
type Step = "design" | "color" | "launch";

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
  yNorm: number;
  vyNorm: number;
  targetYNorm: number;
  hue: number;
  pattern: Pattern;
  charge: number;
}

interface Star {
  x: number;
  y: number;
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

const ALL_PATTERNS: Pattern[] = ["peony", "chrysanthemum", "willow", "senrin"];

// Each pattern is a kind of 割物 (warimono) — a category of shell construction.
const PATTERN_INFO: Record<
  Pattern,
  { jp: string; en: string; desc: string }
> = {
  peony: {
    jp: "牡丹",
    en: "Peony",
    desc: "中心から放射状に星が広がる、最も基本の型。",
  },
  chrysanthemum: {
    jp: "菊",
    en: "Chrysanthemum",
    desc: "尾を引きながら大輪に咲く、二重円の構造。",
  },
  willow: {
    jp: "柳",
    en: "Willow",
    desc: "重力に従って垂れ下がる、しだれ柳のような花火。",
  },
  senrin: {
    jp: "千輪",
    en: "Senrin",
    desc: "親玉が咲いた後、無数の小玉が一斉に開花する。",
  },
};

// 6 hand-picked hues from the traditional palette: 朱・金・緑・藍・紫・紅.
const HUE_PALETTE: { hue: number; name: string; en: string }[] = [
  { hue: 16, name: "朱", en: "shu" },
  { hue: 48, name: "金", en: "kin" },
  { hue: 100, name: "緑", en: "midori" },
  { hue: 205, name: "藍", en: "ai" },
  { hue: 285, name: "紫", en: "murasaki" },
  { hue: 340, name: "紅", en: "kurenai" },
];

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
  // ─────────────────────────────────────────────────────────────────
  // 3-step craft flow: design (pick pattern) → color (pick 3 hues)
  //                    → launch (charge & release with locked recipe)
  // ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("design");
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [hues, setHues] = useState<number[]>([]);

  if (step === "design") {
    return (
      <DesignStep
        onPick={(p) => {
          setPattern(p);
          setStep("color");
        }}
      />
    );
  }
  if (step === "color") {
    return (
      <ColorStep
        pattern={pattern!}
        selected={hues}
        onToggle={(h) =>
          setHues((prev) =>
            prev.includes(h)
              ? prev.filter((x) => x !== h)
              : prev.length < 3
                ? [...prev, h]
                : prev,
          )
        }
        onConfirm={() => setStep("launch")}
        onBack={() => {
          setHues([]);
          setStep("design");
        }}
      />
    );
  }
  return (
    <LaunchStep
      pattern={pattern!}
      hues={hues}
      onComplete={onComplete}
      onBack={() => setStep("color")}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 1 — Design (pattern selection)
// ═════════════════════════════════════════════════════════════════════
function DesignStep({ onPick }: { onPick: (p: Pattern) => void }) {
  return (
    <div className="flex w-full flex-col items-center gap-6 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Sparkles size={14} /> Step 1 · 花火玉を作る
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        どの割物にする？
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        花火師は星(色玉)の配置で花火の咲き方を決める。あなたが今夜咲かせる型を選んでください。
      </p>

      <div className="grid w-[min(92vw,42rem)] grid-cols-1 gap-3 sm:grid-cols-2">
        {ALL_PATTERNS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="group relative flex flex-col items-start gap-3 rounded-lg border border-washi-50/10 bg-white/5 p-5 text-left transition hover:border-amber-300/60 hover:bg-amber-300/5"
          >
            <PatternPreview pattern={p} />
            <div>
              <h3 className="font-jp text-2xl tracking-wider">
                {PATTERN_INFO[p].jp}
              </h3>
              <p className="text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/55">
                {PATTERN_INFO[p].en}
              </p>
            </div>
            <p className="text-xs leading-relaxed text-washi-50/70">
              {PATTERN_INFO[p].desc}
            </p>
            <span className="mt-1 inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-[0.3em] text-amber-200/80 opacity-0 transition group-hover:opacity-100">
              選ぶ <ArrowRight size={10} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PatternPreview({ pattern }: { pattern: Pattern }) {
  const cx = 40;
  const cy = 40;
  const dots: { x: number; y: number; r: number; opacity: number }[] = [];

  if (pattern === "peony") {
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      dots.push({
        x: cx + Math.cos(a) * 22,
        y: cy + Math.sin(a) * 22,
        r: 2,
        opacity: 0.85,
      });
    }
  } else if (pattern === "chrysanthemum") {
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      dots.push({
        x: cx + Math.cos(a) * 14,
        y: cy + Math.sin(a) * 14,
        r: 1.6,
        opacity: 0.75,
      });
      dots.push({
        x: cx + Math.cos(a) * 28,
        y: cy + Math.sin(a) * 28,
        r: 2,
        opacity: 0.85,
      });
    }
  } else if (pattern === "willow") {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI + (Math.PI * i) / 9;
      dots.push({
        x: cx + Math.cos(a) * 22,
        y: cy + Math.sin(a) * 22,
        r: 2,
        opacity: 0.85,
      });
    }
    // trailing droplets
    for (let i = 0; i < 6; i++) {
      dots.push({
        x: cx - 14 + i * 5.5,
        y: cy + 22 + i * 4,
        r: 1.4,
        opacity: 0.6 - i * 0.08,
      });
    }
  } else {
    // senrin — central cluster + small satellite clusters
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      dots.push({
        x: cx + Math.cos(a) * 6,
        y: cy + Math.sin(a) * 6,
        r: 1.4,
        opacity: 0.8,
      });
    }
    const cores = [
      [-22, -16],
      [22, -14],
      [-18, 18],
      [20, 20],
    ];
    for (const [ox, oy] of cores) {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        dots.push({
          x: cx + ox + Math.cos(a) * 5,
          y: cy + oy + Math.sin(a) * 5,
          r: 1.1,
          opacity: 0.7,
        });
      }
    }
  }

  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      className="opacity-90 transition group-hover:opacity-100"
      aria-hidden
    >
      <circle cx={cx} cy={cy} r="34" fill="rgba(0,0,0,0.4)" />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r}
          fill="rgba(252, 232, 170, 1)"
          opacity={d.opacity}
        />
      ))}
    </svg>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 2 — Color (pick 3 hues)
// ═════════════════════════════════════════════════════════════════════
function ColorStep({
  pattern,
  selected,
  onToggle,
  onConfirm,
  onBack,
}: {
  pattern: Pattern;
  selected: number[];
  onToggle: (hue: number) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const ready = selected.length === 3;
  return (
    <div className="flex w-full flex-col items-center gap-6 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Palette size={14} /> Step 2 · 色を選ぶ
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        {PATTERN_INFO[pattern].jp}に込める色を 3 つ
      </h2>
      <p className="text-sm italic text-washi-50/70">
        星(色玉)に使う色を選ぶ。順番は問わない。 ({selected.length} / 3)
      </p>

      <div className="grid w-[min(92vw,32rem)] grid-cols-3 gap-3 sm:grid-cols-6">
        {HUE_PALETTE.map((h) => {
          const isSelected = selected.includes(h.hue);
          return (
            <button
              key={h.hue}
              type="button"
              onClick={() => onToggle(h.hue)}
              className={clsx(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition",
                isSelected
                  ? "border-washi-50 bg-washi-50/10"
                  : "border-washi-50/15 hover:border-washi-50/40",
              )}
            >
              <span
                className="h-12 w-12 rounded-full"
                style={{
                  background: `radial-gradient(circle at 35% 35%, hsl(${h.hue}, 100%, 78%), hsl(${h.hue}, 90%, 45%) 70%)`,
                  boxShadow: isSelected
                    ? `0 0 24px hsla(${h.hue}, 100%, 70%, 0.7)`
                    : "none",
                }}
              />
              <span className="font-jp text-sm">{h.name}</span>
              <span className="text-[0.55rem] uppercase tracking-[0.3em] text-washi-50/40">
                {h.en}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 作り直す
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          打ち上げ準備
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 3 — Launch (charge & release with locked recipe)
// ═════════════════════════════════════════════════════════════════════
function LaunchStep({
  pattern,
  hues,
  onComplete,
  onBack,
}: {
  pattern: Pattern;
  hues: number[];
  onComplete: (dataUrl: string) => void;
  onBack: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const rockets = useRef<Rocket[]>([]);
  const chargeRef = useRef<{ x: number; start: number } | null>(null);
  const rocketCycleRef = useRef(0);

  const [bursts, setBursts] = useState(0);
  const burstsRef = useRef(0);
  const [chargeProgress, setChargeProgress] = useState(0);
  const finalizingRef = useRef(false);
  const chargeProgressRef = useRef(0);

  const stars = useMemo<Star[]>(() => {
    let s = 17;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 90 }, () => ({
      x: rng(),
      y: rng() * 0.55,
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

  // Animation loop
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

      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#070b1d");
      sky.addColorStop(0.7, "#0e1535");
      sky.addColorStop(1, "#1a2245");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(7,11,29,0.18)";
      ctx.fillRect(0, 0, w, h);

      for (const star of stars) {
        const alpha = 0.4 + Math.sin(tSec * 1.5 + star.phase) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

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
          const cx = (sx0 + sx1) / 2;
          ctx.lineTo(sx0 - 4, sy);
          ctx.lineTo(cx, sy - 10);
          ctx.lineTo(sx1 + 4, sy);
        } else {
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
        pulseGrad.addColorStop(
          0,
          `hsla(50, 100%, 75%, ${0.55 + charge * 0.35})`,
        );
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

      for (const r of rockets.current) {
        r.yNorm += r.vyNorm;
        r.vyNorm *= 0.998;
        const ry = r.yNorm * h;
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
          spawnBurst(r.x, ry, r.charge, r.hue, r.pattern);
          r.yNorm = -1;
          if (!finalizingRef.current) {
            burstsRef.current = Math.min(TARGET_BURSTS, burstsRef.current + 1);
            setBursts(burstsRef.current);
          }
        }
      }
      rockets.current = rockets.current.filter((r) => r.yNorm >= 0);

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
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
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

  function spawnBurst(
    x: number,
    y: number,
    charge: number,
    hue: number,
    pat: Pattern,
  ) {
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

    if (pat === "senrin") {
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
    const trailing = pat === "chrysanthemum" || pat === "willow";

    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.05;
      const v =
        pat === "willow"
          ? baseSpeed * (0.4 + Math.random() * 0.3)
          : baseSpeed * (0.85 + Math.random() * 0.3);
      const lifeFactor = pat === "willow" ? 1.5 : 1;
      particles.current.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (pat === "willow" ? 0 : 0.3),
        life: 0,
        maxLife: (50 + Math.random() * 25) * lifeFactor,
        hue: hue + (Math.random() - 0.5) * 30,
        trail: trailing,
        size: 1.6,
      });
    }
  }

  function spawnRocket(canvasX: number, charge: number) {
    // Locked recipe: pattern + hues chosen during Steps 1-2, hues cycle
    // through the 3 chosen so each rocket alternates colour deterministically.
    const hue = hues[rocketCycleRef.current % hues.length] ?? 48;
    rocketCycleRef.current++;
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
    spawnRocket(w * 0.22, 1);
    setTimeout(() => spawnRocket(w * 0.5, 1), 160);
    setTimeout(() => spawnRocket(w * 0.78, 1), 320);
    setTimeout(() => {
      const dataUrl = canvas.toDataURL("image/png");
      onComplete(dataUrl);
    }, 1700);
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Sparkles size={14} /> Step 3 · 押して溜める · 離して打ち上げる
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

        {/* Recipe badge — shows the locked pattern + colours */}
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 backdrop-blur">
          <span className="font-jp text-[0.65rem] tracking-wider text-amber-200/85">
            {PATTERN_NAMES[pattern]}
          </span>
          <span className="text-amber-200/30">·</span>
          {hues.map((h) => (
            <span
              key={h}
              className="block h-2 w-2 rounded-full"
              style={{
                background: `hsl(${h}, 90%, 65%)`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300 transition-[width] duration-100"
          style={{ width: `${chargeProgress * 100}%` }}
        />
      </div>

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

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 色を選び直す
        </button>
        <button
          type="button"
          onClick={complete}
          disabled={bursts < TARGET_BURSTS}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> Finale
        </button>
      </div>
    </div>
  );
}
