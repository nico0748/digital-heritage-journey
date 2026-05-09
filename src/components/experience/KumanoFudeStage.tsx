"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  ArrowLeft,
  Brush,
  Check,
  Circle,
  Layers,
  Scissors,
} from "lucide-react";
import {
  playBrush,
  playChime,
  playClick,
  playFold,
  useMutedRef,
} from "@/lib/craftAudio";

// ─────────────────────────────────────────────────────────────────────
// Step definitions (kanji + romaji + description per step).
// ─────────────────────────────────────────────────────────────────────

type StepId = "ke-erabi" | "kezuri" | "musubi" | "tameshigaki";
const STEP_IDS: StepId[] = ["ke-erabi", "kezuri", "musubi", "tameshigaki"];

interface StepDef {
  jp: string;
  romaji: string;
  description: string;
  hint: string;
}

const STEPS: Record<StepId, StepDef> = {
  "ke-erabi": {
    jp: "毛選び",
    romaji: "Ke-erabi",
    description: "獣毛の配合を決める",
    hint: "獣毛は性質が違う。配合で書き味が決まる。",
  },
  kezuri: {
    jp: "毛揃え",
    romaji: "Kezuri",
    description: "穂先を揃える",
    hint: "逆毛(さかげ)を抜いて穂先を揃える。一本一本、指の感覚で。",
  },
  musubi: {
    jp: "糸結び",
    romaji: "Musubi",
    description: "絹糸で根元を巻く",
    hint: "絹糸で根元を縛り、漆で固める。熊野の木軸印は職人の証。",
  },
  tameshigaki: {
    jp: "試し書き",
    romaji: "Tameshigaki",
    description: "完成した筆で書く",
    hint: "自分で作った筆で書く。配合の差が線に出る。",
  },
};

// ─────────────────────────────────────────────────────────────────────
// Hair palette — 4 animal hairs with distinct hardness/ink behavior.
// hardness 0..1 affects drag resistance (kezuri) and stroke variability.
// ink 0..1 affects line opacity/saturation in tameshigaki.
// ─────────────────────────────────────────────────────────────────────

type HairId = "yagi" | "tanuki" | "uma" | "shika";

interface HairDef {
  id: HairId;
  jp: string;
  romaji: string;
  property: string;
  color: string;
  hardness: number;
  ink: number;
}

const HAIRS: HairDef[] = [
  {
    id: "yagi",
    jp: "山羊毛",
    romaji: "Yagi",
    property: "柔・吸墨良",
    color: "#efe1bb",
    hardness: 0.15,
    ink: 0.95,
  },
  {
    id: "tanuki",
    jp: "狸毛",
    romaji: "Tanuki",
    property: "硬・コシ強",
    color: "#5b3a1f",
    hardness: 0.95,
    ink: 0.45,
  },
  {
    id: "uma",
    jp: "馬毛",
    romaji: "Uma",
    property: "平均・万能",
    color: "#9c7546",
    hardness: 0.55,
    ink: 0.6,
  },
  {
    id: "shika",
    jp: "鹿毛",
    romaji: "Shika",
    property: "弾力・耐久",
    color: "#a04a26",
    hardness: 0.7,
    ink: 0.5,
  },
];

type Mix = Record<HairId, number>;
const DEFAULT_MIX: Mix = { yagi: 60, tanuki: 20, uma: 10, shika: 10 };

const KEZURI_TARGET = 10;
const MUSUBI_TARGET = 4;

interface BrushFeel {
  hardness: number;
  ink: number;
  width: number;
  spread: number;
}

