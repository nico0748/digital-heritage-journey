"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Flame,
  Sparkles,
  Sprout,
  Brush as BrushIcon,
} from "lucide-react";
import {
  useMutedRef,
  playBrush,
  playChime,
  playClick,
  playFire,
} from "@/lib/craftAudio";
import { useTranslations } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────
// 津軽塗 (Tsugaru-nuri / Aomori lacquerware) — 唐塗 (karanuri) flow.
// 4 steps mirroring the real 48-step process at gesture level:
//   仕掛け → 塗り重ね → 乾燥 → 研ぎ出し
// Each step lives in its own sub-component so state and side-effects
// stay scoped.
// ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

interface Seed {
  id: number;
  x: number; // SVG viewBox 0..400
  y: number;
}

interface Layer {
  color: string;
}

const TOTAL_STEPS = 4;
const MIN_SEEDS = 8;
const MAX_SEEDS = 15;
const MIN_LAYERS = 5;
const MAX_LAYERS = 7;
const POLISH_TARGET = 0.6;
const KANSO_DURATION_MS = 3500;

const STEP_NAMES: Record<Step, { jp: string; romaji: string }> = {
  1: { jp: "仕掛け", romaji: "Shikake" },
  2: { jp: "塗り重ね", romaji: "Nurikasane" },
  3: { jp: "乾燥", romaji: "Kansō" },
  4: { jp: "研ぎ出し", romaji: "Togidashi" },
};

const PALETTE_COLORS = [
  { id: "kuro", jp: "黒", hex: "#1a1610" },
  { id: "shu", jp: "朱", hex: "#C03D2B" },
  { id: "midori", jp: "緑", hex: "#2c5530" },
  { id: "ki", jp: "黄", hex: "#C9A227" },
  { id: "gin", jp: "銀", hex: "#9aa0a4" },
] as const;

const WOOD_COLOR = "#3a2614";

