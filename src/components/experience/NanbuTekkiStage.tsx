"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { ArrowLeft, Check, Flame, Hammer, Sparkles } from "lucide-react";
import {
  useMutedRef,
  playChime,
  playClick,
  playCrackle,
  playMetalRing,
  playPour,
  playThud,
} from "@/lib/craftAudio";

// ──────────────────────────────────────────────────────────────────────
// 南部鉄器 (Nanbu Tekki) — Iwate cast iron experience.
//
// Four steps mirror the real foundry workflow:
//   1. 文様付け (Mongon-zuke)  — punch the 霰文 raised dot pattern.
//   2. 鋳型作り (Kata-zukuri)  — pack sand around the wood master.
//   3. 鋳込み   (Ikomi)        — pour 1500°C molten iron in one shot.
//   4. 仕上げ   (Shiage)       — cool, polish, deliver.
//
// All four steps share the same kettle silhouette so the user's dot
// placement persists visually from step 1 → step 4. The orchestrator
// owns shared state (dots, tamps, pour fill, finalize guard) and each
// step is its own component.
// ──────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;
const STEP_NAMES = ["文様付け", "鋳型作り", "鋳込み", "仕上げ"] as const;
const STEP_ROMAJI = [
  "Mongon-zuke",
  "Kata-zukuri",
  "Ikomi",
  "Shiage",
] as const;
const STEP_HINTS = [
  "霰(あられ)文様を木型に彫る。等間隔と整然さが鉄瓶の格を決める。",
  "砂と粘土を混ぜ、型を叩き締める。鋳物の精度はここで決まる。",
  "炉で1500℃に熱した鉄を一気に流す。一発勝負。",
  "型から外し、研磨と漆塗りで黒い鉄器に仕上げる。",
] as const;

const GRID_SIZE = 5;
const MIN_DOTS = 12;
const MAX_DOTS = 25;
const TAMP_TARGET = 6;
const POUR_TARGET_MS = 2000;
const COOL_DURATION_MS = 3000;
const POLISH_TARGET = 60; // unique cell visits during drag
const POLISH_GRID = 12; // 12×12 polish cells overlay

// SVG geometry — all four steps render into the same viewBox.
const VB = 320;
const KETTLE_CX = 160;
const KETTLE_CY = 178;
const KETTLE_RX = 102;
const KETTLE_RY = 92;

// 5×5 grid centered on the kettle body, well inside the rim.
const GRID_PITCH = 26;
const GRID_LEFT = KETTLE_CX - GRID_PITCH * 2;
const GRID_TOP = KETTLE_CY - GRID_PITCH * 2;

interface Dot {
  gx: number;
  gy: number;
}

