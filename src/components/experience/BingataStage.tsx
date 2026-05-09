"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { ArrowLeft, Droplets, Scissors } from "lucide-react";
import {
  playBrush,
  playChime,
  playClick,
  playWater,
  useMutedRef,
} from "@/lib/craftAudio";

type PatternId = "kacho" | "hato" | "karakusa" | "nettai";

interface Hole {
  x: number;
  y: number;
  r: number;
}

const SIZE = 480;
const TOTAL_STEPS = 4;
const CLOTH_COLOR = "#e8dcc1";
const CLOTH_WEAVE = "rgba(120,80,40,0.05)";
const PASTE_COLOR = "#a8783d";
const PASTE_HIGHLIGHT = "#d6ad6e";
const STENCIL_FILL = "rgba(108, 64, 24, 0.78)";
const STENCIL_STROKE = "rgba(48, 24, 6, 0.85)";

const PATTERNS: { id: PatternId; jp: string; romaji: string; en: string }[] = [
  { id: "kacho", jp: "花鳥", romaji: "Kachō", en: "Cherry blossoms & cranes" },
  { id: "hato", jp: "波濤", romaji: "Hatō", en: "Waves & fish" },
  { id: "karakusa", jp: "唐草", romaji: "Karakusa", en: "Vines & flowers" },
  { id: "nettai", jp: "熱帯", romaji: "Nettai", en: "Palms & butterflies" },
];

const PATTERN_NAME: Record<PatternId, string> = {
  kacho: "花鳥",
  hato: "波濤",
  karakusa: "唐草",
  nettai: "熱帯",
};

// Hand-laid hole positions per motif. Positions are pre-rounded so the
// SVG path is identical on server and client (hydration-safe).
const HOLES: Record<PatternId, Hole[]> = {
  kacho: [
    // Sakura flower 1 — upper-left
    { x: 150, y: 145, r: 8 },
    { x: 150, y: 118, r: 13 },
    { x: 175, y: 135, r: 13 },
    { x: 166, y: 168, r: 13 },
    { x: 134, y: 168, r: 13 },
    { x: 125, y: 135, r: 13 },
    // Sakura flower 2 — center-right
    { x: 330, y: 230, r: 8 },
    { x: 330, y: 203, r: 13 },
    { x: 355, y: 220, r: 13 },
    { x: 346, y: 253, r: 13 },
    { x: 314, y: 253, r: 13 },
    { x: 305, y: 220, r: 13 },
    // Crane silhouette dots
    { x: 110, y: 320, r: 11 },
    { x: 145, y: 350, r: 9 },
    { x: 380, y: 360, r: 11 },
    { x: 415, y: 390, r: 9 },
  ],
  hato: [
    // Wave crests
    { x: 70, y: 100, r: 10 },
    { x: 140, y: 75, r: 14 },
    { x: 210, y: 100, r: 10 },
    { x: 280, y: 75, r: 14 },
    { x: 350, y: 100, r: 10 },
    { x: 420, y: 75, r: 14 },
    // Mid swell
    { x: 110, y: 195, r: 11 },
    { x: 240, y: 215, r: 13 },
    { x: 370, y: 195, r: 11 },
    // Fish 1
    { x: 145, y: 350, r: 14 },
    { x: 122, y: 348, r: 9 },
    { x: 170, y: 345, r: 6 },
    // Fish 2
    { x: 325, y: 380, r: 14 },
    { x: 348, y: 378, r: 9 },
    { x: 300, y: 375, r: 6 },
  ],
  karakusa: [
    // Spiral vine
    { x: 240, y: 240, r: 8 },
    { x: 268, y: 215, r: 9 },
    { x: 300, y: 240, r: 10 },
    { x: 305, y: 285, r: 10 },
    { x: 270, y: 320, r: 10 },
    { x: 220, y: 320, r: 10 },
    { x: 175, y: 290, r: 10 },
    { x: 165, y: 235, r: 10 },
    { x: 195, y: 180, r: 10 },
    { x: 255, y: 155, r: 10 },
    { x: 320, y: 175, r: 11 },
    { x: 360, y: 240, r: 12 },
    // Corner flower hubs
    { x: 95, y: 110, r: 14 },
    { x: 405, y: 115, r: 14 },
    { x: 95, y: 395, r: 14 },
    { x: 405, y: 390, r: 14 },
  ],
  nettai: [
    // Palm trunk
    { x: 200, y: 390, r: 10 },
    { x: 205, y: 350, r: 10 },
    { x: 210, y: 310, r: 10 },
    { x: 215, y: 270, r: 10 },
    // Palm fronds
    { x: 175, y: 225, r: 14 },
    { x: 130, y: 205, r: 12 },
    { x: 100, y: 235, r: 11 },
    { x: 245, y: 225, r: 14 },
    { x: 290, y: 205, r: 12 },
    { x: 320, y: 235, r: 11 },
    { x: 215, y: 195, r: 14 },
    // Butterfly 1
    { x: 95, y: 110, r: 12 },
    { x: 115, y: 105, r: 7 },
    { x: 135, y: 110, r: 12 },
    // Butterfly 2
    { x: 350, y: 90, r: 12 },
    { x: 370, y: 85, r: 7 },
    { x: 390, y: 90, r: 12 },
  ],
};

