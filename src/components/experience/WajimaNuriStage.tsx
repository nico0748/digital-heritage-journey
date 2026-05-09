"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  ArrowLeft,
  Brush,
  Check,
  Layers,
  Pen,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import {
  playBrush,
  playChime,
  playClick,
  useMutedRef,
} from "@/lib/craftAudio";

// ────────────────────────────────────────────────────────────────────
// Wajima-nuri (輪島塗) — 4-step experience
// 124 工程の中から、椀の作り手に最も特徴的な4工程を凝縮：
//   1. 下地  (Shitaji)      — 地の粉(じのこ)漆を3層重ね、強靭な下地を作る
//   2. 塗り重 (Nurikasane)  — 黒漆を5〜7層、漆風呂で乾かしながら艶を深める
//   3. 加飾選 (Kashoku-sentaku) — 沈金(線で彫る) か 蒔絵(漆で描く) を選ぶ
//   4. 加飾  (Kashoku)      — 金で椀に命を吹き込む
//
// 2024 年能登半島地震で多くの輪島の工房が被災. Recovery uncertain.
// ────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;
const SHITAJI_TARGET = 3;
const LACQUER_TARGET = 6;
const KASHOKU_MIN_POINTS = 18;

type Technique = "chinkin" | "makie";

interface Pulse {
  t: number;
}

const STEP_NAMES = ["下地", "塗り重ね", "加飾選択", "加飾"] as const;
const STEP_ROMAJI = [
  "Shitaji",
  "Nurikasane",
  "Kashoku-sentaku",
  "Kashoku",
] as const;
const STEP_DESC = [
  "地の粉(じのこ)漆を3層重ね、強靭な下地を作る",
  "黒漆を5〜7層、漆風呂で乾かしながら艶を深める",
  "加飾の流派 — 沈金 か 蒔絵",
  "金で椀に命を吹き込む",
] as const;
const STEP_HINT = [
  "珪藻土と漆の下地は輪島塗の生命線。割れにも強い椀になる。",
  "中塗 → 上塗 → 上塗仕上 と層を重ね、漆風呂で湿度を保ちながら乾燥させる。",
  "沈金は刀で削った溝に金を埋める線の技法。蒔絵は漆で描いて金粉を蒔く面の技法。",
  "金 24K で 60g 使う作品も。手の動きが椀の命となる。",
] as const;

const SHITAJI_NAMES = ["布着せ", "さび漆", "中塗下地"] as const;
const LACQUER_PHASES = [
  "中塗",
  "中塗",
  "上塗",
  "上塗",
  "上塗仕上",
  "上塗仕上",
] as const;

// ════════════════════════════════════════════════════════════════════
// Orchestrator
// ════════════════════════════════════════════════════════════════════