function gridPos(gx: number, gy: number): { x: number; y: number } {
  return {
    x: GRID_LEFT + gx * GRID_PITCH,
    y: GRID_TOP + gy * GRID_PITCH,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Orchestrator
// ──────────────────────────────────────────────────────────────────────

// Functional setters keep step components decoupled from the
// orchestrator's render cycle. Without this, rapid pointer events
// would batch-overwrite each other reading a stale closure.
type DotSetter = (updater: (prev: Dot[]) => Dot[]) => void;
type NumSetter = (updater: (prev: number) => number) => void;

export function NanbuTekkiStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const muted = useMutedRef();
  const [step, setStep] = useState(1);
  const [dots, setDots] = useState<Dot[]>([]);
  const [tamps, setTamps] = useState(0);
  const [pourFill, setPourFill] = useState(0);
  // Finalize guard — re-entrancy protection on the final completion call.
  // The Shiage step owns the actual onComplete invocation; the guard ref
  // sits on the orchestrator so navigating back from Shiage and forward
  // again can't double-fire onComplete.
  const finalizingRef = useRef(false);
  const [finalizing, setFinalizing] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Hammer size={14} />
        Step {step} / {TOTAL_STEPS} ·{" "}
        <span className="font-jp tracking-[0.3em] text-amber-200/85">
          {STEP_NAMES[step - 1]}
        </span>
        <span className="opacity-60">({STEP_ROMAJI[step - 1]})</span>
      </p>

      {step === 1 && (
        <MongonStep
          mutedRef={muted}
          dots={dots}
          setDots={setDots}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <KataStep
          mutedRef={muted}
          dots={dots}
          tamps={tamps}
          setTamps={setTamps}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <IkomiStep
          mutedRef={muted}
          dots={dots}
          pourFill={pourFill}
          setPourFill={setPourFill}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <ShiageStep
          mutedRef={muted}
          dots={dots}
          finalizingRef={finalizingRef}
          finalizing={finalizing}
          setFinalizing={setFinalizing}
          mountedRef={mountedRef}
          onBack={() => setStep(3)}
          onComplete={onComplete}
        />
      )}

      <p className="max-w-[28rem] text-center text-[0.65rem] leading-relaxed tracking-wide text-washi-50/55">
        {STEP_HINTS[step - 1]}
      </p>

      <div className="mt-1 inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-black/35 px-4 py-1.5 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/70 backdrop-blur">
        <span className="font-jp tracking-widest text-amber-200/85">
          南部鉄器
        </span>
        <span className="opacity-50">·</span>
        <span>
          霰 <span className="text-amber-200/85">{dots.length}</span>個
        </span>
        {step >= 3 && (
          <>
            <span className="opacity-50">·</span>
            <span>{pourFill >= 1 ? "鋳込み完了" : "鋳込み中"}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared visual primitives
// ──────────────────────────────────────────────────────────────────────

function StageFrame({
  children,
  bg = "linear-gradient(180deg,#1a0e08 0%,#0a0604 100%)",
}: {
  children: React.ReactNode;
  bg?: string;
}) {
  return (
    <div
      className="relative h-[min(60vh,28rem)] w-[min(92vw,32rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60"
      style={{ background: bg }}
    >
      {children}
    </div>
  );
}

function SvgDefs() {
  // Reusable gradients. Keys are stable so SVG `url(#…)` references
  // resolve cross-step.
  return (
    <defs>
      <radialGradient id="dotMatte" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#9b6a3a" />
        <stop offset="55%" stopColor="#3b2510" />
        <stop offset="100%" stopColor="#150b04" />
      </radialGradient>
      <radialGradient id="dotPolished" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#cfb892" />
        <stop offset="40%" stopColor="#5b3a20" />
        <stop offset="100%" stopColor="#0a0604" />
      </radialGradient>
      <linearGradient id="kettleBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b2510" />
        <stop offset="60%" stopColor="#241509" />
        <stop offset="100%" stopColor="#150b04" />
      </linearGradient>
      <linearGradient id="kettleBodyHot" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffb060" />
        <stop offset="55%" stopColor="#e85a18" />
        <stop offset="100%" stopColor="#7a2308" />
      </linearGradient>
      <radialGradient id="moltenIron" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="#ffe7b0" />
        <stop offset="40%" stopColor="#ff8a2a" />
        <stop offset="100%" stopColor="#5a1c05" />
      </radialGradient>
      <linearGradient id="sandGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#caa472" />
        <stop offset="100%" stopColor="#7a5a36" />
      </linearGradient>
      <linearGradient id="moldShellGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3a2c1c" />
        <stop offset="100%" stopColor="#1a120a" />
      </linearGradient>
    </defs>
  );
}

function KettleSilhouette({
  fill = "url(#kettleBody)",
  stroke = "#5b3a20",
  glow = false,
}: {
  fill?: string;
  stroke?: string;
  glow?: boolean;
}) {
  // Front view of a tetsubin: round body, lid, yoke handle, side spout.
  const top = KETTLE_CY - KETTLE_RY;
  return (
    <g style={glow ? { filter: "drop-shadow(0 0 18px rgba(255,160,60,0.55))" } : undefined}>
      {/* Yoke handle (tsuru) */}
      <path
        d={`M ${KETTLE_CX - 70} ${top + 4} Q ${KETTLE_CX} ${top - 70} ${KETTLE_CX + 70} ${top + 4}`}
        fill="none"
        stroke={stroke}
        strokeWidth={5}
        strokeLinecap="round"
      />
      {/* Lid base ring */}
      <ellipse
        cx={KETTLE_CX}
        cy={top + 6}
        rx={36}
        ry={6}
        fill={stroke}
      />
      {/* Lid knob */}
      <rect
        x={KETTLE_CX - 7}
        y={top - 8}
        width={14}
        height={14}
        rx={3}
        fill={stroke}
      />
      <ellipse cx={KETTLE_CX} cy={top - 8} rx={8} ry={3} fill="#7a522d" />
      {/* Spout (chuko) */}
      <path
        d={`M ${KETTLE_CX + KETTLE_RX - 6} ${KETTLE_CY - 22}
            Q ${KETTLE_CX + KETTLE_RX + 30} ${KETTLE_CY - 38}
              ${KETTLE_CX + KETTLE_RX + 34} ${KETTLE_CY - 14}
            Q ${KETTLE_CX + KETTLE_RX + 12} ${KETTLE_CY + 4}
              ${KETTLE_CX + KETTLE_RX - 6} ${KETTLE_CY + 6} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      {/* Body */}
      <ellipse
        cx={KETTLE_CX}
        cy={KETTLE_CY}
        rx={KETTLE_RX}
        ry={KETTLE_RY}
        fill={fill}
        stroke={stroke}
        strokeWidth={2.5}
      />
      {/* Subtle base shadow */}
      <ellipse
        cx={KETTLE_CX}
        cy={KETTLE_CY + KETTLE_RY - 6}
        rx={KETTLE_RX * 0.72}
        ry={6}
        fill="rgba(0,0,0,0.55)"
      />
    </g>
  );
}

function RaisedDot({
  cx,
  cy,
  r = 5,
  polished = false,
  hot = false,
}: {
  cx: number;
  cy: number;
  r?: number;
  polished?: boolean;
  hot?: boolean;
}) {
  // Drop-shadow-on-down gives the dot its raised, 3D feel even in
  // flat SVG. `hot` overrides for the molten step.
  return (
    <g style={{ filter: "drop-shadow(0 1px 0.6px rgba(0,0,0,0.55))" }}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={
          hot
            ? "url(#moltenIron)"
            : polished
              ? "url(#dotPolished)"
              : "url(#dotMatte)"
        }
      />
      {/* Specular highlight */}
      <circle
        cx={cx - r * 0.32}
        cy={cy - r * 0.32}
        r={r * 0.38}
        fill={
          hot ? "rgba(255,240,200,0.85)" : polished ? "rgba(255,235,200,0.45)" : "rgba(255,210,160,0.18)"
        }
      />
    </g>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 1 — 文様付け (Mongon-zuke)
// ──────────────────────────────────────────────────────────────────────

function MongonStep({
  mutedRef,
  dots,
  setDots,
  onNext,
}: {
  mutedRef: RefObject<boolean>;
  dots: Dot[];
  setDots: DotSetter;
  onNext: () => void;
}) {
  const placedAt = useCallback(
    (gx: number, gy: number): boolean => dots.some((d) => d.gx === gx && d.gy === gy),
    [dots],
  );

  const onCellPointerDown = (
    e: ReactPointerEvent<SVGRectElement>,
    gx: number,
    gy: number,
  ) => {
    e.preventDefault();
    setDots((prev) => {
      const exists = prev.some((d) => d.gx === gx && d.gy === gy);
      if (exists) {
        playClick({ mutedRef, freq: 900 });
        return prev.filter((d) => !(d.gx === gx && d.gy === gy));
      }
      if (prev.length >= MAX_DOTS) return prev;
      playClick({ mutedRef, freq: 1500 });
      return [...prev, { gx, gy }];
    });
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <StageFrame>
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          className="absolute inset-0 h-full w-full touch-none"
        >
          <SvgDefs />
          <KettleSilhouette />
          {/* Grid — render placeholder rings for empty cells, raised dots
              for filled cells, plus a transparent hit target on top. */}
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, idx) => {
            const gx = idx % GRID_SIZE;
            const gy = Math.floor(idx / GRID_SIZE);
            const { x, y } = gridPos(gx, gy);
            const filled = placedAt(gx, gy);
            return (
              <g key={`m-${gx}-${gy}`}>
                {!filled && (
                  <circle
                    cx={x}
                    cy={y}
                    r={4.5}
                    fill="none"
                    stroke="rgba(201,162,39,0.28)"
                    strokeWidth={1}
                    strokeDasharray="1.5 2"
                  />
                )}
                {filled && <RaisedDot cx={x} cy={y} />}
                <rect
                  x={x - 12}
                  y={y - 12}
                  width={24}
                  height={24}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => onCellPointerDown(e, gx, gy)}
                />
              </g>
            );
          })}
        </svg>

        {/* Dot count overlay */}
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/85 backdrop-blur">
          <span className="font-jp tracking-wider">霰</span>{" "}
          <span className="text-washi-50">{dots.length}</span>
          <span className="opacity-50"> / {MIN_DOTS}–{MAX_DOTS}</span>
        </div>
      </StageFrame>

      <DotsBar count={dots.length} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onNext}
          disabled={dots.length < MIN_DOTS}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-30"
        >
          <Sparkles size={12} />
          次へ · 鋳型作り
        </button>
      </div>
    </div>
  );
}

function DotsBar({ count }: { count: number }) {
  const pct = Math.min(1, count / MIN_DOTS);
  return (
    <div className="flex w-56 flex-col items-center gap-1">
      <div className="h-[2px] w-full overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300 transition-[width] duration-150"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 2 — 鋳型作り (Kata-zukuri)
// ──────────────────────────────────────────────────────────────────────

function KataStep({
  mutedRef,
  dots,
  tamps,
  setTamps,
  onBack,
  onNext,
}: {
  mutedRef: RefObject<boolean>;
  dots: Dot[];
  tamps: number;
  setTamps: NumSetter;
  onBack: () => void;
  onNext: () => void;
}) {
  const [rodKick, setRodKick] = useState(0); // increments each tamp

  // Deterministic sand-grain sprinkle. Generated once with a seeded
  // PRNG so SSR and client paint match.
  const sandGrains = useMemo(() => {
    let s = 91;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 70 }, () => ({
      x: Math.round(20 + rng() * (VB - 40)),
      y: Math.round(KETTLE_CY - 110 + rng() * 200),
      r: 0.6 + rng() * 0.8,
      a: 0.25 + rng() * 0.45,
    }));
  }, []);

  const onTamp = (e: ReactPointerEvent<SVGRectElement>) => {
    e.preventDefault();
    setTamps((prev) => {
      if (prev >= TAMP_TARGET) return prev;
      playThud({ mutedRef, freqStart: 200, freqEnd: 80, duration: 0.3 });
      return prev + 1;
    });
    setRodKick((k) => k + 1);
  };

  // Rod position bounces with each tamp via key-driven CSS keyframe
  // (no transition needed — we re-mount via the kick counter).
  const tampProgress = Math.min(1, tamps / TAMP_TARGET);
  // Sand color darkens as the bond tightens.
  const sandTopColor = lerpColor("#caa472", "#5a4530", tampProgress);

  return (
    <div className="flex flex-col items-center gap-3">
      <StageFrame>
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          className="absolute inset-0 h-full w-full touch-none"
        >
          <SvgDefs />
          {/* Sand mound base (bottom half of the frame) */}
          <path
            d={`M 18 ${VB - 18}
                L 18 ${KETTLE_CY - 78}
                Q ${KETTLE_CX} ${KETTLE_CY - 138} ${VB - 18} ${KETTLE_CY - 78}
                L ${VB - 18} ${VB - 18} Z`}
            fill={sandTopColor}
            stroke="#3b2510"
            strokeWidth={1.4}
          />
          {/* Faint kettle silhouette buried inside the sand. Opacity
              fades as the mold packs in. */}
          <g opacity={Math.max(0.1, 0.55 - tampProgress * 0.45)}>
            <KettleSilhouette
              fill="rgba(20,11,4,0.65)"
              stroke="rgba(91,58,32,0.5)"
            />
            {dots.map((d) => {
              const { x, y } = gridPos(d.gx, d.gy);
              return (
                <RaisedDot key={`kd-${d.gx}-${d.gy}`} cx={x} cy={y} r={4} />
              );
            })}
          </g>
          {/* Sand grains sprinkled on top */}
          {sandGrains.map((g, i) => (
            <circle
              key={i}
              cx={g.x}
              cy={g.y}
              r={g.r}
              fill={`rgba(40,25,10,${g.a * (0.4 + tampProgress * 0.6)})`}
            />
          ))}
          {/* Tamping rod — vertical mallet that drops into the sand. */}
          <g key={`rod-${rodKick}`} className="nbt-rod">
            <rect
              x={KETTLE_CX - 8}
              y={18}
              width={16}
              height={70}
              fill="#5b3a20"
              rx={2}
            />
            <rect
              x={KETTLE_CX - 18}
              y={10}
              width={36}
              height={16}
              fill="#3b2510"
              rx={3}
            />
          </g>
          {/* Hit area covers the entire frame. */}
          <rect
            x={0}
            y={0}
            width={VB}
            height={VB}
            fill="transparent"
            style={{ cursor: tamps >= TAMP_TARGET ? "default" : "pointer" }}
            onPointerDown={onTamp}
          />
        </svg>

        {/* Tamp counter */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/85 backdrop-blur">
          <span className="font-jp tracking-wider">突き</span>{" "}
          <span className="text-washi-50">{tamps}</span>
          <span className="opacity-50"> / {TAMP_TARGET}</span>
        </div>
      </StageFrame>

      <TampDots count={tamps} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={tamps < TAMP_TARGET}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-30"
        >
          <Flame size={12} /> 次へ · 鋳込み
        </button>
      </div>

      <style jsx>{`
        :global(.nbt-rod) {
          transform-origin: center top;
          animation: nbt-rod-tamp 220ms ease-out;
        }
        @keyframes nbt-rod-tamp {
          0% {
            transform: translateY(-26px);
          }
          55% {
            transform: translateY(8px);
          }
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function TampDots({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: TAMP_TARGET }).map((_, i) => (
        <span
          key={i}
          className={`h-1 w-5 rounded-full transition-colors ${i < count ? "bg-amber-300" : "bg-washi-50/20"}`}
        />
      ))}
    </div>
  );
}

// Linear-blend two #rrggbb colors. Used for the sand→packed transition.
function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

// ──────────────────────────────────────────────────────────────────────
// Step 3 — 鋳込み (Ikomi)
// ──────────────────────────────────────────────────────────────────────

interface Spark {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

function IkomiStep({
  mutedRef,
  dots,
  pourFill,
  setPourFill,
  onBack,
  onNext,
}: {
  mutedRef: RefObject<boolean>;
  dots: Dot[];
  pourFill: number;
  setPourFill: (n: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const pouringRef = useRef(false);
  const pourStartRef = useRef(0);
  const pourBaseRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const [, forceTick] = useState(0);
  const sparkIdRef = useRef(0);
  // Local mirror of pourFill so the rAF closure sees the latest value
  // without re-creating the loop on every state change.
  const pourFillRefLocal = useRef(pourFill);
  useEffect(() => {
    pourFillRefLocal.current = pourFill;
  }, [pourFill]);

  // Single rAF loop: it advances pourFill while pressed, expires sparks,
  // and re-renders on each tick. Stopping is the cleanup.
  useEffect(() => {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      // Pour fill update
      if (pouringRef.current) {
        const elapsed = now - pourStartRef.current;
        const next = Math.min(
          1,
          pourBaseRef.current + elapsed / POUR_TARGET_MS,
        );
        // Commit when the delta crosses the threshold OR when we've
        // just hit the cap (next === 1) but the previous state hasn't
        // — otherwise the ref/state can stall a hair below 1.0 and the
        // "鋳込み完了" badge never lights up. Codex P1.
        const justClampedFull =
          next === 1 && pourFillRefLocal.current < 1;
        if (
          Math.abs(next - pourFillRefLocal.current) > 0.005 ||
          justClampedFull
        ) {
          pourFillRefLocal.current = next;
          setPourFill(next);
        }
        // Spawn sparks while pouring
        if (Math.random() < 0.6) {
          for (let i = 0; i < 3; i++) {
            sparksRef.current.push({
              id: ++sparkIdRef.current,
              x: KETTLE_CX + (Math.random() - 0.5) * 14,
              y: KETTLE_CY - KETTLE_RY + 20 + Math.random() * 10,
              vx: (Math.random() - 0.5) * 1.6,
              vy: -1 - Math.random() * 1.4,
              life: 0,
              maxLife: 22 + Math.random() * 18,
            });
          }
        }
      }
      // Spark physics
      for (const s of sparksRef.current) {
        s.life += dt / 16;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.06;
      }
      sparksRef.current = sparksRef.current.filter((s) => s.life < s.maxLife);
      forceTick((t) => (t + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [setPourFill]);

  const onPointerDown = (e: ReactPointerEvent<SVGRectElement>) => {
    if (pourFillRefLocal.current >= 1) return;
    e.preventDefault();
    pouringRef.current = true;
    pourBaseRef.current = pourFillRefLocal.current;
    pourStartRef.current = performance.now();
    // setPointerCapture can throw on synthetic / orphaned pointer ids.
    // The flag-and-timestamp work above is what actually drives the
    // fill loop, so capture failure must not abort the pour.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }
    playPour({ mutedRef, duration: 1.5 });
    playCrackle({ mutedRef, duration: 0.8 });
  };

  const onPointerUp = (e: ReactPointerEvent<SVGRectElement>) => {
    pouringRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* best-effort */
    }
  };

  // Filling visual: an amber liquid level rises inside the kettle's
  // interior ellipse. Use a clip-path so molten iron stays inside the
  // body silhouette.
  const fillTop = KETTLE_CY + KETTLE_RY - pourFill * (KETTLE_RY * 1.7);

  return (
    <div className="flex flex-col items-center gap-3">
      <StageFrame bg="linear-gradient(180deg,#1a0808 0%,#080302 100%)">
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          className="absolute inset-0 h-full w-full touch-none"
        >
          <SvgDefs />
          <clipPath id="kettleInterior">
            <ellipse
              cx={KETTLE_CX}
              cy={KETTLE_CY}
              rx={KETTLE_RX - 4}
              ry={KETTLE_RY - 4}
            />
          </clipPath>

          {/* Outer mold shell (sand mold from previous step, now black) */}
          <path
            d={`M 18 ${VB - 18}
                L 18 ${KETTLE_CY - 78}
                Q ${KETTLE_CX} ${KETTLE_CY - 138} ${VB - 18} ${KETTLE_CY - 78}
                L ${VB - 18} ${VB - 18} Z`}
            fill="url(#moldShellGrad)"
            stroke="#0a0604"
            strokeWidth={1.4}
          />
          {/* Pour spout funnel at top */}
          <path
            d={`M ${KETTLE_CX - 30} ${KETTLE_CY - KETTLE_RY - 22}
                L ${KETTLE_CX + 30} ${KETTLE_CY - KETTLE_RY - 22}
                L ${KETTLE_CX + 8} ${KETTLE_CY - KETTLE_RY + 4}
                L ${KETTLE_CX - 8} ${KETTLE_CY - KETTLE_RY + 4} Z`}
            fill="#1a120a"
            stroke="#3b2510"
            strokeWidth={1.4}
          />
          {/* Pouring stream (visible only while pressed) */}
          {pouringRef.current && (
            <rect
              x={KETTLE_CX - 4}
              y={KETTLE_CY - KETTLE_RY - 20}
              width={8}
              height={20}
              fill="url(#moltenIron)"
              opacity={0.95}
            />
          )}
          {/* Kettle interior fill */}
          <g clipPath="url(#kettleInterior)">
            <rect
              x={KETTLE_CX - KETTLE_RX}
              y={fillTop}
              width={KETTLE_RX * 2}
              height={KETTLE_RY * 2}
              fill="url(#moltenIron)"
            />
            {/* Surface ripple highlight */}
            {pourFill > 0.05 && (
              <ellipse
                cx={KETTLE_CX}
                cy={fillTop + 2}
                rx={KETTLE_RX - 8}
                ry={3}
                fill="rgba(255,235,180,0.55)"
              />
            )}
          </g>
          {/* Kettle silhouette outline glows hot once filled */}
          <KettleSilhouette
            fill="none"
            stroke={pourFill >= 1 ? "#ffb060" : "#5b3a20"}
            glow={pourFill >= 0.4}
          />
          {/* Hot raised dots show through */}
          {dots.map((d) => {
            const { x, y } = gridPos(d.gx, d.gy);
            return (
              <RaisedDot
                key={`id-${d.gx}-${d.gy}`}
                cx={x}
                cy={y}
                r={4}
                hot={pourFill >= 0.4}
              />
            );
          })}
          {/* Sparks layer */}
          {sparksRef.current.map((s) => {
            const a = 1 - s.life / s.maxLife;
            return (
              <circle
                key={s.id}
                cx={Math.round(s.x)}
                cy={Math.round(s.y)}
                r={1.4}
                fill={`rgba(255,210,120,${a.toFixed(2)})`}
              />
            );
          })}
          {/* Hit area */}
          <rect
            x={0}
            y={0}
            width={VB}
            height={VB}
            fill="transparent"
            style={{ cursor: pourFill >= 1 ? "default" : "pointer" }}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </svg>

        {/* Hold-to-pour callout */}
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/85 backdrop-blur">
          {pourFill >= 1 ? "充填完了" : "長押しで流す"}
        </div>
      </StageFrame>

      {/* Charge bar */}
      <div className="h-[3px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-orange-300"
          style={{ width: `${Math.round(pourFill * 100)}%` }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={pourFill < 1}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-30"
        >
          <Sparkles size={12} /> 次へ · 仕上げ
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 4 — 仕上げ (Shiage)
// ──────────────────────────────────────────────────────────────────────

function ShiageStep({
  mutedRef,
  dots,
  finalizingRef,
  finalizing,
  setFinalizing,
  mountedRef,
  onBack,
  onComplete,
}: {
  mutedRef: RefObject<boolean>;
  dots: Dot[];
  finalizingRef: RefObject<boolean>;
  finalizing: boolean;
  setFinalizing: (b: boolean) => void;
  mountedRef: RefObject<boolean>;
  onBack: () => void;
  onComplete: (dataUrl: string) => void;
}) {
  // Phase 1 — cooling (orange → black). Animated independently of the
  // polish phase. After COOL_DURATION_MS we unlock dragging.
  const [coolStart] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const rafRef = useRef<number | null>(null);
  // setTimeout ids for the deferred onComplete navigation. Tracked so
  // we can cancel pending timers on unmount and never invoke
  // onComplete (which navigates) against a torn-down tree.
  const finalTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const loop = () => {
      setNow(performance.now());
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      for (const id of finalTimersRef.current) clearTimeout(id);
      finalTimersRef.current = [];
    };
  }, []);
  const coolT = Math.min(1, (now - coolStart) / COOL_DURATION_MS);
  const cooled = coolT >= 1;

  // Phase 2 — polish. Track which cells of a polish grid have been
  // visited by the user's drag so coverage maps to a percentage.
  const polishedRef = useRef<Set<string>>(new Set());
  const [, polishTick] = useState(0);
  const polishingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastPolishPlay = useRef(0);

  const polishedFraction = Math.min(1, polishedRef.current.size / POLISH_TARGET);
  const polishComplete = polishedFraction >= 1;

  function visitFromClient(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const inv = ctm.inverse();
    const local = pt.matrixTransform(inv);
    // Only register polish strokes inside the kettle ellipse.
    const dx = (local.x - KETTLE_CX) / KETTLE_RX;
    const dy = (local.y - KETTLE_CY) / KETTLE_RY;
    if (dx * dx + dy * dy > 1) return;
    const gx = Math.floor(((local.x - (KETTLE_CX - KETTLE_RX)) / (KETTLE_RX * 2)) * POLISH_GRID);
    const gy = Math.floor(((local.y - (KETTLE_CY - KETTLE_RY)) / (KETTLE_RY * 2)) * POLISH_GRID);
    const key = `${gx}-${gy}`;
    if (!polishedRef.current.has(key)) {
      polishedRef.current.add(key);
      polishTick((t) => (t + 1) % 1_000_000);
      const t = performance.now();
      if (t - lastPolishPlay.current > 90) {
        lastPolishPlay.current = t;
        playClick({ mutedRef, freq: 1100 + Math.random() * 600, duration: 0.04 });
      }
    }
  }

  const onPointerDown = (e: ReactPointerEvent<SVGRectElement>) => {
    if (!cooled || polishComplete) return;
    e.preventDefault();
    polishingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }
    visitFromClient(e.clientX, e.clientY);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGRectElement>) => {
    if (!polishingRef.current) return;
    visitFromClient(e.clientX, e.clientY);
  };
  const onPointerUp = (e: ReactPointerEvent<SVGRectElement>) => {
    polishingRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* best-effort */
    }
  };

  const finalize = useCallback(() => {
    // Re-entrancy guard: a rapid double click on 完成 would otherwise
    // fire onComplete twice — and onComplete persists work + navigates.
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    setFinalizing(true);
    playChime({ mutedRef, freq: 880 });
    playMetalRing({ mutedRef, freq: 660, duration: 0.9 });

    // Render the final kettle to a square offscreen canvas so the
    // saved work card looks crisp. Done synchronously; if rendering
    // fails (no canvas API) we still navigate with an empty dataUrl.
    let dataUrl = "";
    try {
      const size = 640;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) drawFinishedKettle(ctx, size, dots);
      dataUrl = canvas.toDataURL("image/png");
    } catch {
      /* best-effort */
    }
    // Defer the navigation so the chime has a beat to land.
    finalTimersRef.current.push(
      setTimeout(() => {
        if (!mountedRef.current) return;
        onComplete(dataUrl);
      }, 1200),
    );
  }, [dots, finalizingRef, mountedRef, mutedRef, onComplete, setFinalizing]);

  // Hot→cool body fill — orange while coolT < 1, black after.
  const bodyFill = cooled
    ? "url(#kettleBody)"
    : `rgb(${Math.round(255 - (255 - 30) * coolT)},${Math.round(176 - (176 - 21) * coolT)},${Math.round(96 - (96 - 9) * coolT)})`;

  return (
    <div className="flex flex-col items-center gap-3">
      <StageFrame bg="linear-gradient(180deg,#160a05 0%,#070302 100%)">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB} ${VB}`}
          className="absolute inset-0 h-full w-full touch-none"
        >
          <SvgDefs />
          <KettleSilhouette
            fill={bodyFill}
            stroke={cooled ? "#5b3a20" : "#ffb060"}
            glow={!cooled}
          />
          {dots.map((d) => {
            const { x, y } = gridPos(d.gx, d.gy);
            const polishedNow = polishedFraction > 0 && cooled;
            return (
              <RaisedDot
                key={`sd-${d.gx}-${d.gy}`}
                cx={x}
                cy={y}
                r={5}
                polished={polishedNow}
                hot={!cooled}
              />
            );
          })}
          {/* Polish sheen — ellipse highlight whose opacity scales with
              polished coverage. Sits above the body, below the dots
              effectively (we draw dots last for raised feel). */}
          {cooled && polishedFraction > 0 && (
            <ellipse
              cx={KETTLE_CX - 22}
              cy={KETTLE_CY - 24}
              rx={32}
              ry={50}
              fill="rgba(220,200,180,0.25)"
              opacity={polishedFraction}
              style={{ filter: "blur(8px)" }}
            />
          )}
          {/* Drag surface (hit area) */}
          <rect
            x={0}
            y={0}
            width={VB}
            height={VB}
            fill="transparent"
            style={{
              cursor: !cooled
                ? "wait"
                : polishComplete
                  ? "default"
                  : "grab",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </svg>

        {/* Phase indicator */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/85 backdrop-blur">
          {!cooled ? (
            <span>冷却中 · {Math.round(coolT * 100)}%</span>
          ) : polishComplete ? (
            <span>磨き上げ完了</span>
          ) : (
            <span>ドラッグで研磨 · {Math.round(polishedFraction * 100)}%</span>
          )}
        </div>
      </StageFrame>

      {/* Cooling / polish bar */}
      <div className="h-[3px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300"
          style={{
            width: `${Math.round((cooled ? polishedFraction : coolT) * 100)}%`,
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={finalizing}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10 disabled:opacity-30"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
        <button
          type="button"
          onClick={finalize}
          disabled={!polishComplete || finalizing}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-30"
        >
          <Check size={12} /> 完成
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Final canvas render — used to seed the saved work card.
// Mirrors the SVG silhouette so the user sees their own dot pattern.
// ──────────────────────────────────────────────────────────────────────

function drawFinishedKettle(
  ctx: CanvasRenderingContext2D,
  size: number,
  dots: Dot[],
) {
  const k = size / VB;
  // Background
  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.55,
    size * 0.05,
    size * 0.5,
    size * 0.55,
    size * 0.7,
  );
  grad.addColorStop(0, "#1f140a");
  grad.addColorStop(1, "#070302");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Yoke
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#5b3a20";
  ctx.lineWidth = 5 * k;
  ctx.beginPath();
  const top = (KETTLE_CY - KETTLE_RY) * k;
  ctx.moveTo((KETTLE_CX - 70) * k, top + 4 * k);
  ctx.quadraticCurveTo(
    KETTLE_CX * k,
    top - 70 * k,
    (KETTLE_CX + 70) * k,
    top + 4 * k,
  );
  ctx.stroke();

  // Lid
  ctx.fillStyle = "#5b3a20";
  ctx.beginPath();
  ctx.ellipse(KETTLE_CX * k, top + 6 * k, 36 * k, 6 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect((KETTLE_CX - 7) * k, (top - 8 * k), 14 * k, 14 * k);

  // Spout
  ctx.fillStyle = "#241509";
  ctx.strokeStyle = "#5b3a20";
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo((KETTLE_CX + KETTLE_RX - 6) * k, (KETTLE_CY - 22) * k);
  ctx.quadraticCurveTo(
    (KETTLE_CX + KETTLE_RX + 30) * k,
    (KETTLE_CY - 38) * k,
    (KETTLE_CX + KETTLE_RX + 34) * k,
    (KETTLE_CY - 14) * k,
  );
  ctx.quadraticCurveTo(
    (KETTLE_CX + KETTLE_RX + 12) * k,
    (KETTLE_CY + 4) * k,
    (KETTLE_CX + KETTLE_RX - 6) * k,
    (KETTLE_CY + 6) * k,
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Body
  const bodyGrad = ctx.createLinearGradient(
    0,
    (KETTLE_CY - KETTLE_RY) * k,
    0,
    (KETTLE_CY + KETTLE_RY) * k,
  );
  bodyGrad.addColorStop(0, "#3b2510");
  bodyGrad.addColorStop(0.6, "#241509");
  bodyGrad.addColorStop(1, "#0e0703");
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = "#5b3a20";
  ctx.lineWidth = 2.5 * k;
  ctx.beginPath();
  ctx.ellipse(
    KETTLE_CX * k,
    KETTLE_CY * k,
    KETTLE_RX * k,
    KETTLE_RY * k,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.stroke();

  // Polished sheen highlight
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(
    KETTLE_CX * k,
    KETTLE_CY * k,
    KETTLE_RX * k - 2,
    KETTLE_RY * k - 2,
    0,
    0,
    Math.PI * 2,
  );
  ctx.clip();
  const sheen = ctx.createRadialGradient(
    (KETTLE_CX - 22) * k,
    (KETTLE_CY - 24) * k,
    4 * k,
    (KETTLE_CX - 22) * k,
    (KETTLE_CY - 24) * k,
    60 * k,
  );
  sheen.addColorStop(0, "rgba(220,200,180,0.4)");
  sheen.addColorStop(1, "rgba(220,200,180,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // Raised dots — 3D feel via radial gradient + drop shadow.
  for (const d of dots) {
    const { x, y } = gridPos(d.gx, d.gy);
    const cx = x * k;
    const cy = y * k;
    const r = 5 * k;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 2 * k;
    ctx.shadowOffsetY = 1 * k;
    const dotGrad = ctx.createRadialGradient(
      cx - r * 0.32,
      cy - r * 0.32,
      0,
      cx,
      cy,
      r,
    );
    dotGrad.addColorStop(0, "#cfb892");
    dotGrad.addColorStop(0.4, "#5b3a20");
    dotGrad.addColorStop(1, "#0a0604");
    ctx.fillStyle = dotGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Specular highlight
    ctx.fillStyle = "rgba(255,235,200,0.5)";
    ctx.beginPath();
    ctx.arc(cx - r * 0.32, cy - r * 0.32, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
