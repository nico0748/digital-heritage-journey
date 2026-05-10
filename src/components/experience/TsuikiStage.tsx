"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Flame,
  Hammer,
  Palette,
  Sparkles,
} from "lucide-react";
import {
  playChime,
  playFire,
  playMetalRing,
  useMutedRef,
} from "@/lib/craftAudio";
import { useTranslations } from "@/lib/i18n";

// 4 steps: 鎚目 → 絞り → 焼鈍 → 着色.
const TOTAL = 4;
// Tap budget for step 1 (within the 50-80 sweet spot).
const TSUCHIME_TARGET = 60;
// Additional taps needed in step 2 to fully form the vessel.
const SHIBORI_TARGET = 30;
// Heating animation length in step 3.
const YAKINAMASHI_DURATION_MS = 3500;

// ───────────────────────────────────────────────────────────
// Domain
// ───────────────────────────────────────────────────────────

type ColorKey = "jundo" | "shikin" | "kokudo" | "shudo";

interface ColorDef {
  key: ColorKey;
  hex: string;
  deep: string;
  jp: string;
  romaji: string;
  caption: string;
}

const COLORS: ColorDef[] = [
  {
    key: "jundo",
    hex: "#C5704A",
    deep: "#7A3F23",
    jp: "純銅",
    romaji: "Jundō",
    caption: "磨いたままの銅本来の橙色",
  },
  {
    key: "shikin",
    hex: "#5C3A4F",
    deep: "#2A1525",
    jp: "紫金",
    romaji: "Shikin",
    caption: "硫黄で深い紫がかった金属色",
  },
  {
    key: "kokudo",
    hex: "#2A1810",
    deep: "#0E0805",
    jp: "黒銅",
    romaji: "Kokudō",
    caption: "煮色仕上げの漆黒",
  },
  {
    key: "shudo",
    hex: "#8B3A1F",
    deep: "#4A1A0A",
    jp: "朱銅",
    romaji: "Shudō",
    caption: "煮込みで朱赤に発色",
  },
];

const COPPER = COLORS[0];

interface Dimple {
  nx: number; // -1..1, normalized disc x
  ny: number; // -1..1, normalized disc y
  r: number;
  rot: number;
}

// ───────────────────────────────────────────────────────────
// Color & geometry helpers
// ───────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// Linear blend between two hex colors. Returns rgb() string.
function mixColors(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexRgb(a);
  const [br, bg, bb] = hexRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

// Lerp dimple position from flat disc (depth=0) to 3/4 bowl (depth=1).
function dimpleXY(d: Dimple, depth: number) {
  const fx = 200 + d.nx * 140;
  const fy = 200 + d.ny * 140;
  const yMix = (d.ny + 1) / 2; // 0=top of disc, 1=bottom
  const bx = 200 + d.nx * (130 - 14 * yMix);
  const by = 110 + yMix * 190;
  return {
    x: Math.round(fx + (bx - fx) * depth),
    y: Math.round(fy + (by - fy) * depth),
  };
}

function bowlBodyPath(depth: number): string {
  const rimY = Math.round(200 - 90 * depth);
  const baseY = Math.round(200 + 100 * depth);
  const cMid1 = Math.round(rimY + 60 * depth);
  const cMid2 = Math.round(baseY - 40 * depth);
  return [
    `M 60 ${rimY}`,
    `C 50 ${cMid1}, 60 ${cMid2}, 80 ${baseY}`,
    `L 320 ${baseY}`,
    `C 340 ${cMid2}, 350 ${cMid1}, 340 ${rimY}`,
    "Z",
  ].join(" ");
}

// ───────────────────────────────────────────────────────────
// Shared bits
// ───────────────────────────────────────────────────────────

function StepHeader({
  step,
  jp,
  romaji,
}: {
  step: number;
  jp: string;
  romaji: string;
}) {
  const t = useTranslations();
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-2 text-center">
      <p className="text-[0.6rem] uppercase tracking-[0.5em] text-washi-50/70">
        Step {step} / {TOTAL} ·{" "}
        <span className="font-jp tracking-[0.2em] text-washi-50">{jp}</span>
        <span className="ml-2 text-washi-50/45">{romaji}</span>
      </p>
      <p className="text-sm leading-relaxed text-washi-50/85">
        {t(`stages.tsuiki.step${step}.hint`)}
      </p>
    </div>
  );
}