export function WajimaNuriStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const mutedRef = useMutedRef();
  const [stepIdx, setStepIdx] = useState(0);
  const [shitajiLayers, setShitajiLayers] = useState(0);
  const [lacquerLayers, setLacquerLayers] = useState(0);
  const [technique, setTechnique] = useState<Technique | null>(null);

  // Tracks the deferred goNext from the technique-selection step so we
  // can cancel it if the user navigates away before it fires (Codex P2).
  const techniqueAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    return () => {
      if (techniqueAdvanceTimerRef.current) {
        clearTimeout(techniqueAdvanceTimerRef.current);
      }
    };
  }, []);

  const goNext = useCallback(() => {
    setStepIdx((i) => Math.min(i + 1, TOTAL_STEPS - 1));
  }, []);
  const goBack = useCallback(() => {
    // Cancel any pending technique auto-advance and clear the technique
    // selection if we're stepping back out of the decoration canvas
    // (Codex P1: stale technique value would otherwise cause the
    // wrong canvas to render on re-entry).
    if (techniqueAdvanceTimerRef.current) {
      clearTimeout(techniqueAdvanceTimerRef.current);
      techniqueAdvanceTimerRef.current = null;
    }
    setStepIdx((i) => {
      const prev = Math.max(i - 1, 0);
      // Stepping back from "kashoku" (step 3) → "kashoku-tech" (step 2):
      // forget the previously-picked technique so the user can re-decide.
      if (i === 3) setTechnique(null);
      return prev;
    });
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      {/* Step indicator */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/70">
          Step {stepIdx + 1} / {TOTAL_STEPS} ·{" "}
          <span className="font-jp tracking-[0.25em] text-washi-50/90">
            {STEP_NAMES[stepIdx]}
          </span>
        </p>
        <p className="text-[0.55rem] uppercase tracking-[0.45em] text-washi-50/40">
          {STEP_ROMAJI[stepIdx]}
        </p>
      </div>

      {/* Process description */}
      <p className="font-jp max-w-md text-center text-sm leading-relaxed tracking-wider text-washi-50/85">
        {STEP_DESC[stepIdx]}
      </p>

      {/* Active step body */}
      {stepIdx === 0 && (
        <ShitajiStep
          mutedRef={mutedRef}
          layers={shitajiLayers}
          setLayers={setShitajiLayers}
          onAdvance={goNext}
        />
      )}
      {stepIdx === 1 && (
        <NurikasaneStep
          mutedRef={mutedRef}
          shitajiLayers={shitajiLayers}
          layers={lacquerLayers}
          setLayers={setLacquerLayers}
          onAdvance={goNext}
        />
      )}
      {stepIdx === 2 && (
        <KashokuTechStep
          mutedRef={mutedRef}
          selected={technique}
          onSelect={(t) => {
            setTechnique(t);
            // Tiny delay so the selection visual lands before the step
            // swap. Tracked so goBack/unmount can cancel it.
            if (techniqueAdvanceTimerRef.current) {
              clearTimeout(techniqueAdvanceTimerRef.current);
            }
            techniqueAdvanceTimerRef.current = setTimeout(() => {
              techniqueAdvanceTimerRef.current = null;
              goNext();
            }, 320);
          }}
        />
      )}
      {stepIdx === 3 && technique && (
        <KashokuStep
          mutedRef={mutedRef}
          shitajiLayers={shitajiLayers}
          lacquerLayers={lacquerLayers}
          technique={technique}
          onComplete={onComplete}
        />
      )}

      {/* Educational sub-text */}
      <p className="font-jp mt-1 max-w-md text-center text-[0.65rem] leading-relaxed tracking-wider text-washi-50/55">
        {STEP_HINT[stepIdx]}
      </p>

      {/* Back button (every step except first) */}
      {stepIdx > 0 && (
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/55 transition hover:text-washi-50"
        >
          <ArrowLeft size={12} />
          <span className="font-jp tracking-wider">前へ戻る</span>
        </button>
      )}

      {/* Recipe badge */}
      <div className="rounded-full border border-kin/30 bg-black/30 px-4 py-1.5 backdrop-blur-sm">
        <p className="font-jp text-[0.6rem] tracking-[0.3em] text-kin/85">
          輪島塗 · 下地 {shitajiLayers}層 · 漆 {lacquerLayers}層
          {technique && (
            <>
              {" · "}
              {technique === "chinkin" ? "沈金" : "蒔絵"}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Step 1 — 下地 (Shitaji)
// ════════════════════════════════════════════════════════════════════

function ShitajiStep({
  mutedRef,
  layers,
  setLayers,
  onAdvance,
}: {
  mutedRef: RefObject<boolean>;
  layers: number;
  setLayers: (n: number) => void;
  onAdvance: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulsesRef = useRef<Pulse[]>([]);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  // Continuous draw loop — the bowl needs to animate the brush pulse.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const loop = () => {
      drawBowlSide(ctx, canvas.width, canvas.height, {
        shitajiLayers: layersRef.current,
        lacquerLayers: 0,
        pulses: pulsesRef.current,
      });
      pulsesRef.current = pulsesRef.current.filter(
        (p) => performance.now() - p.t < 700,
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  function applyLayer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (layersRef.current >= SHITAJI_TARGET) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pulsesRef.current.push({ t: performance.now() });
    playBrush({ mutedRef, duration: 0.4 });
    const next = layersRef.current + 1;
    setLayers(next);
    if (next >= SHITAJI_TARGET) {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(onAdvance, 720);
    }
  }

  function release(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  const phaseLabel =
    layers === 0 ? "椀木地に塗布する" : SHITAJI_NAMES[layers - 1];

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={520}
        height={400}
        onPointerDown={applyLayer}
        onPointerUp={release}
        onPointerCancel={release}
        className="aspect-[13/10] w-[min(92vw,32rem)] cursor-pointer touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60"
      />

      {/* Layer counter */}
      <div className="flex items-center gap-3">
        {Array.from({ length: SHITAJI_TARGET }).map((_, i) => (
          <span
            key={i}
            className={clsx(
              "h-1.5 w-10 rounded-full transition-colors duration-300",
              i < layers ? "bg-washi-300" : "bg-washi-50/15",
            )}
          />
        ))}
      </div>

      <p className="text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/60">
        <Layers size={12} className="-mt-px mr-1.5 inline" />
        <span className="font-jp tracking-wider">{phaseLabel}</span>
        <span className="ml-3 text-washi-50/40">
          {layers} / {SHITAJI_TARGET}
        </span>
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Step 2 — 塗り重ね (Nurikasane)
// ════════════════════════════════════════════════════════════════════

function NurikasaneStep({
  mutedRef,
  shitajiLayers,
  layers,
  setLayers,
  onAdvance,
}: {
  mutedRef: RefObject<boolean>;
  shitajiLayers: number;
  layers: number;
  setLayers: (n: number) => void;
  onAdvance: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulsesRef = useRef<Pulse[]>([]);
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const shitajiRef = useRef(shitajiLayers);
  shitajiRef.current = shitajiLayers;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const loop = () => {
      drawBowlSide(ctx, canvas.width, canvas.height, {
        shitajiLayers: shitajiRef.current,
        lacquerLayers: layersRef.current,
        pulses: pulsesRef.current,
      });
      pulsesRef.current = pulsesRef.current.filter(
        (p) => performance.now() - p.t < 700,
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function applyLayer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (layersRef.current >= LACQUER_TARGET) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pulsesRef.current.push({ t: performance.now() });
    playBrush({ mutedRef, duration: 0.5 });
    setLayers(layersRef.current + 1);
  }

  function release(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  const phaseLabel =
    layers === 0
      ? "黒漆を取って重ねる"
      : LACQUER_PHASES[Math.min(layers - 1, LACQUER_PHASES.length - 1)];

  const ready = layers >= LACQUER_TARGET - 1;

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={520}
        height={400}
        onPointerDown={applyLayer}
        onPointerUp={release}
        onPointerCancel={release}
        className="aspect-[13/10] w-[min(92vw,32rem)] cursor-pointer touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60"
      />

      <div className="flex items-center gap-2">
        {Array.from({ length: LACQUER_TARGET }).map((_, i) => (
          <span
            key={i}
            className={clsx(
              "h-1.5 w-6 rounded-full transition-colors duration-300",
              i < layers ? "bg-washi-50/85" : "bg-washi-50/15",
            )}
          />
        ))}
      </div>

      <p className="text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/60">
        <Brush size={12} className="-mt-px mr-1.5 inline" />
        <span className="font-jp tracking-wider">{phaseLabel}</span>
        <span className="ml-3 text-washi-50/40">
          {layers} / {LACQUER_TARGET}
        </span>
      </p>

      <button
        type="button"
        onClick={onAdvance}
        disabled={!ready}
        className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 bg-washi-50/5 px-5 py-2 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50 transition hover:bg-washi-50/15 disabled:opacity-30"
      >
        <span className="font-jp tracking-wider">加飾へ進む</span>
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Step 3 — 加飾選択 (Kashoku-sentaku)
// ════════════════════════════════════════════════════════════════════

function KashokuTechStep({
  mutedRef,
  selected,
  onSelect,
}: {
  mutedRef: RefObject<boolean>;
  selected: Technique | null;
  onSelect: (t: Technique) => void;
}) {
  function pick(t: Technique) {
    if (selected) return; // re-entry guard so double tap doesn't double advance
    playClick({ mutedRef, freq: 1400 });
    onSelect(t);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <TechCard
        active={selected === "chinkin"}
        kanji="沈金"
        romaji="Chinkin"
        meaning="刀で線を彫り、金箔を埋める"
        descriptor="線・繊細・刻む"
        accent="#C9A227"
        onClick={() => pick("chinkin")}
        Icon={Pen}
      />
      <TechCard
        active={selected === "makie"}
        kanji="蒔絵"
        romaji="Makie"
        meaning="漆で絵を描き、金粉を蒔く"
        descriptor="面・絵画的・蒔く"
        accent="#E8C547"
        onClick={() => pick("makie")}
        Icon={Brush}
      />
    </div>
  );
}

function TechCard({
  active,
  kanji,
  romaji,
  meaning,
  descriptor,
  accent,
  onClick,
  Icon,
}: {
  active: boolean;
  kanji: string;
  romaji: string;
  meaning: string;
  descriptor: string;
  accent: string;
  onClick: () => void;
  Icon: typeof Pen;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group relative flex w-full flex-col items-center gap-3 overflow-hidden rounded-sm border px-6 py-7 text-center transition-all duration-300",
        active
          ? "scale-[1.02] border-kin/80 bg-black/60 shadow-2xl shadow-black/60"
          : "border-washi-50/15 bg-black/30 hover:border-washi-50/35 hover:bg-black/45",
      )}
    >
      {/* Accent line */}
      <span
        className="absolute inset-x-0 top-0 h-px transition-opacity"
        style={{ background: accent, opacity: active ? 0.85 : 0.25 }}
      />
      <Icon
        size={20}
        className="text-washi-50/70 transition group-hover:text-washi-50"
        style={{ color: active ? accent : undefined }}
      />
      <p
        className="font-jp text-3xl tracking-[0.3em] text-washi-50"
        style={{ color: active ? accent : undefined }}
      >
        {kanji}
      </p>
      <p className="text-[0.55rem] uppercase tracking-[0.5em] text-washi-50/50">
        {romaji}
      </p>
      <p className="font-jp text-xs leading-relaxed tracking-wider text-washi-50/80">
        {meaning}
      </p>
      <p className="font-jp text-[0.65rem] tracking-[0.3em] text-washi-50/40">
        {descriptor}
      </p>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// Step 4 — 加飾実行 (Kashoku)
// ════════════════════════════════════════════════════════════════════

interface DecoPoint {
  x: number;
  y: number;
  pathId: number;
}

interface GoldFleck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const KASHOKU_SIZE = 520;

function KashokuStep({
  mutedRef,
  shitajiLayers,
  lacquerLayers,
  technique,
  onComplete,
}: {
  mutedRef: RefObject<boolean>;
  shitajiLayers: number;
  lacquerLayers: number;
  technique: Technique;
  onComplete: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<DecoPoint[]>([]);
  const flecksRef = useRef<GoldFleck[]>([]);
  const pathIdRef = useRef(0);
  const drawingRef = useRef(false);
  const lastSoundRef = useRef(0);
  const scatterStartRef = useRef<number | null>(null);
  const finalizingRef = useRef(false);
  const mountedRef = useRef(true);
  const finaleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pointCount, setPointCount] = useState(0);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (finaleTimerRef.current) clearTimeout(finaleTimerRef.current);
    };
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const loop = () => {
      const w = canvas.width;
      const h = canvas.height;
      drawBowlTop(ctx, w, h, {
        shitajiLayers,
        lacquerLayers,
      });

      // Decoration paths — drawn within bowl clip
      ctx.save();
      const cx = w / 2;
      const cy = h / 2;
      const rim = Math.min(w, h) * 0.42;
      ctx.beginPath();
      ctx.arc(cx, cy, rim, 0, Math.PI * 2);
      ctx.clip();

      const points = pointsRef.current;
      if (technique === "chinkin") {
        // Chinkin — fine carved gold lines.
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(255, 220, 110, 0.55)";
        ctx.shadowBlur = 4;
        ctx.strokeStyle = "#E8C547";
        ctx.lineWidth = 1.6;
        let prevPathId = -1;
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          if (p.pathId !== prevPathId) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            prevPathId = p.pathId;
          } else {
            ctx.lineTo(p.x, p.y);
          }
          if (i === points.length - 1 || points[i + 1].pathId !== p.pathId) {
            ctx.stroke();
          }
        }
        ctx.shadowBlur = 0;
      } else {
        // Makie — wet lacquer ribbon. Once scattering, gold flecks coat it.
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(40, 24, 12, 0.92)";
        ctx.lineWidth = 7;
        let prevPathId = -1;
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          if (p.pathId !== prevPathId) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            prevPathId = p.pathId;
          } else {
            ctx.lineTo(p.x, p.y);
          }
          if (i === points.length - 1 || points[i + 1].pathId !== p.pathId) {
            ctx.stroke();
          }
        }
        // Wet sheen along the ribbon
        ctx.strokeStyle = "rgba(170, 140, 90, 0.18)";
        ctx.lineWidth = 3;
        prevPathId = -1;
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          if (p.pathId !== prevPathId) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            prevPathId = p.pathId;
          } else {
            ctx.lineTo(p.x, p.y);
          }
          if (i === points.length - 1 || points[i + 1].pathId !== p.pathId) {
            ctx.stroke();
          }
        }
      }

      // Gold flecks — physics
      const flecks = flecksRef.current;
      for (const f of flecks) {
        f.x += f.vx;
        f.y += f.vy;
        f.vx *= 0.96;
        f.vy *= 0.96;
        f.life += 1;
      }
      flecksRef.current = flecks.filter((f) => f.life < f.maxLife);
      for (const f of flecksRef.current) {
        const a = Math.max(0, 1 - f.life / f.maxLife);
        ctx.fillStyle = `rgba(232, 197, 71, ${a})`;
        ctx.shadowColor = "rgba(255, 220, 120, 0.7)";
        ctx.shadowBlur = 2 + f.size;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Settled gold powder for makie — scattered around drawn lacquer trails.
      if (technique === "makie" && scatterStartRef.current !== null) {
        const elapsed = performance.now() - scatterStartRef.current;
        const settled = Math.min(1, elapsed / 1300);
        // Sample points and scatter dots
        let s = 41;
        const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
        for (const p of points) {
          // Skip some points so density is controlled
          if (rng() > 0.35) continue;
          const ox = (rng() - 0.5) * 14;
          const oy = (rng() - 0.5) * 14;
          const r = 0.7 + rng() * 1.4;
          ctx.fillStyle = `rgba(232, 197, 71, ${0.55 + rng() * 0.4 * settled})`;
          ctx.beginPath();
          ctx.arc(p.x + ox, p.y + oy, r * settled, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [shitajiLayers, lacquerLayers, technique]);

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * KASHOKU_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * KASHOKU_SIZE,
    };
  }

  function inBowl(x: number, y: number) {
    const cx = KASHOKU_SIZE / 2;
    const cy = KASHOKU_SIZE / 2;
    const rim = KASHOKU_SIZE * 0.42;
    return Math.hypot(x - cx, y - cy) < rim - 4;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (finalizingRef.current) return;
    const { x, y } = canvasPoint(e);
    if (!inBowl(x, y)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    pathIdRef.current += 1;
    pointsRef.current.push({ x, y, pathId: pathIdRef.current });
    setPointCount(pointsRef.current.length);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || finalizingRef.current) return;
    const { x, y } = canvasPoint(e);
    if (!inBowl(x, y)) return;
    pointsRef.current.push({ x, y, pathId: pathIdRef.current });
    setPointCount(pointsRef.current.length);

    const now = performance.now();
    if (now - lastSoundRef.current > 65) {
      lastSoundRef.current = now;
      if (technique === "chinkin") {
        playClick({ mutedRef, freq: 800, duration: 0.05 });
      } else {
        playBrush({ mutedRef, duration: 0.2, volume: 0.55 });
      }
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function complete() {
    if (finalizingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    finalizingRef.current = true;
    setFinalizing(true);

    if (technique === "makie") {
      // Gold-scatter ceremony — burst flecks across the bowl over the
      // drawn lacquer paths, while layering on settled powder.
      scatterStartRef.current = performance.now();
      let s = 53;
      const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      const samples = pointsRef.current;
      for (let i = 0; i < 90; i++) {
        const base = samples[Math.floor(rng() * samples.length)] ?? {
          x: KASHOKU_SIZE / 2,
          y: KASHOKU_SIZE / 2,
        };
        flecksRef.current.push({
          x: base.x + (rng() - 0.5) * 8,
          y: base.y + (rng() - 0.5) * 8,
          vx: (rng() - 0.5) * 3.4,
          vy: (rng() - 0.5) * 3.4,
          life: 0,
          maxLife: 28 + rng() * 18,
          size: 0.8 + rng() * 1.6,
        });
      }
      // Gold sprinkle ticks — short bright ticks evoke 金粉撒き.
      for (let i = 0; i < 8; i++) {
        window.setTimeout(() => {
          if (!mountedRef.current) return;
          playClick({ mutedRef, freq: 2000, duration: 0.04, volume: 0.4 });
        }, i * 90);
      }
    }

    playChime({ mutedRef });

    finaleTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      const dataUrl = canvas.toDataURL("image/png");
      onComplete(dataUrl);
    }, technique === "makie" ? 1700 : 900);
  }

  const enoughPoints = pointCount >= KASHOKU_MIN_POINTS;

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/65">
        <Sparkles size={12} />
        <span className="font-jp tracking-wider">
          {technique === "chinkin"
            ? "刀でドラッグして金線を彫る"
            : "漆でドラッグして絵を描く"}
        </span>
      </p>

      <canvas
        ref={canvasRef}
        width={KASHOKU_SIZE}
        height={KASHOKU_SIZE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={clsx(
          "aspect-square w-[min(92vw,30rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60",
          technique === "chinkin" ? "cursor-crosshair" : "cursor-pointer",
        )}
      />

      <button
        type="button"
        onClick={complete}
        disabled={!enoughPoints || finalizing}
        className="inline-flex items-center gap-2 rounded-full bg-kin px-6 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:brightness-110 disabled:opacity-35"
      >
        <Check size={12} />
        <span className="font-jp tracking-wider">
          {technique === "makie" ? "金粉を蒔いて完成" : "完成"}
        </span>
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Bowl renderers (canvas)
// ════════════════════════════════════════════════════════════════════

function drawBowlSide(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    shitajiLayers: number;
    lacquerLayers: number;
    pulses: Pulse[];
  },
) {
  // Cinematic studio backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#1a1410");
  bg.addColorStop(0.55, "#0a0604");
  bg.addColorStop(1, "#000000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Spotlight from above
  const spot = ctx.createRadialGradient(
    w * 0.5,
    h * 0.18,
    Math.round(h * 0.08),
    w * 0.5,
    h * 0.55,
    Math.round(w * 0.65),
  );
  spot.addColorStop(0, "rgba(255, 220, 170, 0.18)");
  spot.addColorStop(1, "rgba(255, 220, 170, 0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, w, h);

  // Geometry
  const cx = Math.round(w * 0.5);
  const rimY = Math.round(h * 0.30);
  const baseY = Math.round(h * 0.74);
  const rimHalf = Math.round(w * 0.27);
  const baseHalf = Math.round(w * 0.13);
  const footHalf = Math.round(w * 0.085);
  const footY = Math.round(h * 0.85);
  const rimEllipseRy = Math.round(h * 0.025);

  // Bowl body silhouette — graceful curve from rim to base.
  const bowlPath = new Path2D();
  bowlPath.moveTo(cx - rimHalf, rimY);
  bowlPath.bezierCurveTo(
    cx - rimHalf + 4,
    baseY - 14,
    cx - baseHalf - 18,
    baseY,
    cx - baseHalf,
    baseY,
  );
  bowlPath.lineTo(cx + baseHalf, baseY);
  bowlPath.bezierCurveTo(
    cx + baseHalf + 18,
    baseY,
    cx + rimHalf - 4,
    baseY - 14,
    cx + rimHalf,
    rimY,
  );
  bowlPath.closePath();

  // Foot ring
  const footPath = new Path2D();
  footPath.moveTo(cx - footHalf, baseY);
  footPath.lineTo(cx + footHalf, baseY);
  footPath.lineTo(cx + footHalf - 3, footY);
  footPath.lineTo(cx - footHalf + 3, footY);
  footPath.closePath();

  // Drop shadow under the foot
  const shadowGrad = ctx.createRadialGradient(
    cx,
    footY + 8,
    2,
    cx,
    footY + 8,
    Math.round(rimHalf * 1.3),
  );
  shadowGrad.addColorStop(0, "rgba(0,0,0,0.55)");
  shadowGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(cx, footY + 14, rimHalf * 1.1, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wood substrate
  ctx.fillStyle = "#3a2a1a";
  ctx.fill(bowlPath);
  ctx.fill(footPath);

  // Shitaji layers
  if (opts.shitajiLayers > 0) {
    ctx.save();
    ctx.clip(bowlPath);
    const sIntensity = opts.shitajiLayers / SHITAJI_TARGET;
    const tone = [
      "rgba(90, 74, 54, 0.85)",
      "rgba(110, 92, 68, 0.95)",
      "rgba(130, 110, 84, 1)",
    ][Math.min(opts.shitajiLayers - 1, 2)];
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, w, h);

    // Diatomite grit — fades as layers increase (becomes smoother).
    const grit = 1 - sIntensity * 0.85;
    if (grit > 0.1) {
      let s = 91;
      const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      ctx.globalAlpha = 0.32 * grit;
      for (let i = 0; i < 110; i++) {
        const x = Math.round(rng() * w);
        const y = Math.round(rng() * h);
        ctx.fillStyle = i % 2 === 0 ? "#221208" : "#5b4a32";
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    // Cloth-cloth (布着せ) hint after layer 1 — diagonal hatching.
    if (opts.shitajiLayers >= 1) {
      ctx.strokeStyle = `rgba(70, 56, 40, ${0.32 - sIntensity * 0.16})`;
      ctx.lineWidth = 1;
      for (let x = -h; x < w + h; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Lacquer layers — deepen black, build gloss.
  if (opts.lacquerLayers > 0) {
    ctx.save();
    ctx.clip(bowlPath);
    const lI = Math.min(1, opts.lacquerLayers / LACQUER_TARGET);
    // Ink-black coat
    ctx.fillStyle = `rgba(8, 5, 3, ${0.45 + lI * 0.45})`;
    ctx.fillRect(0, 0, w, h);
    // Side highlight (gloss)
    if (opts.lacquerLayers >= 2) {
      const hl = ctx.createLinearGradient(cx - rimHalf, rimY, cx, baseY);
      hl.addColorStop(0, `rgba(255, 245, 215, ${0.05 + lI * 0.10})`);
      hl.addColorStop(0.4, `rgba(255, 245, 215, ${0.02 + lI * 0.05})`);
      hl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hl;
      ctx.fillRect(0, 0, w, h);
    }
    // Reflective sheen — sharper as we approach upper layers.
    if (opts.lacquerLayers >= 4) {
      const sheen = ctx.createLinearGradient(
        cx + rimHalf * 0.2,
        rimY,
        cx + rimHalf * 0.6,
        baseY,
      );
      sheen.addColorStop(0, `rgba(180, 160, 130, ${(lI - 0.5) * 0.4})`);
      sheen.addColorStop(0.6, "rgba(180, 160, 130, 0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);
    }
    // Inside cup darkness — bowl interior reads deeper.
    const inside = ctx.createRadialGradient(
      cx,
      rimY + 4,
      4,
      cx,
      rimY + 4,
      Math.round(rimHalf * 1.1),
    );
    inside.addColorStop(0, "rgba(0,0,0,0.55)");
    inside.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = inside;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Rim ellipse — shows bowl opening from this angle
  ctx.fillStyle =
    opts.lacquerLayers > 0
      ? "rgba(0, 0, 0, 0.85)"
      : opts.shitajiLayers > 0
        ? "rgba(60, 48, 36, 0.85)"
        : "rgba(40, 28, 16, 0.85)";
  ctx.beginPath();
  ctx.ellipse(cx, rimY, rimHalf, rimEllipseRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Rim highlight — thin warm line on top edge
  if (opts.lacquerLayers > 0) {
    ctx.strokeStyle = `rgba(255, 230, 180, ${0.18 + Math.min(1, opts.lacquerLayers / LACQUER_TARGET) * 0.22})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      rimY - 1,
      rimHalf - 2,
      Math.max(2, rimEllipseRy - 1),
      0,
      Math.PI,
      Math.PI * 2,
    );
    ctx.stroke();
  }

  // Bowl outline
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = 1.4;
  ctx.stroke(bowlPath);
  ctx.stroke(footPath);

  // Brush pulse — bright sweep across the bowl on each layer add.
  const now = performance.now();
  for (const p of opts.pulses) {
    const age = (now - p.t) / 700;
    if (age > 1) continue;
    ctx.save();
    ctx.clip(bowlPath);
    const sweepX = (cx - rimHalf) + (rimHalf * 2.4) * age;
    const grad = ctx.createLinearGradient(sweepX - 80, 0, sweepX + 80, 0);
    grad.addColorStop(0, "rgba(255, 220, 170, 0)");
    grad.addColorStop(0.5, `rgba(255, 220, 170, ${(1 - age) * 0.32})`);
    grad.addColorStop(1, "rgba(255, 220, 170, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function drawBowlTop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: { shitajiLayers: number; lacquerLayers: number },
) {
  // Backdrop
  const bg = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.round(h * 0.1),
    w / 2,
    h / 2,
    Math.round(w * 0.7),
  );
  bg.addColorStop(0, "#1a1410");
  bg.addColorStop(1, "#020100");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  const rim = Math.round(Math.min(w, h) * 0.42);
  const inner = Math.round(rim * 0.92);

  // Outer rim ring
  ctx.fillStyle = "#2a1c10";
  ctx.beginPath();
  ctx.arc(cx, cy, rim + 6, 0, Math.PI * 2);
  ctx.fill();

  // Bowl interior — base color depends on layers
  const lI = Math.min(1, opts.lacquerLayers / LACQUER_TARGET);
  const sI = Math.min(1, opts.shitajiLayers / SHITAJI_TARGET);

  let baseColor = "#3a2a1a";
  if (opts.lacquerLayers > 0) {
    // Black-ish lacquer with depth
    const v = Math.round(8 + (1 - lI) * 30);
    baseColor = `rgb(${v}, ${Math.max(4, v - 4)}, ${Math.max(3, v - 6)})`;
  } else if (opts.shitajiLayers > 0) {
    const v = Math.round(80 + sI * 60);
    baseColor = `rgb(${v}, ${Math.round(v * 0.82)}, ${Math.round(v * 0.6)})`;
  }
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.arc(cx, cy, rim, 0, Math.PI * 2);
  ctx.fill();

  // Concentric depth rings for the bowl interior — gives a 3D feel.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rim, 0, Math.PI * 2);
  ctx.clip();
  // Outer-to-center darkening
  const depth = ctx.createRadialGradient(cx, cy, 4, cx, cy, rim);
  depth.addColorStop(0, "rgba(0,0,0,0.45)");
  depth.addColorStop(0.7, "rgba(0,0,0,0.05)");
  depth.addColorStop(1, "rgba(255, 245, 215, 0.06)");
  ctx.fillStyle = depth;
  ctx.fillRect(0, 0, w, h);
  // Highlight crescent for gloss (only if enough lacquer)
  if (opts.lacquerLayers >= 2) {
    const sheen = ctx.createRadialGradient(
      cx - rim * 0.35,
      cy - rim * 0.45,
      4,
      cx - rim * 0.35,
      cy - rim * 0.45,
      Math.round(rim * 0.85),
    );
    sheen.addColorStop(0, `rgba(255, 240, 210, ${0.08 + lI * 0.18})`);
    sheen.addColorStop(0.6, "rgba(255, 240, 210, 0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  // Inner rim highlight — thin warm line.
  if (opts.lacquerLayers > 0) {
    ctx.strokeStyle = `rgba(255, 230, 180, ${0.18 + lI * 0.22})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Outer bevel
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, rim, 0, Math.PI * 2);
  ctx.stroke();
}