const COLORS: { id: string; jp: string; hex: string }[] = [
  { id: "shu", jp: "朱", hex: "#C03D2B" },
  { id: "ki", jp: "黄", hex: "#C9A227" },
  { id: "ai", jp: "藍", hex: "#2B4A6F" },
  { id: "midori", jp: "緑", hex: "#4A7C2E" },
];

const STEP_META = [
  { jp: "型紙", romaji: "Katagami", en: "Stencil pattern" },
  { jp: "糊置", romaji: "Norioki", en: "Paste resist" },
  { jp: "彩色", romaji: "Saishiki", en: "Multi-color dye" },
  { jp: "水元", romaji: "Mizumoto", en: "Water rinse" },
];

const STEP_HINT = [
  "型紙を彫るのは別職人 (型彫師). 一枚に何百時間.",
  "もち米と糠で作った糊を型に詰める. この糊が防染となる.",
  "色差しは 5-7 色 + 隈取り (くまどり) で立体感. 沖縄の太陽の色.",
  "川や桶で糊を洗い流す. 防染部分が白抜きで残り、文様が浮かび上がる.",
];

// Path for the stencil overlay: outer rect + each hole as a sub-path.
// fillRule="evenodd" makes the holes punch through.
function stencilPath(holes: Hole[]): string {
  const inset = 8;
  let p = `M${inset} ${inset} L${SIZE - inset} ${inset} L${SIZE - inset} ${SIZE - inset} L${inset} ${SIZE - inset} Z`;
  for (const h of holes) {
    const cx = Math.round(h.x);
    const cy = Math.round(h.y);
    const r = Math.round(h.r);
    p += ` M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`;
  }
  return p;
}

function drawCloth(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = CLOTH_COLOR;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = CLOTH_WEAVE;
  for (let i = 0; i < SIZE; i += 4) ctx.fillRect(i, 0, 1, SIZE);
  for (let i = 0; i < SIZE; i += 4) ctx.fillRect(0, i, SIZE, 1);
}