function RecipeBadge({
  count,
  color,
}: {
  count: number;
  color: ColorDef | null;
}) {
  return (
    <div className="rounded-full bg-black/40 px-4 py-1.5 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/85 backdrop-blur">
      <span className="font-jp tracking-wider">鎚起銅器</span>
      <span className="mx-2 text-washi-50/40">·</span>
      <span>鎚目 {count}回</span>
      {color && (
        <>
          <span className="mx-2 text-washi-50/40">·</span>
          <span className="font-jp tracking-wider">{color.jp}</span>
        </>
      )}
    </div>
  );
}

function BackButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/60 transition hover:text-washi-50 disabled:opacity-30"
    >
      <ArrowLeft size={12} /> 前へ戻る
    </button>
  );
}

// ───────────────────────────────────────────────────────────
// Vessel — shared renderer for steps 2/3/4. Step 1 uses its own
// disc renderer so it can mount the high-frequency tap effects
// without re-rendering the bowl machinery.
// ───────────────────────────────────────────────────────────

function Vessel({
  depth,
  color,
  dimples,
  glow = 0,
}: {
  depth: number;
  color: ColorDef;
  dimples: Dimple[];
  glow?: number;
}) {
  const rimY = Math.round(200 - 90 * depth);
  const rimRy = Math.round(140 - 100 * depth);
  const baseY = Math.round(200 + 100 * depth);
  const baseRx = Math.round(140 - 20 * depth);
  const baseRy = Math.round(20 * depth);

  const surfaceLight = mixColors(color.hex, "#FFB070", -0.0); // base
  const surfaceMid = mixColors(color.hex, "#000000", 0.05);
  const surfaceDeep = color.deep;

  // Glow tint shifts toward red-hot orange.
  const surfaceLit = mixColors(surfaceLight, "#FF6020", glow);
  const deepLit = mixColors(surfaceDeep, "#9B0F08", glow);
  const rimInsideLit = mixColors("#000000", "#FF8030", glow * 0.85);

  const bodyPath = bowlBodyPath(depth);

  return (
    <>
      <defs>
        <linearGradient id="vessel-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={surfaceLit} />
          <stop offset="55%" stopColor={mixColors(surfaceMid, "#FF4520", glow)} />
          <stop offset="100%" stopColor={deepLit} />
        </linearGradient>
        <radialGradient id="vessel-rim" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={mixColors("#1a0a04", "#FF7030", glow)} />
          <stop offset="65%" stopColor={mixColors("#3a1a08", "#FF5020", glow)} />
          <stop offset="100%" stopColor={mixColors(color.hex, "#FF4020", glow)} />
        </radialGradient>
        <filter id="vessel-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>

      {/* Heat halo behind vessel */}
      {glow > 0.01 && (
        <ellipse
          cx={200}
          cy={Math.round(200 + depth * 10)}
          rx={Math.round(160 + glow * 20)}
          ry={Math.round(150 + glow * 18)}
          fill={mixColors("#FF3010", "#FFC060", 0.3)}
          opacity={glow * 0.55}
          filter="url(#vessel-glow)"
        />
      )}

      {/* Anvil shadow */}
      <ellipse
        cx={200}
        cy={Math.round(355 - 5 * depth)}
        rx={Math.round(150 - 10 * depth)}
        ry={18}
        fill="#000"
        opacity={0.45}
      />

      {/* Body (only meaningful when depth > 0) */}
      {depth > 0.01 && (
        <path
          d={bodyPath}
          style={{
            fill: "url(#vessel-body)",
            transition: "fill 0.9s ease",
          }}
        />
      )}

      {/* Outer rim band — depth=0 makes this the full disc face */}
      <ellipse
        cx={200}
        cy={rimY}
        rx={140}
        ry={Math.max(rimRy, 1)}
        style={{
          fill: depth > 0.01 ? "url(#vessel-rim)" : `url(#vessel-rim)`,
          transition: "fill 0.9s ease",
        }}
      />

      {/* Inside-of-bowl shadow (only when bowl is open) */}
      {depth > 0.05 && (
        <ellipse
          cx={200}
          cy={rimY}
          rx={Math.round(132 - 4 * depth)}
          ry={Math.max(0, Math.round(rimRy - 6))}
          fill={rimInsideLit}
          opacity={0.85}
        />
      )}

      {/* Base ellipse (the foot under the bowl) */}
      {depth > 0.05 && (
        <ellipse
          cx={200}
          cy={baseY}
          rx={baseRx}
          ry={baseRy}
          fill={mixColors("#000000", "#FF3010", glow * 0.5)}
          opacity={0.55}
        />
      )}

      {/* Dimples on the visible surface */}
      {dimples.map((d, i) => {
        const { x, y } = dimpleXY(d, depth);
        // Cull dimples that would be inside the rim shadow once the
        // bowl is open — those would float in the bowl interior.
        if (depth > 0.5 && y < rimY + Math.max(8, rimRy - 4)) return null;
        const r = d.r;
        const rotI = Math.round(d.rot);
        const highlightY = Math.round(-r * 0.25);
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${rotI})`}>
            <ellipse
              cx={0}
              cy={0}
              rx={r + 1}
              ry={Math.max(1, Math.round(r * 0.65))}
              fill="#2a1208"
              opacity={0.6}
            />
            <ellipse
              cx={0}
              cy={highlightY}
              rx={Math.max(1, Math.round(r * 0.65))}
              ry={Math.max(1, Math.round(r * 0.32))}
              fill={mixColors(color.hex, "#FFE6C0", 0.5 + glow * 0.3)}
              opacity={0.55}
            />
          </g>
        );
      })}
    </>
  );
}

// ───────────────────────────────────────────────────────────
// Step 1 — 鎚目 (Tsuchime)
// ───────────────────────────────────────────────────────────

interface Effect {
  id: number;
  x: number;
  y: number;
  t0: number;
}
interface Sparkle extends Effect {
  vx: number;
  vy: number;
}

function TsuchimeStep({
  dimples,
  addDimple,
  onNext,
  mutedRef,
}: {
  dimples: Dimple[];
  addDimple: (d: Dimple) => void;
  onNext: () => void;
  mutedRef: React.RefObject<boolean>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const ripples = useRef<Effect[]>([]);
  const sparkles = useRef<Sparkle[]>([]);
  const idRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  function ensureRaf() {
    if (rafRef.current !== null) return;
    const loop = () => {
      if (!mountedRef.current) return;
      const now = performance.now();
      ripples.current = ripples.current.filter((r) => now - r.t0 < 700);
      sparkles.current = sparkles.current.filter((s) => now - s.t0 < 700);
      setTick((t) => (t + 1) % 1_000_000);
      if (ripples.current.length || sparkles.current.length) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  function strike(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * 400;
    const sy = ((clientY - rect.top) / rect.height) * 400;
    const dx = sx - 200;
    const dy = sy - 200;
    if (Math.hypot(dx, dy) > 138) return;

    const jitterA = Math.random() * Math.PI * 2;
    const jitter = Math.random() * 4;
    const fx = sx + Math.cos(jitterA) * jitter;
    const fy = sy + Math.sin(jitterA) * jitter;
    const nx = Math.max(-1, Math.min(1, (fx - 200) / 140));
    const ny = Math.max(-1, Math.min(1, (fy - 200) / 140));

    addDimple({
      nx,
      ny,
      r: 3 + Math.random() * 2,
      rot: Math.random() * 180,
    });

    const now = performance.now();
    ripples.current.push({
      id: ++idRef.current,
      x: Math.round(fx),
      y: Math.round(fy),
      t0: now,
    });
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 70;
      sparkles.current.push({
        id: ++idRef.current,
        x: Math.round(fx),
        y: Math.round(fy),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        t0: now,
      });
    }
    ensureRaf();
    playMetalRing({ mutedRef, freq: 1100, duration: 0.25 });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    strike(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  const count = dimples.length;
  const progress = Math.min(1, count / TSUCHIME_TARGET);
  const ready = count >= TSUCHIME_TARGET;
  const now = performance.now();

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <StepHeader
        step={1}
        jp="鎚目"
        romaji="Tsuchime"
      />

      <div className="relative h-[min(56vh,28rem)] w-[min(92vw,28rem)] overflow-hidden rounded-sm border border-washi-50/10 bg-[#1a0e06] shadow-2xl shadow-black/60">
        <svg
          ref={svgRef}
          viewBox="0 0 400 400"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute inset-0 h-full w-full cursor-pointer touch-none select-none"
        >
          <defs>
            <radialGradient id="tsuchime-disc" cx="40%" cy="35%">
              <stop offset="0%" stopColor="#E89B6F" />
              <stop offset="55%" stopColor="#C5704A" />
              <stop offset="100%" stopColor="#7A3F23" />
            </radialGradient>
            <radialGradient id="tsuchime-edge" cx="50%" cy="50%">
              <stop offset="78%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
            </radialGradient>
          </defs>

          {/* Anvil shadow */}
          <ellipse cx={200} cy={355} rx={150} ry={18} fill="#000" opacity={0.5} />

          {/* Copper disc */}
          <circle cx={200} cy={200} r={140} fill="url(#tsuchime-disc)" />
          <circle cx={200} cy={200} r={140} fill="url(#tsuchime-edge)" />

          {/* Dimples */}
          {dimples.map((d, i) => {
            const cx = Math.round(200 + d.nx * 140);
            const cy = Math.round(200 + d.ny * 140);
            const r = d.r;
            const rot = Math.round(d.rot);
            const hlY = Math.round(-r * 0.25);
            return (
              <g key={i} transform={`translate(${cx} ${cy}) rotate(${rot})`}>
                <ellipse
                  cx={0}
                  cy={0}
                  rx={r + 1}
                  ry={Math.max(1, Math.round(r * 0.65))}
                  fill="#3a1a08"
                  opacity={0.6}
                />
                <ellipse
                  cx={0}
                  cy={hlY}
                  rx={Math.max(1, Math.round(r * 0.65))}
                  ry={Math.max(1, Math.round(r * 0.32))}
                  fill="#F0B58A"
                  opacity={0.55}
                />
              </g>
            );
          })}

          {/* Ripples */}
          {ripples.current.map((r) => {
            const t = (now - r.t0) / 700;
            const radius = Math.round(8 + t * 32);
            const opacity = Math.max(0, 1 - t) * 0.7;
            return (
              <circle
                key={r.id}
                cx={r.x}
                cy={r.y}
                r={radius}
                fill="none"
                stroke="#FFD9B0"
                strokeWidth={1.4}
                opacity={opacity}
              />
            );
          })}

          {/* Sparkles */}
          {sparkles.current.map((s) => {
            const t = (now - s.t0) / 700;
            const x = Math.round(s.x + s.vx * t);
            const y = Math.round(s.y + s.vy * t + 80 * t * t);
            const opacity = Math.max(0, 1 - t);
            return (
              <circle
                key={s.id}
                cx={x}
                cy={y}
                r={1.4}
                fill="#FFE6B0"
                opacity={opacity}
              />
            );
          })}
        </svg>

        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-amber-200/85 backdrop-blur">
          <Hammer size={10} />
          <span>
            {count} / {TSUCHIME_TARGET}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300 transition-[width] duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <RecipeBadge count={count} color={null} />

      <button
        type="button"
        onClick={onNext}
        disabled={!ready}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        <Check size={12} /> 次の工程 · 絞り
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Step 2 — 絞り (Shibori)
// ───────────────────────────────────────────────────────────

function ShiboriStep({
  dimples,
  addDimple,
  shiboriTaps,
  bumpShiboriTaps,
  onNext,
  onBack,
  mutedRef,
}: {
  dimples: Dimple[];
  addDimple: (d: Dimple) => void;
  shiboriTaps: number;
  bumpShiboriTaps: () => void;
  onNext: () => void;
  onBack: () => void;
  mutedRef: React.RefObject<boolean>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Depth grows with shibori taps; fully formed at 60% of target,
  // remaining 40% are "deepening" passes.
  const formThreshold = SHIBORI_TARGET * 0.6;
  const dRaw = Math.max(0, Math.min(1, shiboriTaps / formThreshold));
  // Smoothstep so the form-up has an organic ease.
  const depth = dRaw * dRaw * (3 - 2 * dRaw);
  const ready = shiboriTaps >= SHIBORI_TARGET;

  function strike(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * 400;
    const sy = ((clientY - rect.top) / rect.height) * 400;
    // Accept taps anywhere on the vessel area (generous bbox).
    if (sx < 40 || sx > 360 || sy < 40 || sy > 340) return;

    // New dimples fold into the disc-relative coordinate system so
    // they keep mapping cleanly into the vessel surface.
    const nx = (Math.random() - 0.5) * 1.6;
    const yMix = 0.2 + Math.random() * 0.7;
    const ny = yMix * 2 - 1;
    addDimple({
      nx,
      ny,
      r: 3 + Math.random() * 2,
      rot: Math.random() * 180,
    });
    bumpShiboriTaps();
    playMetalRing({ mutedRef, freq: 880, duration: 0.4 });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    strike(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  const formed = depth >= 0.95;
  const progressPct = Math.min(1, shiboriTaps / SHIBORI_TARGET);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <StepHeader
        step={2}
        jp="絞り"
        romaji="Shibori"
      />

      <div className="relative h-[min(56vh,28rem)] w-[min(92vw,28rem)] overflow-hidden rounded-sm border border-washi-50/10 bg-[#1a0e06] shadow-2xl shadow-black/60">
        <svg
          ref={svgRef}
          viewBox="0 0 400 400"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute inset-0 h-full w-full cursor-pointer touch-none select-none"
        >
          <Vessel depth={depth} color={COPPER} dimples={dimples} />
        </svg>

        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-amber-200/85 backdrop-blur">
          <Sparkles size={10} />
          <span>
            {shiboriTaps} / {SHIBORI_TARGET}
          </span>
        </div>

        {formed && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-amber-300/15 px-2.5 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-amber-200 backdrop-blur">
            <span className="font-jp">立体成形</span>
          </div>
        )}
      </div>

      <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300 transition-[width] duration-200"
          style={{ width: `${progressPct * 100}%` }}
        />
      </div>

      <RecipeBadge count={dimples.length} color={null} />

      <div className="flex items-center gap-6">
        <BackButton onClick={onBack} />
        <button
          type="button"
          onClick={onNext}
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> 次の工程 · 焼鈍
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Step 3 — 焼鈍 (Yakinamashi)
// ───────────────────────────────────────────────────────────

function YakinamashiStep({
  dimples,
  onNext,
  onBack,
  mutedRef,
}: {
  dimples: Dimple[];
  onNext: () => void;
  onBack: () => void;
  mutedRef: React.RefObject<boolean>;
}) {
  const [glow, setGlow] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Each effect mount drives its own animation; the cleanup cancels
    // the prior rAF, so React strict-mode double-mount in dev still
    // ends with one running loop instead of a stuck zero-glow state.
    let canceled = false;
    let id = 0;
    playFire({ mutedRef, duration: 3.5 });
    const start = performance.now();
    const loop = () => {
      if (canceled) return;
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / YAKINAMASHI_DURATION_MS);
      // Smoothstep ramp up to ~0.85 at t=0.7, hold at 1 thereafter.
      const ramp = t < 0.7 ? t / 0.7 : 1;
      const g = ramp * ramp * (3 - 2 * ramp);
      setGlow(g);
      if (t < 1) {
        id = requestAnimationFrame(loop);
      } else {
        setDone(true);
      }
    };
    id = requestAnimationFrame(loop);
    return () => {
      canceled = true;
      cancelAnimationFrame(id);
    };
  }, [mutedRef]);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <StepHeader
        step={3}
        jp="焼鈍"
        romaji="Yakinamashi"
      />

      <div className="relative h-[min(56vh,28rem)] w-[min(92vw,28rem)] overflow-hidden rounded-sm border border-washi-50/10 bg-[#0e0604] shadow-2xl shadow-black/60">
        <svg
          viewBox="0 0 400 400"
          className="absolute inset-0 h-full w-full select-none"
        >
          {/* Furnace bricks (silhouette) */}
          <rect x={20} y={300} width={360} height={80} fill="#1a0a04" />
          <rect x={20} y={295} width={360} height={6} fill="#2a1208" />
          {/* Embers */}
          {Array.from({ length: 14 }, (_, i) => {
            const ex = 30 + i * 26;
            const ey = 320 + (i % 2) * 6;
            const eOpacity = Math.min(1, glow * (0.4 + 0.6 * ((i % 5) / 5)));
            return (
              <circle
                key={i}
                cx={ex}
                cy={ey}
                r={2 + (i % 3)}
                fill="#FF6020"
                opacity={eOpacity}
              />
            );
          })}

          <Vessel depth={1} color={COPPER} dimples={dimples} glow={glow} />
        </svg>

        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-amber-200/85 backdrop-blur">
          <Flame size={10} />
          <span className="font-jp">焼鈍中 {Math.round(800 * Math.min(1, glow / 0.85))}℃</span>
        </div>
      </div>

      <RecipeBadge count={dimples.length} color={null} />

      <div className="flex items-center gap-6">
        <BackButton onClick={onBack} />
        <button
          type="button"
          onClick={onNext}
          disabled={!done}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> 次の工程 · 着色
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Step 4 — 着色 (Chakushoku)
// ───────────────────────────────────────────────────────────

function ChakushokuStep({
  dimples,
  color,
  setColor,
  finalize,
  finalizing,
  onBack,
  mutedRef,
}: {
  dimples: Dimple[];
  color: ColorDef | null;
  setColor: (c: ColorDef) => void;
  finalize: () => void;
  finalizing: boolean;
  onBack: () => void;
  mutedRef: React.RefObject<boolean>;
}) {
  const t = useTranslations();
  const [reacting, setReacting] = useState(false);
  const reactingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (reactingTimerRef.current !== null) {
        clearTimeout(reactingTimerRef.current);
        reactingTimerRef.current = null;
      }
    };
  }, []);

  function pick(c: ColorDef) {
    if (finalizing) return;
    setColor(c);
    setReacting(true);
    if (reactingTimerRef.current !== null) {
      clearTimeout(reactingTimerRef.current);
    }
    reactingTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setReacting(false);
      reactingTimerRef.current = null;
    }, 1100);
    playMetalRing({ mutedRef, freq: 660, duration: 0.4 });
  }

  const surface = color ?? COPPER;
  const ready = !!color && !reacting;

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <StepHeader
        step={4}
        jp="着色"
        romaji="Chakushoku"
      />

      <div className="relative h-[min(56vh,28rem)] w-[min(92vw,28rem)] overflow-hidden rounded-sm border border-washi-50/10 bg-[#0e0604] shadow-2xl shadow-black/60">
        <svg
          viewBox="0 0 400 400"
          className="absolute inset-0 h-full w-full select-none"
        >
          <Vessel depth={1} color={surface} dimples={dimples} />
        </svg>

        {reacting && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/55 px-3 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-amber-200/90 backdrop-blur">
              <span className="font-jp">化学反応中…</span>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-amber-200/85 backdrop-blur">
          <Palette size={10} />
          <span className="font-jp">{color ? color.jp : "未着色"}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {COLORS.map((c) => {
          const active = color?.key === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => pick(c)}
              disabled={finalizing || reacting}
              className={`group flex flex-col items-center gap-1 rounded-md border px-3 py-2 text-[0.55rem] uppercase tracking-[0.3em] transition disabled:opacity-50 ${
                active
                  ? "border-amber-200 text-amber-200"
                  : "border-washi-50/15 text-washi-50/70 hover:border-washi-50/40 hover:text-washi-50"
              }`}
              title={c.caption}
            >
              <span
                className="h-5 w-5 rounded-full border border-black/40 shadow-inner"
                style={{
                  background: `radial-gradient(circle at 30% 30%, ${c.hex} 0%, ${c.deep} 100%)`,
                }}
              />
              <span className="font-jp tracking-[0.2em]">{c.jp}</span>
            </button>
          );
        })}
      </div>

      <RecipeBadge count={dimples.length} color={color} />

      <div className="flex items-center gap-6">
        <BackButton onClick={onBack} disabled={finalizing} />
        <button
          type="button"
          onClick={finalize}
          disabled={!ready || finalizing}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> {t("common.complete")}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Final image renderer — same vessel geometry, drawn into a
// 2x canvas and exported as the artifact preserved in the archive.
// ───────────────────────────────────────────────────────────

function renderArtifact(color: ColorDef, dimples: Dimple[]): string {
  if (typeof document === "undefined") return "";
  const SIZE = 800;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const s = (n: number) => Math.round(n * 2);

  // Background vignette.
  const bg = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE * 0.7);
  bg.addColorStop(0, "#2a1c10");
  bg.addColorStop(1, "#0a0604");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Anvil shadow.
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.ellipse(s(200), s(355), s(140), s(18), 0, 0, Math.PI * 2);
  ctx.fill();

  // Vessel body with vertical gradient.
  const rimY = s(110);
  const baseY = s(300);
  const grad = ctx.createLinearGradient(0, rimY, 0, baseY);
  grad.addColorStop(0, color.hex);
  grad.addColorStop(0.55, mixColors(color.hex, "#000000", 0.05));
  grad.addColorStop(1, color.deep);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(s(60), rimY);
  ctx.bezierCurveTo(s(50), rimY + s(60), s(60), baseY - s(40), s(80), baseY);
  ctx.lineTo(s(320), baseY);
  ctx.bezierCurveTo(s(340), baseY - s(40), s(350), rimY + s(60), s(340), rimY);
  ctx.closePath();
  ctx.fill();

  // Foot shadow.
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.ellipse(s(200), baseY, s(120), s(20), 0, 0, Math.PI * 2);
  ctx.fill();

  // Rim ring.
  ctx.fillStyle = color.hex;
  ctx.beginPath();
  ctx.ellipse(s(200), rimY, s(140), s(40), 0, 0, Math.PI * 2);
  ctx.fill();

  // Inside-bowl shadow.
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.beginPath();
  ctx.ellipse(s(200), rimY, s(132), s(34), 0, 0, Math.PI * 2);
  ctx.fill();

  // Dimples.
  for (const d of dimples) {
    const { x, y } = dimpleXY(d, 1);
    if (y < 110 + 14) continue;
    const sx = s(x);
    const sy = s(y);
    const sr = s(d.r);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((d.rot * Math.PI) / 180);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.ellipse(0, 0, sr + 2, Math.max(2, sr * 0.65), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mixColors(color.hex, "#FFE6C0", 0.5);
    ctx.beginPath();
    ctx.ellipse(0, -sr * 0.25, Math.max(2, sr * 0.65), Math.max(1, sr * 0.32), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Caption.
  ctx.fillStyle = "rgba(245,239,230,0.88)";
  ctx.font = "300 24px 'Cormorant Garamond', serif";
  ctx.textAlign = "center";
  ctx.fillText("Tsubame-Sanjō Tsuiki", SIZE / 2, SIZE - 70);
  ctx.font = "20px 'Shippori Mincho', serif";
  ctx.fillText(`鎚起銅器 · ${color.jp} · 鎚目 ${dimples.length}回`, SIZE / 2, SIZE - 36);

  return canvas.toDataURL("image/png");
}

// ───────────────────────────────────────────────────────────
// Orchestrator
// ───────────────────────────────────────────────────────────

export function TsuikiStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const mutedRef = useMutedRef();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [dimples, setDimples] = useState<Dimple[]>([]);
  const [shiboriTaps, setShiboriTaps] = useState(0);
  const [color, setColor] = useState<ColorDef | null>(null);

  const finalizingRef = useRef(false);
  const [finalizing, setFinalizing] = useState(false);
  const mountedRef = useRef(true);
  const finaleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const id of finaleTimersRef.current) clearTimeout(id);
      finaleTimersRef.current = [];
    };
  }, []);

  function addDimple(d: Dimple) {
    setDimples((prev) => [...prev, d]);
  }

  function bumpShiboriTaps() {
    setShiboriTaps((n) => n + 1);
  }

  function finalize() {
    // Re-entrancy guard — finalize chains a timeout + onComplete which
    // navigates; a double-click would queue two navigations and stomp
    // saved work.
    if (finalizingRef.current) return;
    if (!color) return;
    finalizingRef.current = true;
    setFinalizing(true);
    playMetalRing({ mutedRef, freq: 1320, duration: 0.6 });
    playChime({ mutedRef });
    finaleTimersRef.current.push(
      setTimeout(() => {
        if (!mountedRef.current) return;
        const dataUrl = renderArtifact(color, dimples);
        onComplete(dataUrl);
      }, 900),
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      {step === 1 && (
        <TsuchimeStep
          dimples={dimples}
          addDimple={addDimple}
          onNext={() => setStep(2)}
          mutedRef={mutedRef}
        />
      )}
      {step === 2 && (
        <ShiboriStep
          dimples={dimples}
          addDimple={addDimple}
          shiboriTaps={shiboriTaps}
          bumpShiboriTaps={bumpShiboriTaps}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
          mutedRef={mutedRef}
        />
      )}
      {step === 3 && (
        <YakinamashiStep
          dimples={dimples}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
          mutedRef={mutedRef}
        />
      )}
      {step === 4 && (
        <ChakushokuStep
          dimples={dimples}
          color={color}
          setColor={setColor}
          finalize={finalize}
          finalizing={finalizing}
          onBack={() => setStep(3)}
          mutedRef={mutedRef}
        />
      )}
    </div>
  );
}