export function TsugaruNuriStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const [step, setStep] = useState<Step>(1);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);

  const finalizingRef = useRef(false);
  const [finalizing, setFinalizing] = useState(false);

  function handleBackTo(target: Step) {
    if (target === 1) {
      // User is revising seeds — they will rebuild the lacquer stack
      // from scratch, so drop the layers too.
      setLayers([]);
    }
    setStep(target);
  }

  function handleFinalize(dataUrl: string) {
    // Re-entrancy guard: the polish button could be tapped twice in
    // quick succession on slow devices. onComplete navigates and
    // saves work, so we must call it exactly once.
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    setFinalizing(true);
    onComplete(dataUrl);
  }

  return (
    <div className="flex w-full flex-col items-center gap-4 text-washi-50">
      <header className="flex w-full max-w-2xl flex-col items-center gap-2">
        <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
          <Sparkles size={14} /> Step {step} / {TOTAL_STEPS} ·{" "}
          <span className="font-jp">{STEP_NAMES[step].jp}</span> ·{" "}
          {STEP_NAMES[step].romaji}
        </p>
        <div className="flex items-center gap-2">
          {([1, 2, 3, 4] as const).map((n) => (
            <span
              key={n}
              className={`h-1 w-6 rounded-full transition-colors ${
                n <= step ? "bg-amber-300" : "bg-washi-50/20"
              }`}
            />
          ))}
        </div>
      </header>

      {step > 1 && <RecipeBadge seeds={seeds.length} layers={layers.length} />}

      {step === 1 && (
        <ShikakeStep
          seeds={seeds}
          setSeeds={setSeeds}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <NurikasaneStep
          layers={layers}
          setLayers={setLayers}
          onBack={() => handleBackTo(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <KansoStep
          topColor={layers[layers.length - 1]?.color ?? WOOD_COLOR}
          onBack={() => handleBackTo(2)}
          onDone={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <TogidashiStep
          seeds={seeds}
          layers={layers}
          finalizing={finalizing}
          onBack={() => handleBackTo(3)}
          onDone={handleFinalize}
        />
      )}
    </div>
  );
}

function RecipeBadge({ seeds, layers }: { seeds: number; layers: number }) {
  return (
    <div className="rounded-full border border-amber-300/30 bg-black/30 px-4 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/90 backdrop-blur">
      <span className="font-jp">津軽塗</span>
      <span className="mx-2 text-washi-50/40">·</span>
      <span className="font-jp">種</span> {seeds}
      <span className="mx-1 text-washi-50/40">粒</span>
      <span className="mx-2 text-washi-50/40">·</span>
      <span className="font-jp">層</span> {layers}
      <span className="mx-1 text-washi-50/40">層</span>
      <span className="mx-2 text-washi-50/40">·</span>
      <span className="font-jp">唐塗</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1: 仕掛け — place seed grains (種粉) by tapping the bowl.
// ─────────────────────────────────────────────────────────────────────

function ShikakeStep({
  seeds,
  setSeeds,
  onNext,
}: {
  seeds: Seed[];
  setSeeds: (s: Seed[]) => void;
  onNext: () => void;
}) {
  const t = useTranslations();
  const muted = useMutedRef();
  const svgRef = useRef<SVGSVGElement>(null);
  const idRef = useRef(seeds.length);

  function placeSeed(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    if (seeds.length >= MAX_SEEDS) {
      playClick({ mutedRef: muted, freq: 400 });
      return;
    }
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 400;
    const py = ((e.clientY - rect.top) / rect.height) * 400;
    // Clamp to bowl interior so seeds never land on the rim.
    const dx = px - 200;
    const dy = py - 200;
    const r = Math.sqrt(dx * dx + dy * dy);
    const maxR = 150;
    let fx = px;
    let fy = py;
    if (r > maxR) {
      const k = maxR / r;
      fx = 200 + dx * k;
      fy = 200 + dy * k;
    }
    idRef.current += 1;
    setSeeds([
      ...seeds,
      {
        id: idRef.current,
        x: Number(fx.toFixed(3)),
        y: Number(fy.toFixed(3)),
      },
    ]);
    playClick({ mutedRef: muted, freq: 1200 });
  }

  function clearSeeds() {
    if (seeds.length === 0) return;
    setSeeds([]);
    playClick({ mutedRef: muted, freq: 480 });
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-md text-center text-sm leading-relaxed text-washi-50/80">
        {t("stages.tsugaru.shikake.hint")}
      </p>

      <div
        className="relative aspect-square w-[min(80vw,22rem)] overflow-hidden rounded-full border border-washi-50/10 shadow-2xl shadow-black/60"
        style={{ background: "#0d0a08" }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 400 400"
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          onPointerDown={placeSeed}
        >
          <defs>
            <radialGradient id="bowl-grad-1" cx="50%" cy="38%" r="65%">
              <stop offset="0%" stopColor="#4a3018" />
              <stop offset="55%" stopColor="#2a1a0d" />
              <stop offset="100%" stopColor="#0e0805" />
            </radialGradient>
          </defs>
          <circle
            cx="200"
            cy="200"
            r="190"
            fill="#0a0604"
            stroke="#3a2614"
            strokeWidth="2"
          />
          <circle cx="200" cy="200" r="170" fill="url(#bowl-grad-1)" />
          {/* subtle wood grain */}
          <ellipse
            cx="190"
            cy="160"
            rx="80"
            ry="6"
            fill="#5a3a1a"
            opacity="0.18"
          />
          <ellipse
            cx="210"
            cy="240"
            rx="100"
            ry="5"
            fill="#5a3a1a"
            opacity="0.12"
          />
          {seeds.map((s) => (
            <g key={s.id}>
              <circle
                cx={s.x}
                cy={s.y}
                r="4"
                fill="#1a1208"
                stroke="#7a4a1f"
                strokeWidth="0.6"
              />
              <circle cx={s.x} cy={s.y} r="1.4" fill="#a87645" opacity="0.8" />
            </g>
          ))}
        </svg>
      </div>

      <div className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/80">
        <Sprout size={12} />
        <span>
          <span className="font-jp">種</span> {seeds.length} / {MIN_SEEDS}–
          {MAX_SEEDS}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={clearSeeds}
          disabled={seeds.length === 0}
          className="rounded-full border border-washi-50/30 px-4 py-1.5 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10 disabled:opacity-30"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={seeds.length < MIN_SEEDS}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          次へ <Check size={12} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2: 塗り重ね — stack 5–7 lacquer layers by tapping a colour.
// ─────────────────────────────────────────────────────────────────────

function NurikasaneStep({
  layers,
  setLayers,
  onBack,
  onNext,
}: {
  layers: Layer[];
  setLayers: (l: Layer[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations();
  const muted = useMutedRef();
  const topColor = layers[layers.length - 1]?.color ?? WOOD_COLOR;
  const atMax = layers.length >= MAX_LAYERS;

  function paint(hex: string) {
    if (atMax) return;
    setLayers([...layers, { color: hex }]);
    playBrush({ mutedRef: muted, duration: 0.3 });
  }

  function undoLayer() {
    if (layers.length === 0) return;
    setLayers(layers.slice(0, -1));
    playClick({ mutedRef: muted, freq: 600 });
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-md text-center text-sm leading-relaxed text-washi-50/80">
        {t("stages.tsugaru.nurikasane.hint")}
      </p>

      <div className="flex items-center gap-4">
        {/* Top-down bowl with current top colour */}
        <div
          className="relative aspect-square w-[min(64vw,18rem)] overflow-hidden rounded-full border border-washi-50/10 shadow-2xl shadow-black/60"
          style={{ background: "#0d0a08" }}
        >
          <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
            <circle
              cx="200"
              cy="200"
              r="190"
              fill="#0a0604"
              stroke="#3a2614"
              strokeWidth="2"
            />
            <circle cx="200" cy="200" r="170" fill={topColor} />
            <ellipse
              cx="160"
              cy="140"
              rx="70"
              ry="32"
              fill="#ffffff"
              opacity="0.1"
            />
            <ellipse
              cx="240"
              cy="260"
              rx="40"
              ry="14"
              fill="#000000"
              opacity="0.18"
            />
          </svg>
        </div>

        {/* Cross-section view — pedagogical "what's beneath the surface" */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-[0.55rem] uppercase tracking-[0.3em] text-washi-50/60">
            <span className="font-jp">断面</span>
          </p>
          <div className="flex h-[min(64vw,18rem)] w-9 flex-col-reverse overflow-hidden rounded-sm border border-washi-50/15 bg-[#0d0a08]">
            {/* Wood base */}
            <span
              className="block"
              style={{ background: WOOD_COLOR, height: "12%" }}
            />
            {layers.map((l, i) => (
              <span
                key={i}
                className="block"
                style={{
                  background: l.color,
                  height: `${88 / MAX_LAYERS}%`,
                }}
              />
            ))}
          </div>
          <p className="text-[0.55rem] uppercase tracking-[0.3em] text-washi-50/60">
            {layers.length} / {MAX_LAYERS}
          </p>
        </div>
      </div>

      {/* Palette */}
      <div className="flex items-center gap-2">
        {PALETTE_COLORS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => paint(p.hex)}
            disabled={atMax}
            className="group relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-washi-50/30 transition hover:scale-110 hover:border-washi-50/80 disabled:opacity-30 disabled:hover:scale-100"
            style={{ background: p.hex }}
            aria-label={`${p.jp} を塗る`}
          >
            <span className="font-jp pointer-events-none text-[0.7rem] text-washi-50 opacity-0 mix-blend-difference transition group-hover:opacity-100">
              {p.jp}
            </span>
          </button>
        ))}
      </div>

      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/70">
        {layers.length < MIN_LAYERS ? (
          <>
            あと <span className="font-jp">{MIN_LAYERS - layers.length}</span>{" "}
            層
          </>
        ) : atMax ? (
          <span className="font-jp">塗り上限</span>
        ) : (
          <span className="font-jp">塗り重ね OK</span>
        )}
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-1.5 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
        <button
          type="button"
          onClick={undoLayer}
          disabled={layers.length === 0}
          className="rounded-full border border-washi-50/30 px-4 py-1.5 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10 disabled:opacity-30"
        >
          1 層 戻す
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={layers.length < MIN_LAYERS}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          次へ <Check size={12} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3: 乾燥 — passive dry animation in the urushi-buro.
// ─────────────────────────────────────────────────────────────────────

function KansoStep({
  topColor,
  onBack,
  onDone,
}: {
  topColor: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const muted = useMutedRef();
  const [progress, setProgress] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    playFire({ mutedRef: muted, duration: 3.0 });
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      if (!mountedRef.current) return;
      const t = Math.min(1, (performance.now() - start) / KANSO_DURATION_MS);
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const advance = setTimeout(() => {
      if (mountedRef.current) onDone();
    }, KANSO_DURATION_MS + 200);
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(raf);
      clearTimeout(advance);
    };
    // onDone / muted are stable refs/callbacks; we only want the kiln
    // to ignite once when this step mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const glossOpacity = (0.1 + progress * 0.22).toFixed(3);
  const haloOpacity = (progress * 0.45).toFixed(3);
  const secondaryGloss = (progress * 0.08).toFixed(3);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-md text-center text-sm leading-relaxed text-washi-50/80">
        {t("stages.tsugaru.kanso.hint")}
      </p>

      <div
        className="relative aspect-square w-[min(80vw,22rem)] overflow-hidden rounded-full border border-washi-50/10 shadow-2xl shadow-black/60"
        style={{ background: "#0d0a08" }}
      >
        <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
          <circle
            cx="200"
            cy="200"
            r="190"
            fill="#0a0604"
            stroke="#3a2614"
            strokeWidth="2"
          />
          <circle cx="200" cy="200" r="170" fill={topColor} />
          <ellipse
            cx="160"
            cy="140"
            rx="70"
            ry="32"
            fill="#ffffff"
            opacity={glossOpacity}
          />
          <ellipse
            cx="250"
            cy="270"
            rx="42"
            ry="16"
            fill="#ffffff"
            opacity={secondaryGloss}
          />
          <circle
            cx="200"
            cy="200"
            r="190"
            fill="none"
            stroke="#C9A227"
            strokeWidth="3"
            opacity={haloOpacity}
          />
        </svg>
      </div>

      <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300"
          style={{ width: `${(progress * 100).toFixed(2)}%` }}
        />
      </div>
      <p className="font-jp inline-flex items-center gap-2 text-[0.7rem] tracking-[0.3em] text-washi-50/70">
        <Flame size={12} /> 漆風呂で乾かしている…
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-1.5 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 4: 研ぎ出し — drag the polishing stone over the surface; the
// concentric coloured rings around each seed bloom into 唐塗 spots.
// ─────────────────────────────────────────────────────────────────────

const TOGI_SIZE = 480;
const TOGI_RADIUS = 220;
const TOGI_CENTER = TOGI_SIZE / 2;
const POLISH_GRID = 48;
const BRUSH_RADIUS = 18;

function TogidashiStep({
  seeds,
  layers,
  finalizing,
  onBack,
  onDone,
}: {
  seeds: Seed[];
  layers: Layer[];
  finalizing: boolean;
  onBack: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const t = useTranslations();
  const muted = useMutedRef();
  const visibleRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const topRef = useRef<HTMLCanvasElement | null>(null);

  const [polished, setPolished] = useState(0);
  const polishedRef = useRef(0);
  const draggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastBrushSoundRef = useRef(0);

  const polishGridRef = useRef<Uint8Array>(
    new Uint8Array(POLISH_GRID * POLISH_GRID),
  );
  const totalCellsRef = useRef(0);

  // Stable layer colour list (memoised so draw effect doesn't re-fire
  // on unrelated re-renders).
  const layerColors = useMemo(
    () => (layers.length > 0 ? layers.map((l) => l.color) : [WOOD_COLOR]),
    [layers],
  );

  // Build offscreen canvases once, then composite to visible.
  useEffect(() => {
    // 1. Count cells inside the bowl for the polish-progress denominator.
    let total = 0;
    polishGridRef.current.fill(0);
    for (let gy = 0; gy < POLISH_GRID; gy++) {
      for (let gx = 0; gx < POLISH_GRID; gx++) {
        const cx = ((gx + 0.5) / POLISH_GRID) * TOGI_SIZE;
        const cy = ((gy + 0.5) / POLISH_GRID) * TOGI_SIZE;
        const dx = cx - TOGI_CENTER;
        const dy = cy - TOGI_CENTER;
        if (dx * dx + dy * dy < TOGI_RADIUS * TOGI_RADIUS) total++;
      }
    }
    totalCellsRef.current = total;
    polishedRef.current = 0;
    setPolished(0);

    // 2. Base canvas — wood, oldest-layer wash, then concentric
    //    layer rings around each seed (newest = outer, oldest = inner).
    const base = document.createElement("canvas");
    base.width = TOGI_SIZE;
    base.height = TOGI_SIZE;
    const bctx = base.getContext("2d");
    if (!bctx) return;
    bctx.fillStyle = "#1a0e08";
    bctx.fillRect(0, 0, TOGI_SIZE, TOGI_SIZE);
    bctx.save();
    bctx.beginPath();
    bctx.arc(TOGI_CENTER, TOGI_CENTER, TOGI_RADIUS, 0, Math.PI * 2);
    bctx.clip();
    // Wash with oldest layer (the colour you eventually reach if you
    // polish very deep).
    bctx.fillStyle = layerColors[0];
    bctx.fillRect(0, 0, TOGI_SIZE, TOGI_SIZE);
    // Concentric rings per seed, deterministic radius variance via id.
    for (const seed of seeds) {
      const sx = (seed.x / 400) * TOGI_SIZE;
      const sy = (seed.y / 400) * TOGI_SIZE;
      const variant = ((seed.id * 9301 + 49297) % 233280) / 233280;
      const baseRingR = 30 + variant * 18;
      // Outermost ring uses second-newest colour (the newest is the
      // top fill that gets erased), so polishing through reveals
      // newest -> next-newest -> ... -> oldest.
      const ringCount = layerColors.length;
      for (let li = ringCount - 1; li >= 0; li--) {
        const t = (li + 1) / ringCount;
        const r = baseRingR * t;
        bctx.fillStyle = layerColors[li];
        bctx.beginPath();
        bctx.arc(sx, sy, r, 0, Math.PI * 2);
        bctx.fill();
      }
      // Dark seed core.
      bctx.fillStyle = "#0a0604";
      bctx.beginPath();
      bctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
      bctx.fill();
    }
    bctx.restore();
    // Bowl rim accent.
    bctx.strokeStyle = "#3a2614";
    bctx.lineWidth = 4;
    bctx.beginPath();
    bctx.arc(TOGI_CENTER, TOGI_CENTER, TOGI_RADIUS, 0, Math.PI * 2);
    bctx.stroke();
    baseRef.current = base;

    // 3. Top canvas — opaque newest-layer fill, erased by the brush.
    const top = document.createElement("canvas");
    top.width = TOGI_SIZE;
    top.height = TOGI_SIZE;
    const tctx = top.getContext("2d");
    if (!tctx) return;
    tctx.fillStyle = layerColors[layerColors.length - 1];
    tctx.beginPath();
    tctx.arc(TOGI_CENTER, TOGI_CENTER, TOGI_RADIUS - 1, 0, Math.PI * 2);
    tctx.fill();
    // Subtle gloss on the unpolished surface.
    tctx.fillStyle = "rgba(255,255,255,0.1)";
    tctx.beginPath();
    tctx.ellipse(
      TOGI_CENTER - 50,
      TOGI_CENTER - 70,
      80,
      30,
      0,
      0,
      Math.PI * 2,
    );
    tctx.fill();
    topRef.current = top;

    composite();
    // Re-build only when seeds / layers change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeds, layerColors]);

  function composite() {
    const visible = visibleRef.current;
    const base = baseRef.current;
    const top = topRef.current;
    if (!visible || !base || !top) return;
    const ctx = visible.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, TOGI_SIZE, TOGI_SIZE);
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(top, 0, 0);
  }

  function applyBrush(
    x: number,
    y: number,
    prev: { x: number; y: number } | null,
  ) {
    const top = topRef.current;
    if (!top) return;
    const tctx = top.getContext("2d");
    if (!tctx) return;
    tctx.save();
    tctx.globalCompositeOperation = "destination-out";
    if (prev) {
      tctx.lineWidth = BRUSH_RADIUS * 2;
      tctx.lineCap = "round";
      tctx.strokeStyle = "rgba(0,0,0,1)";
      tctx.beginPath();
      tctx.moveTo(prev.x, prev.y);
      tctx.lineTo(x, y);
      tctx.stroke();
    } else {
      tctx.fillStyle = "rgba(0,0,0,1)";
      tctx.beginPath();
      tctx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
      tctx.fill();
    }
    tctx.restore();

    // Mark grid cells within the brush stamp + segment so polish
    // progress reflects what the user can actually see revealed.
    const grid = polishGridRef.current;
    const samples: Array<[number, number]> = [[x, y]];
    if (prev) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.ceil(dist / (BRUSH_RADIUS * 0.5)));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        samples.push([prev.x + dx * t, prev.y + dy * t]);
      }
    }
    for (const [sx, sy] of samples) {
      const minGx = Math.max(
        0,
        Math.floor(((sx - BRUSH_RADIUS) / TOGI_SIZE) * POLISH_GRID),
      );
      const maxGx = Math.min(
        POLISH_GRID - 1,
        Math.floor(((sx + BRUSH_RADIUS) / TOGI_SIZE) * POLISH_GRID),
      );
      const minGy = Math.max(
        0,
        Math.floor(((sy - BRUSH_RADIUS) / TOGI_SIZE) * POLISH_GRID),
      );
      const maxGy = Math.min(
        POLISH_GRID - 1,
        Math.floor(((sy + BRUSH_RADIUS) / TOGI_SIZE) * POLISH_GRID),
      );
      for (let gy = minGy; gy <= maxGy; gy++) {
        for (let gx = minGx; gx <= maxGx; gx++) {
          const cx = ((gx + 0.5) / POLISH_GRID) * TOGI_SIZE;
          const cy = ((gy + 0.5) / POLISH_GRID) * TOGI_SIZE;
          const ddx = cx - sx;
          const ddy = cy - sy;
          const dxc = cx - TOGI_CENTER;
          const dyc = cy - TOGI_CENTER;
          if (
            ddx * ddx + ddy * ddy < BRUSH_RADIUS * BRUSH_RADIUS &&
            dxc * dxc + dyc * dyc < TOGI_RADIUS * TOGI_RADIUS
          ) {
            grid[gy * POLISH_GRID + gx] = 1;
          }
        }
      }
    }
    let polishedCount = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i]) polishedCount++;
    const ratio = polishedCount / Math.max(1, totalCellsRef.current);
    if (Math.abs(ratio - polishedRef.current) > 0.005) {
      polishedRef.current = ratio;
      setPolished(ratio);
    }
    composite();
  }

  function getCanvasPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * TOGI_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * TOGI_SIZE,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const pos = getCanvasPos(e);
    lastPosRef.current = pos;
    applyBrush(pos.x, pos.y, null);
    playBrush({ mutedRef: muted, duration: 0.15 });
    lastBrushSoundRef.current = performance.now();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!draggingRef.current) return;
    const pos = getCanvasPos(e);
    applyBrush(pos.x, pos.y, lastPosRef.current);
    lastPosRef.current = pos;
    const now = performance.now();
    if (now - lastBrushSoundRef.current > 130) {
      playBrush({ mutedRef: muted, duration: 0.15 });
      lastBrushSoundRef.current = now;
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    draggingRef.current = false;
    lastPosRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function complete() {
    const visible = visibleRef.current;
    if (!visible) return;
    if (polished < POLISH_TARGET || finalizing) return;
    playChime({ mutedRef: muted });
    onDone(visible.toDataURL("image/png"));
  }

  const ratioBar = Math.min(100, (polished * 100) / POLISH_TARGET);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-md text-center text-sm leading-relaxed text-washi-50/80">
        {t("stages.tsugaru.togidashi.hint")}
      </p>

      <div
        className="relative aspect-square w-[min(80vw,22rem)] overflow-hidden rounded-full border border-washi-50/10 shadow-2xl shadow-black/60"
        style={{ background: "#0d0a08" }}
      >
        <canvas
          ref={visibleRef}
          width={TOGI_SIZE}
          height={TOGI_SIZE}
          className="absolute inset-0 h-full w-full cursor-pointer touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300 transition-[width] duration-100"
          style={{ width: `${ratioBar.toFixed(2)}%` }}
        />
      </div>
      <p className="inline-flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/70">
        <BrushIcon size={12} />
        <span className="font-jp">研ぎ進捗</span>{" "}
        {Math.round(polished * 100)}% (≥{Math.round(POLISH_TARGET * 100)}%
        で完成)
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-1.5 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
        <button
          type="button"
          onClick={complete}
          disabled={polished < POLISH_TARGET || finalizing}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> {t("common.complete")}
        </button>
      </div>
    </div>
  );
}