function drawPasteBlob(
  ctx: CanvasRenderingContext2D,
  hole: Hole,
  alpha: number,
  yOffset = 0,
  rScale = 1.1,
) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PASTE_COLOR;
  ctx.beginPath();
  ctx.arc(hole.x, hole.y + yOffset, hole.r * rScale, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = PASTE_HIGHLIGHT;
  ctx.beginPath();
  ctx.arc(
    hole.x - hole.r * 0.3,
    hole.y + yOffset - hole.r * 0.3,
    hole.r * 0.35,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function BingataStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const muted = useMutedRef();
  const [step, setStep] = useState(0);
  const [pattern, setPattern] = useState<PatternId | null>(null);
  const [paste, setPaste] = useState<Set<number>>(new Set());
  const [colorsUsed, setColorsUsed] = useState<Set<string>>(new Set());

  // Persistent dye layer canvas. Created lazily on the client only — kept
  // across step transitions so the user's painting in saishiki survives
  // into mizumoto.
  const dyeRef = useRef<HTMLCanvasElement | null>(null);
  if (typeof window !== "undefined" && !dyeRef.current) {
    const c = document.createElement("canvas");
    c.width = SIZE;
    c.height = SIZE;
    dyeRef.current = c;
  }

  const finalizingRef = useRef(false);
  const mountedRef = useRef(true);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // React 19 StrictMode runs effect twice in dev. The first cleanup
    // sets mountedRef = false, and without re-arming on the second
    // mount the setTimeout's `if (mountedRef.current)` guard would
    // silent-skip — making step 2 → 3 fire only after a reload.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // Declarative step transition: when step 2 (norioki) is active and
  // every hole has been filled, advance to step 3. Replacing the
  // imperative setTimeout chain with a useEffect kills the stale-
  // closure / cleared-timer race that made the user have to reload.
  useEffect(() => {
    if (step !== 1 || !pattern) return;
    if (paste.size < HOLES[pattern].length) return;
    // Tiny defer so the last fill animation lands before the swap.
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setStep(2);
      advanceTimerRef.current = null;
    }, 350);
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
  }, [step, pattern, paste]);

  const pickPattern = useCallback(
    (id: PatternId) => {
      setPattern(id);
      setPaste(new Set());
      setColorsUsed(new Set());
      const dye = dyeRef.current;
      if (dye) {
        const ctx = dye.getContext("2d");
        ctx?.clearRect(0, 0, SIZE, SIZE);
      }
      playClick({ mutedRef: muted, freq: 1300 });
      setStep(1);
    },
    [muted],
  );

  const fillHole = useCallback(
    (idx: number) => {
      if (!pattern) return;
      setPaste((prev) => {
        if (prev.has(idx)) return prev;
        const next = new Set(prev);
        next.add(idx);
        playClick({ mutedRef: muted, freq: 900 });
        return next;
      });
      // Step transition is handled by the declarative useEffect that
      // watches `paste.size` — see above. Doing it here too caused a
      // stale-closure race where the timer fired against the wrong
      // pattern after navigation.
    },
    [muted, pattern],
  );

  const noteColor = useCallback((id: string) => {
    setColorsUsed((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    playClick({ mutedRef: muted, freq: 700 });
    // Cancel the 500ms norioki→saishiki auto-advance if it's still
    // pending, otherwise it would force-advance after the user has
    // navigated away (Codex P2).
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setStep((s) => Math.max(0, s - 1));
  }, [muted]);

  const handleMizumotoComplete = useCallback(
    (dataUrl: string) => {
      if (finalizingRef.current) return;
      if (!mountedRef.current) return;
      finalizingRef.current = true;
      playChime({ mutedRef: muted });
      onComplete(dataUrl);
    },
    [muted, onComplete],
  );

  const recipeName = pattern ? PATTERN_NAME[pattern] : "—";
  const meta = STEP_META[step];

  return (
    <div className="flex w-full flex-col items-center gap-4 text-washi-50">
      {/* Recipe badge */}
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-washi-50/15 bg-black/30 px-4 py-1.5 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/85 backdrop-blur">
        <span className="font-jp tracking-wider text-[0.7rem]">紅型</span>
        <span className="text-washi-50/30">·</span>
        <span className="font-jp tracking-wider">{recipeName}</span>
        <span className="text-washi-50/30">·</span>
        <span>色 {colorsUsed.size}種</span>
        <span className="text-washi-50/30">·</span>
        <span>琉球王朝</span>
      </div>

      {/* Step indicator */}
      <p className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/85">
        <span>
          Step {step + 1} / {TOTAL_STEPS}
        </span>
        <span className="text-washi-50/40">·</span>
        <span className="font-jp tracking-wider text-[0.75rem]">{meta.jp}</span>
        <span className="text-washi-50/55 normal-case tracking-[0.25em]">
          {meta.romaji}
        </span>
      </p>

      {/* Educational sub-text */}
      <p className="max-w-md text-center font-jp text-[0.7rem] tracking-wider text-washi-50/65">
        {STEP_HINT[step]}
      </p>

      {step === 0 && <KatagamiStep onPick={pickPattern} mutedRef={muted} />}
      {step === 1 && pattern && (
        <NoriokiStep
          pattern={pattern}
          paste={paste}
          onFill={fillHole}
        />
      )}
      {step === 2 && pattern && (
        <SaishikiStep
          pattern={pattern}
          paste={paste}
          dyeCanvas={dyeRef.current}
          colorsUsed={colorsUsed}
          onUseColor={noteColor}
          onAdvance={() => setStep(3)}
          mutedRef={muted}
        />
      )}
      {step === 3 && pattern && (
        <MizumotoStep
          pattern={pattern}
          paste={paste}
          dyeCanvas={dyeRef.current}
          mutedRef={muted}
          onComplete={handleMizumotoComplete}
        />
      )}

      {step > 0 && (
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/25 px-4 py-1.5 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/75 transition hover:border-washi-50/55 hover:text-washi-50"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — Katagami (pattern selection)
// ─────────────────────────────────────────────────────────────────────
function KatagamiStep({
  onPick,
  mutedRef,
}: {
  onPick: (id: PatternId) => void;
  mutedRef: RefObject<boolean>;
}) {
  return (
    <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
      {PATTERNS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(p.id)}
          onPointerEnter={() =>
            playClick({ mutedRef, freq: 1500, duration: 0.04 })
          }
          className="group flex flex-col items-center gap-2 rounded-md border border-washi-50/15 bg-black/30 p-3 backdrop-blur transition hover:-translate-y-0.5 hover:border-washi-50/55 hover:bg-black/50"
        >
          <PatternThumb pattern={p.id} />
          <div className="text-center">
            <p className="font-jp text-base tracking-wider text-washi-50">
              {p.jp}
            </p>
            <p className="text-[0.55rem] uppercase tracking-[0.3em] text-washi-50/65">
              {p.romaji}
            </p>
            <p className="mt-0.5 text-[0.55rem] tracking-wider text-washi-50/45">
              {p.en}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

function PatternThumb({ pattern }: { pattern: PatternId }) {
  const holes = HOLES[pattern];
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="aspect-square w-full max-w-[7rem] rounded-sm"
      style={{ background: CLOTH_COLOR }}
    >
      <path
        d={stencilPath(holes)}
        fill={STENCIL_FILL}
        fillRule="evenodd"
        stroke={STENCIL_STROKE}
        strokeWidth={2}
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — Norioki (paste-resist application)
// ─────────────────────────────────────────────────────────────────────
function NoriokiStep({
  pattern,
  paste,
  onFill,
}: {
  pattern: PatternId;
  paste: Set<number>;
  onFill: (idx: number) => void;
}) {
  const holes = HOLES[pattern];
  const [pulseT, setPulseT] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      setPulseT((performance.now() - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const path = useMemo(() => stencilPath(holes), [holes]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-square w-[min(90vw,28rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/50">
        {/* Cloth + weave */}
        <div className="absolute inset-0" style={{ background: CLOTH_COLOR }}>
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(60,40,20,0.16) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(60,40,20,0.13) 0 1px, transparent 1px 4px)",
            }}
          />
        </div>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="absolute inset-0 h-full w-full touch-none"
        >
          <path
            d={path}
            fill={STENCIL_FILL}
            fillRule="evenodd"
            stroke={STENCIL_STROKE}
            strokeWidth={2}
          />
          {holes.map((h, i) => {
            const filled = paste.has(i);
            const pulse = !filled
              ? Math.round(
                  (0.55 + Math.sin(pulseT * 3 + i * 0.4) * 0.22) * 100,
                ) / 100
              : 0;
            const cx = Math.round(h.x);
            const cy = Math.round(h.y);
            const r = Math.round(h.r);
            return (
              <g key={i}>
                {filled ? (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={Math.round(h.r * 1.1)}
                      fill={PASTE_COLOR}
                    />
                    <circle
                      cx={Math.round(h.x - h.r * 0.3)}
                      cy={Math.round(h.y - h.r * 0.3)}
                      r={Math.round(h.r * 0.35)}
                      fill={PASTE_HIGHLIGHT}
                      opacity={0.7}
                    />
                  </>
                ) : (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="rgba(255,255,255,0)"
                    stroke="rgba(255,250,235,0.85)"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    opacity={pulse}
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={Math.round(h.r * 1.7)}
                  fill="transparent"
                  className="cursor-pointer"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onFill(i);
                  }}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <p className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/65">
        <Scissors size={12} />
        <span>
          糊 {paste.size} / {holes.length}
        </span>
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3 — Saishiki (multi-color dye)
// ─────────────────────────────────────────────────────────────────────
function SaishikiStep({
  pattern,
  paste,
  dyeCanvas,
  colorsUsed,
  onUseColor,
  onAdvance,
  mutedRef,
}: {
  pattern: PatternId;
  paste: Set<number>;
  dyeCanvas: HTMLCanvasElement | null;
  colorsUsed: Set<string>;
  onUseColor: (id: string) => void;
  onAdvance: () => void;
  mutedRef: RefObject<boolean>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(COLORS[0]);
  const draggingRef = useRef(false);
  const lastBrushSoundRef = useRef(0);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const holes = HOLES[pattern];
  const rafRef = useRef(0);
  // Always-current "active" color for paintAt — the dragging callbacks
  // capture state at first invocation otherwise.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const draw = useCallback(() => {
    const main = canvasRef.current;
    if (!main || !dyeCanvas) return;
    const ctx = main.getContext("2d");
    if (!ctx) return;
    drawCloth(ctx);
    ctx.drawImage(dyeCanvas, 0, 0);
    for (let i = 0; i < holes.length; i++) {
      if (!paste.has(i)) continue;
      drawPasteBlob(ctx, holes[i], 1);
    }
  }, [dyeCanvas, holes, paste]);

  useEffect(() => {
    const loop = () => {
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  const paintAt = useCallback(
    (x: number, y: number) => {
      if (!dyeCanvas) return;
      const ctx = dyeCanvas.getContext("2d");
      if (!ctx) return;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = activeRef.current.hex;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Mask out paste circles — paint can't enter the resist zones.
      ctx.globalCompositeOperation = "destination-out";
      for (let i = 0; i < holes.length; i++) {
        if (!paste.has(i)) continue;
        const h = holes[i];
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * 1.18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    },
    [dyeCanvas, holes, paste],
  );

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
    };
  }

  function brushSoundThrottled() {
    const now = performance.now();
    if (now - lastBrushSoundRef.current > 220) {
      lastBrushSoundRef.current = now;
      playBrush({ mutedRef, duration: 0.25 });
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = canvasPoint(e);
    lastPosRef.current = { x, y };
    paintAt(x, y);
    onUseColor(activeRef.current.id);
    brushSoundThrottled();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!draggingRef.current) return;
    const { x, y } = canvasPoint(e);
    const last = lastPosRef.current;
    if (last) {
      const dist = Math.hypot(x - last.x, y - last.y);
      const steps = Math.max(1, Math.floor(dist / 8));
      for (let s = 1; s <= steps; s++) {
        const px = last.x + ((x - last.x) * s) / steps;
        const py = last.y + ((y - last.y) * s) / steps;
        paintAt(px, py);
      }
    } else {
      paintAt(x, y);
    }
    lastPosRef.current = { x, y };
    brushSoundThrottled();
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    draggingRef.current = false;
    lastPosRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="aspect-square w-[min(90vw,28rem)] cursor-crosshair touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/50"
      />

      <div className="flex flex-wrap items-center justify-center gap-2">
        {COLORS.map((c) => {
          const isActive = active.id === c.id;
          const used = colorsUsed.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActive(c);
                playClick({ mutedRef, freq: 1100 });
              }}
              className={`flex flex-col items-center gap-1 rounded-md border px-3 py-1.5 transition ${
                isActive
                  ? "border-washi-50/85 bg-black/45"
                  : "border-washi-50/15 bg-black/25 hover:border-washi-50/45"
              }`}
            >
              <span
                className="block h-6 w-6 rounded-full border border-black/30 shadow-inner"
                style={{ background: c.hex }}
              />
              <span className="font-jp text-[0.65rem] tracking-wider text-washi-50/85">
                {c.jp}
              </span>
              {used && (
                <span className="h-[2px] w-3 rounded bg-washi-50/85" />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAdvance}
        disabled={colorsUsed.size === 0}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        <Droplets size={12} /> 水元へ
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 4 — Mizumoto (water rinse, paste washes off, motif reveals)
// ─────────────────────────────────────────────────────────────────────
function MizumotoStep({
  pattern,
  paste,
  dyeCanvas,
  mutedRef,
  onComplete,
}: {
  pattern: PatternId;
  paste: Set<number>;
  dyeCanvas: HTMLCanvasElement | null;
  mutedRef: RefObject<boolean>;
  onComplete: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holes = HOLES[pattern];
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    playWater({ mutedRef, duration: 3.5 });
    let raf = 0;
    const start = performance.now();
    const drops: {
      x: number;
      y: number;
      vy: number;
      size: number;
      life: number;
    }[] = [];
    let finalized = false;

    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas || !dyeCanvas) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const elapsed = (performance.now() - start) / 1000;
      const t = Math.min(1, elapsed / 3.6);

      drawCloth(ctx);
      ctx.drawImage(dyeCanvas, 0, 0);

      const pasteAlpha = Math.max(0, 1 - t * 1.4);
      if (pasteAlpha > 0.01) {
        for (let i = 0; i < holes.length; i++) {
          if (!paste.has(i)) continue;
          const h = holes[i];
          drawPasteBlob(ctx, h, pasteAlpha, t * 8, 1.1 + t * 0.25);
          if (Math.random() < 0.06) {
            drops.push({
              x: h.x + (Math.random() - 0.5) * h.r,
              y: h.y + h.r * 0.6,
              vy: 1 + Math.random() * 1.6,
              size: 2 + Math.random() * 3,
              life: 0,
            });
          }
        }
      }

      // Animate drips
      for (const d of drops) {
        d.y += d.vy;
        d.vy += 0.05;
        d.life += 1;
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        if (drops[i].y > SIZE + 20 || drops[i].life > 200) drops.splice(i, 1);
      }
      ctx.fillStyle = "rgba(135, 90, 50, 0.6)";
      for (const d of drops) {
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.size * 0.6, d.size, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Water overlay — fades out toward the end so the final image is clean.
      const waterAlpha =
        elapsed < 3 ? 0.32 : 0.32 * Math.max(0, 1 - (elapsed - 3) / 0.9);
      if (waterAlpha > 0.005) {
        ctx.fillStyle = `rgba(140, 175, 215, ${waterAlpha})`;
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.strokeStyle = `rgba(255,255,255,${waterAlpha * 0.55})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          const yy = (i * 60 + elapsed * 90) % SIZE;
          ctx.moveTo(0, yy);
          for (let xx = 0; xx <= SIZE; xx += 30) {
            ctx.lineTo(
              xx,
              yy + Math.sin((xx + elapsed * 200) / 40) * 4,
            );
          }
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(loop);

      if (elapsed > 4 && !finalized) {
        finalized = true;
        // Render a clean snapshot (no water tint, no drips) for the
        // archive/ending screens.
        const out = document.createElement("canvas");
        out.width = SIZE;
        out.height = SIZE;
        const octx = out.getContext("2d");
        if (octx) {
          drawCloth(octx);
          octx.drawImage(dyeCanvas, 0, 0);
        }
        onCompleteRef.current(out.toDataURL("image/png"));
      }
    };
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  }, [dyeCanvas, holes, paste, mutedRef]);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="aspect-square w-[min(90vw,28rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/50"
      />
      <p className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/65">
        <Droplets size={12} />
        <span className="font-jp tracking-wider">水で糊を流す</span>
      </p>
    </div>
  );
}