function computeFeel(mix: Mix): BrushFeel {
  const total = HAIRS.reduce((s, h) => s + mix[h.id], 0) || 1;
  let hardness = 0;
  let ink = 0;
  for (const h of HAIRS) {
    const w = mix[h.id] / total;
    hardness += h.hardness * w;
    ink += h.ink * w;
  }
  // Soft + ink-rich hair → wider, more ink-pooling. Hard hair → thin, sharp.
  const width = 5 + (1 - hardness) * 16 + ink * 4;
  const spread = 0.4 + (1 - hardness) * 1.4;
  return { hardness, ink, width, spread };
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

export function KumanoFudeStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const mutedRef = useMutedRef();
  const [stepIdx, setStepIdx] = useState(0);
  const [mix, setMix] = useState<Mix>(DEFAULT_MIX);
  const stepId = STEP_IDS[stepIdx];
  const stepDef = STEPS[stepId];

  // Single re-entry guard for the final onComplete handoff. Without
  // this, a rapid double-click on Complete would queue two router
  // pushes and write the work blob twice.
  const finalizingRef = useRef(false);
  const mountedRef = useRef(true);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  const goNext = useCallback(() => {
    setStepIdx((i) => Math.min(STEP_IDS.length - 1, i + 1));
  }, []);

  const goPrev = useCallback(() => {
    if (finalizingRef.current) return;
    playClick({ mutedRef });
    setStepIdx((i) => Math.max(0, i - 1));
  }, [mutedRef]);

  const feel = useMemo(() => computeFeel(mix), [mix]);

  const finalize = useCallback(
    (dataUrl: string) => {
      if (finalizingRef.current) return;
      finalizingRef.current = true;
      playChime({ mutedRef });
      // Tiny delay so the chime is audible before the route swap.
      finishTimerRef.current = setTimeout(() => {
        if (mountedRef.current) onComplete(dataUrl);
      }, 700);
    },
    [mutedRef, onComplete],
  );

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      {/* Step indicator: Step N / TOTAL · 工程名 */}
      <p className="flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Brush size={14} />
        Step {stepIdx + 1} / {STEP_IDS.length} ·{" "}
        <span className="font-jp tracking-wider text-washi-50/95">
          {stepDef.jp}
        </span>
      </p>

      {/* Educational sub-text per step. */}
      <div className="text-center">
        <p className="font-jp text-sm tracking-wider text-washi-50/90">
          {stepDef.hint}
        </p>
        <p className="mt-1 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/45">
          {stepDef.romaji} · {stepDef.description}
        </p>
      </div>

      {/* Recipe badge — visible from step 2 onward, since the mix is fixed. */}
      {stepIdx > 0 && (
        <div className="rounded-full border border-washi-50/15 bg-black/35 px-3 py-1 backdrop-blur">
          <span className="font-jp text-[0.62rem] tracking-wider text-washi-50/85">
            熊野筆 · 山羊{mix.yagi}% / 狸{mix.tanuki}% / 馬{mix.uma}% / 鹿{mix.shika}%
          </span>
        </div>
      )}

      {stepId === "ke-erabi" && (
        <KeerabiStep mix={mix} setMix={setMix} mutedRef={mutedRef} onNext={goNext} />
      )}
      {stepId === "kezuri" && (
        <KezuriStep feel={feel} mutedRef={mutedRef} onNext={goNext} />
      )}
      {stepId === "musubi" && (
        <MusubiStep mutedRef={mutedRef} onNext={goNext} />
      )}
      {stepId === "tameshigaki" && (
        <TameshigakiStep
          feel={feel}
          mutedRef={mutedRef}
          onComplete={finalize}
          finalizingRef={finalizingRef}
        />
      )}

      {/* 「前へ戻る」on every step except the first. */}
      {stepIdx > 0 && (
        <button
          type="button"
          onClick={goPrev}
          className="inline-flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/55 transition hover:text-washi-50"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — 毛選び (Ke-erabi): mix four hair types totalling 100%.
// ─────────────────────────────────────────────────────────────────────

function KeerabiStep({
  mix,
  setMix,
  mutedRef,
  onNext,
}: {
  mix: Mix;
  setMix: Dispatch<SetStateAction<Mix>>;
  mutedRef: RefObject<boolean>;
  onNext: () => void;
}) {
  const lastTickRef = useRef(0);

  // Moving one slider rebalances the other three proportionally so the
  // total always lands on exactly 100%. Without this users would have
  // to micro-adjust four sliders to validate — frustrating for a
  // demo-grade interaction.
  function setPercent(target: HairId, raw: number) {
    const v = Math.max(0, Math.min(100, Math.round(raw)));
    const others = HAIRS.filter((h) => h.id !== target);
    const remain = 100 - v;
    const otherSum = others.reduce((s, h) => s + mix[h.id], 0);
    const next: Mix = { ...mix, [target]: v };
    if (otherSum <= 0) {
      const each = Math.floor(remain / others.length);
      let leftover = remain - each * others.length;
      for (const h of others) {
        next[h.id] = each + (leftover > 0 ? 1 : 0);
        if (leftover > 0) leftover--;
      }
    } else {
      let assigned = 0;
      others.forEach((h, idx) => {
        if (idx === others.length - 1) {
          next[h.id] = remain - assigned;
        } else {
          const share = Math.round((mix[h.id] / otherSum) * remain);
          next[h.id] = share;
          assigned += share;
        }
      });
    }
    // Defensive clamp + total fix-up.
    for (const h of HAIRS) next[h.id] = Math.max(0, next[h.id]);
    const total = HAIRS.reduce((s, h) => s + next[h.id], 0);
    if (total !== 100) {
      const lastH = others[others.length - 1].id;
      next[lastH] = Math.max(0, next[lastH] + (100 - total));
    }
    setMix(next);

    const now = performance.now();
    if (now - lastTickRef.current > 35) {
      lastTickRef.current = now;
      const idx = HAIRS.findIndex((h) => h.id === target);
      playClick({ mutedRef, freq: 1500 + idx * 150 });
    }
  }

  const total = HAIRS.reduce((s, h) => s + mix[h.id], 0);
  const valid = total === 100;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <PieMix mix={mix} />
      <div className="grid w-[min(92vw,32rem)] grid-cols-1 gap-3 sm:grid-cols-2">
        {HAIRS.map((h) => (
          <div
            key={h.id}
            className="rounded-sm border border-washi-50/15 bg-black/30 px-3 py-2 backdrop-blur"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="block h-3 w-3 rounded-full border border-black/20"
                  style={{ background: h.color }}
                />
                <span className="font-jp text-sm tracking-wider text-washi-50">
                  {h.jp}
                </span>
                <span className="text-[0.55rem] uppercase tracking-[0.3em] text-washi-50/45">
                  {h.romaji}
                </span>
              </div>
              <span className="font-jp text-[0.7rem] tabular-nums text-washi-50/85">
                {mix[h.id]}%
              </span>
            </div>
            <p className="mt-0.5 font-jp text-[0.6rem] tracking-wider text-washi-50/55">
              {h.property}
            </p>
            <input
              type="range"
              min={0}
              max={100}
              value={mix[h.id]}
              onChange={(e) => setPercent(h.id, Number(e.target.value))}
              className="mt-2 w-full accent-washi-50"
              aria-label={`${h.jp} percentage`}
            />
          </div>
        ))}
      </div>

      <p className="text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/45">
        total {total}%
      </p>

      <button
        type="button"
        onClick={onNext}
        disabled={!valid}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        次へ — 毛揃え <Scissors size={12} />
      </button>
    </div>
  );
}

function PieMix({ mix }: { mix: Mix }) {
  const total = HAIRS.reduce((s, h) => s + mix[h.id], 0) || 1;
  const cx = 60;
  const cy = 60;
  const r = 48;
  let acc = 0;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32">
      <circle cx={cx} cy={cy} r={r + 4} fill="rgba(0,0,0,0.4)" />
      {HAIRS.map((h) => {
        const v = mix[h.id];
        if (v <= 0) return null;
        const startAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
        acc += v;
        const endAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
        const large = endAngle - startAngle > Math.PI ? 1 : 0;
        const x1 = Number((cx + r * Math.cos(startAngle)).toFixed(2));
        const y1 = Number((cy + r * Math.sin(startAngle)).toFixed(2));
        const x2 = Number((cx + r * Math.cos(endAngle)).toFixed(2));
        const y2 = Number((cy + r * Math.sin(endAngle)).toFixed(2));
        // Single-slice (100%) — render as full circle to avoid degenerate arc.
        if (v === total) {
          return (
            <circle
              key={h.id}
              cx={cx}
              cy={cy}
              r={r}
              fill={h.color}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={0.5}
            />
          );
        }
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        return (
          <path
            key={h.id}
            d={d}
            fill={h.color}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={0.5}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={18} fill="#1d130a" />
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontSize="14"
        fill="#FBF7F0"
        className="font-jp"
      >
        筆
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — 毛揃え (Kezuri): horizontal swipe to align bristle tips.
// Drag resistance scales with the mix's average hardness — a 狸-heavy
// brush requires longer sweeps.
// ─────────────────────────────────────────────────────────────────────

function KezuriStep({
  feel,
  mutedRef,
  onNext,
}: {
  feel: BrushFeel;
  mutedRef: RefObject<boolean>;
  onNext: () => void;
}) {
  const W = 480;
  const H = 360;
  const [count, setCount] = useState(0);
  const lastXRef = useRef<number | null>(null);
  const dirRef = useRef<"left" | "right" | null>(null);
  const distRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // Threshold (px) of swept distance before a direction-reversal counts
  // as one stroke. Hard mix → up to ~150px; soft mix → ~60px.
  const threshold = 60 + 90 * feel.hardness;

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (count >= KEZURI_TARGET) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastXRef.current = e.clientX;
    dirRef.current = null;
    distRef.current = 0;
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    lastXRef.current = null;
    dirRef.current = null;
    distRef.current = 0;
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (lastXRef.current === null) return;
    const dx = e.clientX - lastXRef.current;
    if (Math.abs(dx) < 1) return;
    const dir: "left" | "right" = dx > 0 ? "right" : "left";
    if (dirRef.current === null) {
      dirRef.current = dir;
      distRef.current = 0;
    } else if (dir !== dirRef.current) {
      if (distRef.current > threshold) {
        playBrush({ mutedRef, duration: 0.22 });
        setCount((n) => {
          const next = Math.min(KEZURI_TARGET, n + 1);
          if (next >= KEZURI_TARGET && !advanceTimerRef.current) {
            advanceTimerRef.current = setTimeout(() => onNext(), 700);
          }
          return next;
        });
      }
      dirRef.current = dir;
      distRef.current = 0;
    } else {
      distRef.current += Math.abs(dx);
    }
    lastXRef.current = e.clientX;
  }

  const align = Math.min(1, count / KEZURI_TARGET);

  // Deterministic bristle layout — same on server and client to avoid
  // hydration drift.
  const bristles = useMemo(() => {
    let s = 11;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 38 }, (_, i) => ({
      i,
      hueIdx: Math.floor(rng() * HAIRS.length),
      messyAngle: (rng() - 0.5) * 0.85,
      length: 110 + rng() * 32,
      offset: (i - 18.5) * 5 + (rng() - 0.5) * 6,
    }));
  }, []);

  return (
    <div className="relative h-[min(60vh,28rem)] w-[min(92vw,32rem)] overflow-hidden rounded-sm border border-washi-50/10 bg-[#1d130a] shadow-2xl shadow-black/60">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full cursor-ew-resize touch-none"
      >
        <defs>
          <radialGradient id="kezuri-vignette" cx="50%" cy="60%" r="65%">
            <stop offset="0%" stopColor="#3a2614" stopOpacity="1" />
            <stop offset="100%" stopColor="#0e0905" stopOpacity="1" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#kezuri-vignette)" />

        {/* Workbench line. */}
        <line
          x1={0}
          y1={H * 0.85}
          x2={W}
          y2={H * 0.85}
          stroke="rgba(255,220,170,0.08)"
          strokeWidth={1}
        />

        {/* Bristle bundle, root anchored near the bottom centre. As
            `align` goes 0 → 1, messy angles collapse and offsets pull in. */}
        <g transform={`translate(${W / 2}, ${H * 0.85})`}>
          {bristles.map((b) => {
            const ang = b.messyAngle * (1 - align);
            const offsetNow = b.offset * (1 - align * 0.55);
            const tipX = Number(
              (offsetNow + Math.sin(ang) * b.length * (1 - align * 0.35)).toFixed(2),
            );
            const tipY = Number((-Math.cos(ang) * b.length).toFixed(2));
            const c = HAIRS[b.hueIdx]?.color ?? "#a5784a";
            return (
              <line
                key={b.i}
                x1={0}
                y1={0}
                x2={tipX}
                y2={tipY}
                stroke={c}
                strokeWidth={1.6}
                strokeLinecap="round"
                opacity={0.85}
              />
            );
          })}
          {/* Root cap — visual anchor where wrap will go in next step. */}
          <ellipse cx={0} cy={4} rx={28} ry={6} fill="#0a0604" />
        </g>

        <text
          x={W / 2}
          y={28}
          textAnchor="middle"
          className="font-jp"
          fill="#FBF7F0"
          fontSize="11"
          opacity="0.7"
        >
          ← 横にドラッグして穂先を揃える →
        </text>
      </svg>

      <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/40 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/80 backdrop-blur">
        {count} / {KEZURI_TARGET}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 h-[2px] w-44 -translate-x-1/2 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-washi-50 transition-[width] duration-150"
          style={{ width: `${align * 100}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3 — 糸結び (Musubi): rotational drag wraps thread at the root.
// ─────────────────────────────────────────────────────────────────────

function MusubiStep({
  mutedRef,
  onNext,
}: {
  mutedRef: RefObject<boolean>;
  onNext: () => void;
}) {
  const W = 480;
  const H = 380;
  const cx = W / 2;
  const cy = H * 0.5;
  const [wraps, setWraps] = useState(0);
  const lastAngleRef = useRef<number | null>(null);
  const accumRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  function angleFromEvent(e: React.PointerEvent<SVGSVGElement>): number {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return Math.atan2(y - cy, x - cx);
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (wraps >= MUSUBI_TARGET) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastAngleRef.current = angleFromEvent(e);
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    lastAngleRef.current = null;
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (lastAngleRef.current === null) return;
    const a = angleFromEvent(e);
    let da = a - lastAngleRef.current;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    accumRef.current += Math.abs(da);
    lastAngleRef.current = a;
    if (accumRef.current >= Math.PI * 2) {
      accumRef.current -= Math.PI * 2;
      playFold({ mutedRef });
      setWraps((n) => {
        const next = Math.min(MUSUBI_TARGET, n + 1);
        if (next >= MUSUBI_TARGET && !advanceTimerRef.current) {
          advanceTimerRef.current = setTimeout(() => onNext(), 900);
        }
        return next;
      });
    }
  }

  const handleVisible = wraps >= MUSUBI_TARGET;
  const wrapBandTop = 6;
  const wrapBandHeight = 30;

  // Tapered bristle bundle (above root). Deterministic.
  const bristles = useMemo(() => {
    let s = 41;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 32 }, (_, i) => ({
      i,
      hueIdx: Math.floor(rng() * HAIRS.length),
      offset: (i - 15.5) * 4 + (rng() - 0.5) * 1.6,
    }));
  }, []);

  return (
    <div className="relative h-[min(60vh,28rem)] w-[min(92vw,32rem)] overflow-hidden rounded-sm border border-washi-50/10 bg-[#1d130a] shadow-2xl shadow-black/60">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
      >
        <defs>
          <radialGradient id="musubi-bg" cx="50%" cy="55%" r="65%">
            <stop offset="0%" stopColor="#3a2614" />
            <stop offset="100%" stopColor="#0a0604" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#musubi-bg)" />

        <g transform={`translate(${cx}, ${cy})`}>
          {/* Bristle bundle, narrowing toward tip. */}
          {bristles.map((b) => {
            const tipX = Number((b.offset * 0.4).toFixed(2));
            const tipY = -120;
            const baseX = Number((b.offset).toFixed(2));
            const c = HAIRS[b.hueIdx]?.color ?? "#caa173";
            return (
              <line
                key={b.i}
                x1={baseX}
                y1={0}
                x2={tipX}
                y2={tipY}
                stroke={c}
                strokeWidth={1.4}
                strokeLinecap="round"
                opacity={0.9}
              />
            );
          })}

          {/* Wood handle — appears once enough wraps are made. */}
          {handleVisible && (
            <g>
              <rect x={-22} y={wrapBandTop + wrapBandHeight + 2} width={44} height={120} fill="#3a1f10" />
              <rect
                x={-22}
                y={wrapBandTop + wrapBandHeight + 2}
                width={44}
                height={120}
                fill="none"
                stroke="#1a0c06"
                strokeWidth={1}
              />
              {/* 「熊野」maker's mark — wood-burned into the handle. */}
              <text
                x={0}
                y={wrapBandTop + wrapBandHeight + 60}
                textAnchor="middle"
                className="font-jp"
                fontSize="13"
                fill="#d8b88a"
              >
                熊野
              </text>
              <text
                x={0}
                y={wrapBandTop + wrapBandHeight + 82}
                textAnchor="middle"
                fontSize="6"
                fill="#a48054"
                letterSpacing="2"
              >
                KUMANO
              </text>
            </g>
          )}

          {/* Thread wraps as horizontal silk bands at the root. */}
          {Array.from({ length: wraps }).map((_, i) => {
            const bandH = wrapBandHeight / MUSUBI_TARGET;
            const y = wrapBandTop + i * bandH;
            const fill = i % 2 === 0 ? "#ede5cc" : "#d6cca6";
            return (
              <rect
                key={i}
                x={-23}
                y={y}
                width={46}
                height={bandH + 0.6}
                fill={fill}
                stroke="rgba(0,0,0,0.25)"
                strokeWidth={0.5}
              />
            );
          })}
        </g>

        <text
          x={W / 2}
          y={28}
          textAnchor="middle"
          className="font-jp"
          fill="#FBF7F0"
          fontSize="11"
          opacity="0.7"
        >
          ぐるりと回して糸を巻く
        </text>

        {/* Subtle rotation guide ring. */}
        <circle
          cx={cx}
          cy={cy}
          r={70}
          fill="none"
          stroke="rgba(255,220,170,0.08)"
          strokeWidth={1}
          strokeDasharray="4 6"
        />
      </svg>

      <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/40 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/80 backdrop-blur">
        {wraps} / {MUSUBI_TARGET} 巻
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 h-[2px] w-44 -translate-x-1/2 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-washi-50 transition-[width] duration-150"
          style={{ width: `${(wraps / MUSUBI_TARGET) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 4 — 試し書き (Tameshigaki): freehand drawing on washi.
// Stroke width / opacity / spread driven by the user's hair mix.
// ─────────────────────────────────────────────────────────────────────

type InkColor = "sumi" | "shu" | "ai" | "kin";

interface InkDef {
  jp: string;
  hex: string;
  rampPrefix: string;
}

const INKS: Record<InkColor, InkDef> = {
  sumi: { jp: "墨", hex: "#0c0a08", rampPrefix: "rgba(12,10,8," },
  shu: { jp: "朱", hex: "#a82a1c", rampPrefix: "rgba(168,42,28," },
  ai: { jp: "藍", hex: "#234b88", rampPrefix: "rgba(35,75,136," },
  kin: { jp: "金", hex: "#bd923a", rampPrefix: "rgba(189,146,58," },
};
const INK_KEYS = Object.keys(INKS) as InkColor[];

function TameshigakiStep({
  feel,
  mutedRef,
  onComplete,
  finalizingRef,
}: {
  feel: BrushFeel;
  mutedRef: RefObject<boolean>;
  onComplete: (dataUrl: string) => void;
  finalizingRef: RefObject<boolean>;
}) {
  const W = 520;
  const H = 380;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef<InkColor>("sumi");
  const [color, setColor] = useState<InkColor>("sumi");
  const [hasInk, setHasInk] = useState(false);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const distSinceSoundRef = useRef(0);

  // Sync ref with state — used inside pointer handlers (refs avoid
  // stale closure issues).
  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  // One-time washi paper paint. Keep this simple — the canvas is the
  // user's work surface; effects in render belong on top.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = W;
    canvas.height = H;
    paintWashi(ctx, W, H);
  }, []);

  function paintWashi(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#fbf5e0");
    grad.addColorStop(1, "#ece2bf");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(120,95,60,0.07)";
    ctx.lineWidth = 0.6;
    let s = 9;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 90; i++) {
      const x0 = rng() * w;
      const y0 = rng() * h;
      const len = 30 + rng() * 70;
      const ang = rng() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      ctx.stroke();
    }
  }

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  function paintDot(x: number, y: number) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const ink = INKS[colorRef.current];
    const r = feel.width * 0.55;
    const opacity = 0.55 + feel.ink * 0.4;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `${ink.rampPrefix}${opacity})`);
    grad.addColorStop(1, `${ink.rampPrefix}0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintSegment(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    speed: number,
  ) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const ink = INKS[colorRef.current];
    const opacity = 0.55 + feel.ink * 0.4;
    const speedFactor = Math.min(1, speed * 0.8);
    // Soft hairs flare wide and dab; hard hairs hold a thin line even at
    // speed. This is what visibly differentiates the mixes.
    const w = Math.max(
      1.2,
      feel.width * (1 - speedFactor * 0.55 * (1 - feel.hardness)),
    );
    ctx.strokeStyle = `${ink.rampPrefix}${opacity})`;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Soft-hair spatter: extra ink dots near the stroke. Skip for
    // hard-bristle mixes so the line stays clean.
    if (feel.spread > 1 && Math.random() < (feel.spread - 1) * 0.5) {
      const ang = Math.random() * Math.PI * 2;
      const r = w * 0.6 * Math.random();
      const sx = x2 + Math.cos(ang) * r * feel.spread;
      const sy = y2 + Math.sin(ang) * r * feel.spread;
      ctx.fillStyle = `${ink.rampPrefix}${opacity * 0.5})`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.6, w * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (finalizingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    drawingRef.current = true;
    lastPtRef.current = { x: p.x, y: p.y, t: performance.now() };
    distSinceSoundRef.current = 0;
    paintDot(p.x, p.y);
    playBrush({ mutedRef, duration: 0.18 });
    if (!hasInk) setHasInk(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const last = lastPtRef.current;
    if (!last) return;
    const p = canvasPoint(e);
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1.2) return;
    const t = performance.now();
    const dt = Math.max(8, t - last.t);
    const speed = dist / dt;
    paintSegment(last.x, last.y, p.x, p.y, speed);
    lastPtRef.current = { x: p.x, y: p.y, t };
    distSinceSoundRef.current += dist;
    if (distSinceSoundRef.current > 80) {
      distSinceSoundRef.current = 0;
      playBrush({ mutedRef, duration: 0.16 });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drawingRef.current = false;
    lastPtRef.current = null;
  }

  function done() {
    if (finalizingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onComplete(canvas.toDataURL("image/png"));
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintWashi(ctx, W, H);
    setHasInk(false);
    playClick({ mutedRef, freq: 1100 });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        {INK_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setColor(k);
              playClick({ mutedRef, freq: 1300 });
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
              color === k
                ? "border-washi-50 ring-2 ring-washi-50/40"
                : "border-washi-50/15 hover:border-washi-50/40"
            }`}
            style={{ background: INKS[k].hex }}
            aria-label={INKS[k].jp}
          >
            <span
              className="font-jp text-xs"
              style={{
                color: k === "kin" ? "#1a1612" : "#FBF7F0",
              }}
            >
              {INKS[k].jp}
            </span>
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="aspect-[520/380] w-[min(92vw,32rem)] cursor-crosshair touch-none rounded-sm border border-washi-50/15 shadow-2xl shadow-black/50"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={clearCanvas}
          disabled={!hasInk}
          className="inline-flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/55 transition hover:text-washi-50 disabled:opacity-30"
        >
          <Layers size={12} /> 紙を換える
        </button>
        <button
          type="button"
          onClick={done}
          disabled={!hasInk}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> 完成
        </button>
      </div>

      <p className="flex items-center gap-1 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/45">
        <Circle size={8} /> {feelLabel(feel)}
      </p>
    </div>
  );
}

function feelLabel(feel: BrushFeel): string {
  if (feel.hardness < 0.35) return "soft · ink-rich";
  if (feel.hardness < 0.6) return "balanced";
  if (feel.hardness < 0.8) return "springy";
  return "stiff · sharp";
}
