"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Brush,
  Check,
  Eye,
  Flower2,
  Sparkles,
} from "lucide-react";
import {
  playBrush,
  playChime,
  playClick,
  useMutedRef,
} from "@/lib/craftAudio";

// ─────────────────────────────────────────────────────────────────────
// Types & data
// ─────────────────────────────────────────────────────────────────────

type KataKey = "hime" | "busho" | "warabe" | "no";
type ZoneId = "z1" | "z2" | "z3" | "z4";
type ColorKey = "shu" | "gunjo" | "byakugun" | "kin";
type PatternKey = "sakura" | "yabane" | "asanoha" | "karakusa";

interface KataDef {
  jp: string;
  romaji: string;
  description: string;
  /** clay-color base layers drawn first (head, hair, body silhouette) */
  base: ReactNode;
  /** colorable kimono zones drawn over the base */
  zones: { id: ZoneId; jp: string; d: string }[];
  /** face area used for me-ire close-up */
  face: { cx: number; cy: number; rx: number; ry: number };
  /** eye landmark positions in viewBox coordinates */
  eyes: { left: { cx: number; cy: number }; right: { cx: number; cy: number } };
  /** rectangular zone where mongon (patterns) may be placed */
  mongonBounds: { x: number; y: number; w: number; h: number };
}

const VIEW_W = 200;
const VIEW_H = 320;
const CLAY = "#d8c0a0";
const CLAY_DARK = "#a48360";
const CLAY_SHADOW = "rgba(60,38,18,0.35)";
const HAIR = "#1a120b";

const COLOR_NAMES: Record<ColorKey, { jp: string; hex: string }> = {
  shu: { jp: "朱", hex: "#C03D2B" },
  gunjo: { jp: "群青", hex: "#2B4A6F" },
  byakugun: { jp: "白群", hex: "#C9DBE5" },
  kin: { jp: "金", hex: "#C9A227" },
};

const PATTERN_NAMES: Record<PatternKey, { jp: string; romaji: string }> = {
  sakura: { jp: "桜", romaji: "Sakura" },
  yabane: { jp: "矢羽根", romaji: "Yabane" },
  asanoha: { jp: "麻の葉", romaji: "Asanoha" },
  karakusa: { jp: "唐草", romaji: "Karakusa" },
};

const TARGET_PATTERNS = 5;

// ─────────────────────────────────────────────────────────────────────
// Kata silhouettes
// All paths use viewBox 0 0 200 320. Each kata has a clay base layer
// (drawn unconditionally) plus 4 colorable zones layered on top.
// ─────────────────────────────────────────────────────────────────────

const KATA: Record<KataKey, KataDef> = {
  hime: {
    jp: "姫",
    romaji: "Hime",
    description: "美人物 · 振袖の優美",
    base: (
      <g>
        <path d="M75,38 Q100,18 125,38 L128,60 L72,60 Z" fill={HAIR} />
        <ellipse cx={100} cy={66} rx={23} ry={28} fill={CLAY} />
        <ellipse cx={100} cy={66} rx={23} ry={28} fill="none" stroke={CLAY_DARK} strokeWidth={0.5} />
        <rect x={94} y={90} width={12} height={8} fill={CLAY} />
        <path d="M82,98 L74,154 L46,266 L154,266 L126,154 L118,98 Z" fill={CLAY} />
        <path d="M82,98 L74,154 L46,266 L154,266 L126,154 L118,98 Z" fill="none" stroke={CLAY_DARK} strokeWidth={0.6} />
      </g>
    ),
    zones: [
      { id: "z1", jp: "袖（左）", d: "M48,108 L74,98 L74,168 L40,184 Z" },
      { id: "z2", jp: "袖（右）", d: "M152,108 L126,98 L126,168 L160,184 Z" },
      { id: "z3", jp: "帯", d: "M74,154 L126,154 L132,172 L68,172 Z" },
      { id: "z4", jp: "裾", d: "M68,172 L132,172 L154,266 L46,266 Z" },
    ],
    face: { cx: 100, cy: 66, rx: 23, ry: 28 },
    eyes: { left: { cx: 91, cy: 64 }, right: { cx: 109, cy: 64 } },
    mongonBounds: { x: 50, y: 105, w: 100, h: 145 },
  },
  busho: {
    jp: "武将",
    romaji: "Bushō",
    description: "鎧武者 · 甲冑の威風",
    base: (
      <g>
        <path d="M95,8 L100,-2 L105,8 L102,18 L98,18 Z" fill="#b8901c" />
        <path d="M62,22 L100,8 L138,22 L142,58 L58,58 Z" fill={HAIR} />
        <path d="M62,22 L100,8 L138,22 L142,58 L58,58 Z" fill="none" stroke="#3a2510" strokeWidth={0.6} />
        <ellipse cx={100} cy={76} rx={22} ry={24} fill={CLAY} />
        <ellipse cx={100} cy={76} rx={22} ry={24} fill="none" stroke={CLAY_DARK} strokeWidth={0.5} />
        <rect x={94} y={98} width={12} height={6} fill={CLAY} />
        <path d="M64,104 L70,184 L82,266 L118,266 L130,184 L136,104 Z" fill={CLAY} />
      </g>
    ),
    zones: [
      { id: "z1", jp: "袖（左）", d: "M28,104 L70,94 L70,158 L26,168 Z" },
      { id: "z2", jp: "袖（右）", d: "M172,104 L130,94 L130,158 L174,168 Z" },
      { id: "z3", jp: "胴", d: "M70,104 L130,104 L130,176 L70,176 Z" },
      { id: "z4", jp: "草摺", d: "M64,176 L136,176 L152,266 L48,266 Z" },
    ],
    face: { cx: 100, cy: 76, rx: 22, ry: 24 },
    eyes: { left: { cx: 91, cy: 74 }, right: { cx: 109, cy: 74 } },
    mongonBounds: { x: 30, y: 100, w: 140, h: 160 },
  },
  warabe: {
    jp: "童",
    romaji: "Warabe",
    description: "子供 · 丸顔の愛らしさ",
    base: (
      <g>
        <ellipse cx={100} cy={28} rx={6} ry={5} fill={HAIR} />
        <path d="M62,40 Q100,20 138,40 L142,68 L58,68 Z" fill={HAIR} />
        <ellipse cx={100} cy={78} rx={40} ry={42} fill={CLAY} />
        <ellipse cx={100} cy={78} rx={40} ry={42} fill="none" stroke={CLAY_DARK} strokeWidth={0.5} />
        <rect x={94} y={118} width={12} height={6} fill={CLAY} />
        <path d="M68,124 L62,256 L138,256 L132,124 Z" fill={CLAY} />
        <path d="M68,124 L62,256 L138,256 L132,124 Z" fill="none" stroke={CLAY_DARK} strokeWidth={0.6} />
      </g>
    ),
    zones: [
      { id: "z1", jp: "前掛け", d: "M84,124 L116,124 L116,184 L84,184 Z" },
      { id: "z2", jp: "帯", d: "M68,184 L132,184 L132,202 L68,202 Z" },
      { id: "z3", jp: "袴（左）", d: "M66,202 L100,202 L98,256 L62,256 Z" },
      { id: "z4", jp: "袴（右）", d: "M100,202 L134,202 L138,256 L102,256 Z" },
    ],
    face: { cx: 100, cy: 78, rx: 40, ry: 42 },
    eyes: { left: { cx: 86, cy: 76 }, right: { cx: 114, cy: 76 } },
    mongonBounds: { x: 65, y: 124, w: 70, h: 130 },
  },
  no: {
    jp: "能",
    romaji: "Nō",
    description: "能装束 · 面と烏帽子",
    base: (
      <g>
        <path d="M68,30 L132,30 L138,42 L62,42 Z" fill={HAIR} />
        <path d="M82,42 L118,42 L122,102 L78,102 Z" fill="#f0e3c8" />
        <path d="M82,42 L118,42 L122,102 L78,102 Z" fill="none" stroke="#7a6a4a" strokeWidth={0.6} />
        <rect x={94} y={102} width={12} height={6} fill={CLAY} />
        <path d="M82,108 L72,200 L70,266 L130,266 L128,200 L118,108 Z" fill={CLAY} />
        <path d="M82,108 L72,200 L70,266 L130,266 L128,200 L118,108 Z" fill="none" stroke={CLAY_DARK} strokeWidth={0.6} />
      </g>
    ),
    zones: [
      { id: "z1", jp: "唐衣（左）", d: "M48,114 L82,104 L82,188 L46,202 Z" },
      { id: "z2", jp: "唐衣（右）", d: "M152,114 L118,104 L118,188 L154,202 Z" },
      { id: "z3", jp: "帯", d: "M78,164 L122,164 L126,184 L74,184 Z" },
      { id: "z4", jp: "袴", d: "M74,184 L126,184 L130,266 L70,266 Z" },
    ],
    face: { cx: 100, cy: 72, rx: 20, ry: 30 },
    eyes: { left: { cx: 92, cy: 68 }, right: { cx: 108, cy: 68 } },
    mongonBounds: { x: 50, y: 110, w: 100, h: 150 },
  },
};

const KATA_ORDER: KataKey[] = ["hime", "busho", "warabe", "no"];

// ─────────────────────────────────────────────────────────────────────
// Pattern motifs (drawn as small SVG groups)
// ─────────────────────────────────────────────────────────────────────

function PatternMotif({
  kind,
  cx,
  cy,
  size = 16,
}: {
  kind: PatternKey;
  cx: number;
  cy: number;
  size?: number;
}) {
  if (kind === "sakura") {
    const petals = [];
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const px = Math.round((cx + Math.cos(angle) * size * 0.35) * 100) / 100;
      const py = Math.round((cy + Math.sin(angle) * size * 0.35) * 100) / 100;
      petals.push(
        <ellipse
          key={i}
          cx={px}
          cy={py}
          rx={size * 0.28}
          ry={size * 0.4}
          transform={`rotate(${(angle * 180) / Math.PI + 90} ${px} ${py})`}
          fill="#fbe2e6"
          stroke="#c5566f"
          strokeWidth={0.4}
        />,
      );
    }
    return (
      <g pointerEvents="none">
        {petals}
        <circle cx={cx} cy={cy} r={size * 0.14} fill="#f7b94a" />
      </g>
    );
  }
  if (kind === "yabane") {
    return (
      <g pointerEvents="none">
        <path
          d={`M${cx - size * 0.4},${cy + size * 0.4} L${cx},${cy - size * 0.4} L${cx + size * 0.4},${cy + size * 0.4} L${cx},${cy + size * 0.1} Z`}
          fill="#f4eee0"
          stroke="#3a2a18"
          strokeWidth={0.6}
        />
        <line
          x1={Math.round((cx - size * 0.4) * 100) / 100}
          y1={Math.round((cy + size * 0.4) * 100) / 100}
          x2={Math.round(cx * 100) / 100}
          y2={Math.round((cy - size * 0.4) * 100) / 100}
          stroke="#3a2a18"
          strokeWidth={0.4}
        />
        <line
          x1={Math.round((cx + size * 0.4) * 100) / 100}
          y1={Math.round((cy + size * 0.4) * 100) / 100}
          x2={Math.round(cx * 100) / 100}
          y2={Math.round((cy - size * 0.4) * 100) / 100}
          stroke="#3a2a18"
          strokeWidth={0.4}
        />
      </g>
    );
  }
  if (kind === "asanoha") {
    const lines = [];
    const r = size * 0.45;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const x = Math.round((cx + Math.cos(angle) * r) * 100) / 100;
      const y = Math.round((cy + Math.sin(angle) * r) * 100) / 100;
      lines.push(
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke="#1f3a5a"
          strokeWidth={0.6}
        />,
      );
    }
    const hex: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const x = Math.round((cx + Math.cos(angle) * r) * 100) / 100;
      const y = Math.round((cy + Math.sin(angle) * r) * 100) / 100;
      hex.push(`${x},${y}`);
    }
    return (
      <g pointerEvents="none">
        <polygon
          points={hex.join(" ")}
          fill="rgba(245,232,210,0.6)"
          stroke="#1f3a5a"
          strokeWidth={0.6}
        />
        {lines}
      </g>
    );
  }
  // karakusa — vine swirl
  const r = size * 0.4;
  return (
    <g pointerEvents="none">
      <path
        d={`M${cx - r},${cy} Q${cx - r * 0.4},${cy - r} ${cx},${cy} Q${cx + r * 0.4},${cy + r} ${cx + r},${cy}`}
        fill="none"
        stroke="#3a6b3a"
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      <circle cx={Math.round((cx - r) * 100) / 100} cy={cy} r={size * 0.1} fill="#3a6b3a" />
      <circle cx={Math.round((cx + r) * 100) / 100} cy={cy} r={size * 0.1} fill="#3a6b3a" />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Doll body — shared renderer for steps 2-4 (bird's-eye view)
// ─────────────────────────────────────────────────────────────────────

interface PlacedPattern {
  id: number;
  kind: PatternKey;
  x: number;
  y: number;
}

function DollBody({
  kata,
  zoneColors,
  patterns,
  highlightZone,
  onZoneClick,
  onZoneEnter,
  onZoneLeave,
}: {
  kata: KataKey;
  zoneColors: Partial<Record<ZoneId, ColorKey>>;
  patterns: PlacedPattern[];
  highlightZone?: ZoneId | null;
  onZoneClick?: (zone: ZoneId, evt: React.PointerEvent<SVGPathElement>) => void;
  onZoneEnter?: (zone: ZoneId) => void;
  onZoneLeave?: (zone: ZoneId) => void;
}) {
  const def = KATA[kata];
  return (
    <>
      {def.base}
      {def.zones.map((z) => {
        const colorKey = zoneColors[z.id];
        const fill = colorKey ? COLOR_NAMES[colorKey].hex : "rgba(216,192,160,0.18)";
        const stroke =
          highlightZone === z.id ? "#fff7d6" : "rgba(60,38,18,0.4)";
        const strokeWidth = highlightZone === z.id ? 1.4 : 0.6;
        return (
          <path
            key={z.id}
            d={z.d}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            style={{
              transition: "fill 220ms ease, stroke 160ms ease",
              cursor: onZoneClick ? "pointer" : "default",
            }}
            onPointerDown={
              onZoneClick
                ? (e) => {
                    e.preventDefault();
                    onZoneClick(z.id, e);
                  }
                : undefined
            }
            onPointerEnter={onZoneEnter ? () => onZoneEnter(z.id) : undefined}
            onPointerLeave={onZoneLeave ? () => onZoneLeave(z.id) : undefined}
          />
        );
      })}
      {/* subtle shadow under doll */}
      <ellipse cx={100} cy={282} rx={56} ry={6} fill={CLAY_SHADOW} />
      {patterns.map((p) => (
        <PatternMotif key={p.id} kind={p.kind} cx={p.x} cy={p.y} size={18} />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main stage
// ─────────────────────────────────────────────────────────────────────

export function HakataNingyoStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const mutedRef = useMutedRef();
  const [stepIdx, setStepIdx] = useState(0);
  const [kata, setKata] = useState<KataKey | null>(null);
  const [zoneColors, setZoneColors] = useState<Partial<Record<ZoneId, ColorKey>>>(
    {},
  );
  const [patterns, setPatterns] = useState<PlacedPattern[]>([]);
  const [eyesEntered, setEyesEntered] = useState(0);

  const steps = useMemo(
    () => [
      { jp: "型選び", romaji: "Kata", icon: Sparkles },
      { jp: "彩色", romaji: "Chakushoku", icon: Brush },
      { jp: "文様", romaji: "Mongon", icon: Flower2 },
      { jp: "目入れ", romaji: "Me-ire", icon: Eye },
    ],
    [],
  );
  const TOTAL = steps.length;
  const step = steps[stepIdx];

  const goPrev = useCallback(() => {
    playClick({ mutedRef, freq: 700 });
    setStepIdx((i) => Math.max(0, i - 1));
  }, [mutedRef]);
  const goNext = useCallback(() => {
    playClick({ mutedRef, freq: 1000 });
    setStepIdx((i) => Math.min(TOTAL - 1, i + 1));
  }, [mutedRef, TOTAL]);

  // ─── Finalize ────────────────────────────────────────────────────
  const finalizingRef = useRef(false);
  const [finalizing, setFinalizing] = useState(false);
  const mountedRef = useRef(true);
  const finaleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      for (const id of finaleTimersRef.current) clearTimeout(id);
      finaleTimersRef.current = [];
    };
  }, []);

  const finalize = useCallback(
    (svgEl: SVGSVGElement | null) => {
      if (finalizingRef.current) return;
      if (!svgEl || !kata) return;
      finalizingRef.current = true;
      setFinalizing(true);
      playChime({ mutedRef, freq: 880 });

      // If anything goes wrong with the SVG → PNG path (decode error,
      // missing 2D context, etc.), reset finalizing state so the user
      // can retry instead of being stuck staring at a disabled button.
      const recover = () => {
        if (!mountedRef.current) return;
        finalizingRef.current = false;
        setFinalizing(false);
      };

      // Defer dataURL generation slightly so the chime + final flash
      // animations are visible before navigation.
      const t = setTimeout(() => {
        if (!mountedRef.current) return;
        try {
          const xml = new XMLSerializer().serializeToString(svgEl);
          const svgBlob = new Blob([xml], {
            type: "image/svg+xml;charset=utf-8",
          });
          const url = URL.createObjectURL(svgBlob);
          const img = new Image();
          img.onload = () => {
            if (!mountedRef.current) {
              URL.revokeObjectURL(url);
              return;
            }
            const canvas = document.createElement("canvas");
            const W = 800;
            const H = 1280;
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              URL.revokeObjectURL(url);
              recover();
              return;
            }
            // Dark cinematic backdrop matching the stage style.
            const grad = ctx.createRadialGradient(
              W / 2,
              H * 0.4,
              60,
              W / 2,
              H / 2,
              W * 0.8,
            );
            grad.addColorStop(0, "#2a1a0e");
            grad.addColorStop(1, "#0b0704");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
            ctx.drawImage(img, 0, 0, W, H);
            URL.revokeObjectURL(url);
            const dataUrl = canvas.toDataURL("image/png");
            onComplete(dataUrl);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            recover();
          };
          img.src = url;
        } catch {
          recover();
        }
      }, 1200);
      finaleTimersRef.current.push(t);
    },
    [kata, mutedRef, onComplete],
  );

  // Keep refs to the live SVG of MeireStep so finalize can serialize it.
  const meireSvgRef = useRef<SVGSVGElement | null>(null);

  // Recipe badge text
  const recipeBadge = kata
    ? `博多人形 · ${KATA[kata].jp} · 文様 ${patterns.length} · ${eyesEntered >= 2 ? "目入れ済" : "目入れ前"}`
    : "博多人形 · 制作中";

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      {/* Step indicator */}
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <step.icon size={14} />
        Step {stepIdx + 1} / {TOTAL} · <span className="font-jp">{step.jp}</span>
      </p>

      {/* Stage container */}
      <div className="relative h-[min(64vh,34rem)] w-[min(92vw,40rem)] overflow-hidden rounded-sm border border-washi-50/10 bg-[#1d130a] shadow-2xl shadow-black/60">
        {stepIdx === 0 && (
          <KataStep
            selected={kata}
            onSelect={(k) => {
              playClick({ mutedRef, freq: 1200 });
              setKata(k);
            }}
            mutedRef={mutedRef}
          />
        )}
        {stepIdx === 1 && kata && (
          <ChakushokuStep
            kata={kata}
            zoneColors={zoneColors}
            setZoneColors={setZoneColors}
            patterns={patterns}
            mutedRef={mutedRef}
          />
        )}
        {stepIdx === 2 && kata && (
          <MongonStep
            kata={kata}
            zoneColors={zoneColors}
            patterns={patterns}
            setPatterns={setPatterns}
            mutedRef={mutedRef}
          />
        )}
        {stepIdx === 3 && kata && (
          <MeireStep
            svgRef={meireSvgRef}
            kata={kata}
            zoneColors={zoneColors}
            patterns={patterns}
            eyesEntered={eyesEntered}
            setEyesEntered={setEyesEntered}
            onAllEyesIn={() => finalize(meireSvgRef.current)}
            finalizing={finalizing}
            mutedRef={mutedRef}
          />
        )}
      </div>

      {/* Educational sub-text */}
      <p className="max-w-[min(92vw,38rem)] text-center font-jp text-sm tracking-wider text-washi-50/85">
        {stepIdx === 0 && "博多人形は約400年の歴史。姫・武将・能・童, 各々の格がある"}
        {stepIdx === 1 && "胡粉(ごふん)と岩絵具で着物を彩色。重ね塗りで深みを出す"}
        {stepIdx === 2 && "桜・矢羽根・麻の葉・唐草。縁起と季節を文様で表す"}
        {stepIdx === 3 && "目入れ — 博多人形師の最終工程。人形に魂が宿る瞬間"}
      </p>

      {/* Per-step status pills */}
      <StepStatus
        stepIdx={stepIdx}
        kata={kata}
        zoneColors={zoneColors}
        patternsCount={patterns.length}
        eyesEntered={eyesEntered}
      />

      {/* Recipe badge */}
      <div className="mt-1 rounded-full border border-washi-50/15 bg-black/30 px-4 py-1 font-jp text-[0.7rem] tracking-wider text-washi-50/80 backdrop-blur">
        {recipeBadge}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        {stepIdx > 0 && (
          <button
            type="button"
            onClick={goPrev}
            disabled={finalizing}
            className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10 disabled:opacity-40"
          >
            <ArrowLeft size={12} /> 前へ戻る
          </button>
        )}
        {stepIdx < TOTAL - 1 && (
          <button
            type="button"
            onClick={goNext}
            disabled={!canAdvance(stepIdx, kata, zoneColors, patterns.length)}
            className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            次へ <Check size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function canAdvance(
  stepIdx: number,
  kata: KataKey | null,
  zoneColors: Partial<Record<ZoneId, ColorKey>>,
  patternsCount: number,
): boolean {
  if (stepIdx === 0) return kata !== null;
  if (stepIdx === 1)
    return (["z1", "z2", "z3", "z4"] as const).every((z) => zoneColors[z]);
  if (stepIdx === 2) return patternsCount >= TARGET_PATTERNS;
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Step status pills
// ─────────────────────────────────────────────────────────────────────

function StepStatus({
  stepIdx,
  kata,
  zoneColors,
  patternsCount,
  eyesEntered,
}: {
  stepIdx: number;
  kata: KataKey | null;
  zoneColors: Partial<Record<ZoneId, ColorKey>>;
  patternsCount: number;
  eyesEntered: number;
}) {
  if (stepIdx === 0) {
    return (
      <p className="text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/55">
        {kata ? `Selected · ${KATA[kata].romaji}` : "型を選んでください"}
      </p>
    );
  }
  if (stepIdx === 1) {
    const filled = (["z1", "z2", "z3", "z4"] as const).filter(
      (z) => zoneColors[z],
    ).length;
    return (
      <div className="flex items-center gap-2">
        {(["z1", "z2", "z3", "z4"] as const).map((z) => (
          <span
            key={z}
            className={`h-1 w-6 rounded-full transition-colors ${
              zoneColors[z] ? "bg-amber-300" : "bg-washi-50/20"
            }`}
          />
        ))}
        <span className="ml-2 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/55">
          {filled} / 4
        </span>
      </div>
    );
  }
  if (stepIdx === 2) {
    return (
      <p className="text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/55">
        文様 {patternsCount} / {TARGET_PATTERNS}+
      </p>
    );
  }
  return (
    <p className="text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/55">
      目入れ {eyesEntered} / 2
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — Kata
// ─────────────────────────────────────────────────────────────────────

function KataStep({
  selected,
  onSelect,
  mutedRef: _mutedRef,
}: {
  selected: KataKey | null;
  onSelect: (k: KataKey) => void;
  mutedRef: ReturnType<typeof useMutedRef>;
}) {
  return (
    <div className="absolute inset-0 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:gap-3 sm:p-5">
      {KATA_ORDER.map((k) => {
        const d = KATA[k];
        const isSelected = selected === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            aria-pressed={isSelected}
            className={`group flex h-full flex-col items-center justify-center gap-2 rounded-sm border bg-black/20 p-3 transition ${
              isSelected
                ? "scale-[1.04] border-amber-300 bg-black/55 shadow-[0_0_0_2px_rgba(255,210,120,0.18),0_18px_40px_rgba(0,0,0,0.6)]"
                : "border-washi-50/10 hover:border-amber-300/60 hover:bg-black/40"
            }`}
          >
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className={`w-auto transition ${
                isSelected ? "h-[78%] opacity-100" : "h-[68%] opacity-85 group-hover:scale-105"
              }`}
              aria-hidden
            >
              <DollBody kata={k} zoneColors={{}} patterns={[]} />
            </svg>
            <p
              className={`font-jp text-base tracking-wider ${
                isSelected ? "text-amber-200" : "text-washi-50"
              }`}
            >
              {d.jp}
            </p>
            <p className="text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/55">
              {d.romaji}
            </p>
            {isSelected && (
              <p className="font-jp text-[0.65rem] tracking-wider text-washi-50/75">
                {d.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — Chakushoku (彩色)
// ─────────────────────────────────────────────────────────────────────

function ChakushokuStep({
  kata,
  zoneColors,
  setZoneColors,
  patterns,
  mutedRef,
}: {
  kata: KataKey;
  zoneColors: Partial<Record<ZoneId, ColorKey>>;
  setZoneColors: React.Dispatch<
    React.SetStateAction<Partial<Record<ZoneId, ColorKey>>>
  >;
  patterns: PlacedPattern[];
  mutedRef: ReturnType<typeof useMutedRef>;
}) {
  const [activeColor, setActiveColor] = useState<ColorKey>("shu");
  const [hoverZone, setHoverZone] = useState<ZoneId | null>(null);
  const captureRef = useRef<number | null>(null);

  const handleZone = useCallback(
    (z: ZoneId, evt: React.PointerEvent<SVGPathElement>) => {
      try {
        evt.currentTarget.setPointerCapture(evt.pointerId);
        captureRef.current = evt.pointerId;
      } catch {
        /* best-effort */
      }
      playBrush({ mutedRef, duration: 0.3 });
      setZoneColors((prev) => ({ ...prev, [z]: activeColor }));
    },
    [activeColor, mutedRef, setZoneColors],
  );

  const releaseCapture = (evt: React.PointerEvent<SVGElement>) => {
    if (
      captureRef.current !== null &&
      evt.currentTarget.hasPointerCapture(captureRef.current)
    ) {
      evt.currentTarget.releasePointerCapture(captureRef.current);
    }
    captureRef.current = null;
  };

  return (
    <div className="absolute inset-0 flex">
      <div className="relative flex-1">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="absolute inset-0 mx-auto h-full w-full touch-none"
          onPointerUp={releaseCapture}
          onPointerCancel={releaseCapture}
        >
          <DollBody
            kata={kata}
            zoneColors={zoneColors}
            patterns={patterns}
            highlightZone={hoverZone}
            onZoneClick={handleZone}
            onZoneEnter={(z) => setHoverZone(z)}
            onZoneLeave={(z) =>
              setHoverZone((cur) => (cur === z ? null : cur))
            }
          />
        </svg>
      </div>
      {/* Color palette */}
      <div className="flex w-24 flex-col items-stretch justify-center gap-3 border-l border-washi-50/10 bg-black/30 p-3 backdrop-blur sm:w-28">
        <p className="text-center text-[0.55rem] uppercase tracking-[0.35em] text-washi-50/55">
          Iro
        </p>
        {(Object.keys(COLOR_NAMES) as ColorKey[]).map((c) => {
          const meta = COLOR_NAMES[c];
          const active = c === activeColor;
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setActiveColor(c);
                playClick({ mutedRef, freq: 1400 });
              }}
              className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 transition ${
                active
                  ? "border-amber-300 bg-white/10"
                  : "border-washi-50/15 hover:border-washi-50/40"
              }`}
            >
              <span
                className="h-5 w-5 rounded-full border border-black/30"
                style={{ background: meta.hex }}
              />
              <span className="font-jp text-xs tracking-wider text-washi-50">
                {meta.jp}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3 — Mongon (文様)
// ─────────────────────────────────────────────────────────────────────

function MongonStep({
  kata,
  zoneColors,
  patterns,
  setPatterns,
  mutedRef,
}: {
  kata: KataKey;
  zoneColors: Partial<Record<ZoneId, ColorKey>>;
  patterns: PlacedPattern[];
  setPatterns: React.Dispatch<React.SetStateAction<PlacedPattern[]>>;
  mutedRef: ReturnType<typeof useMutedRef>;
}) {
  const [activePattern, setActivePattern] = useState<PatternKey>("sakura");
  const idRef = useRef(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const captureRef = useRef<number | null>(null);
  const bounds = KATA[kata].mongonBounds;

  const handlePointerDown = (evt: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    // Map screen coords → SVG viewBox coords. getBoundingClientRect alone
    // is wrong because preserveAspectRatio="meet" letterboxes the
    // content; CTM-based transform is the correct mapping.
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    const sx = svgPt.x;
    const sy = svgPt.y;
    if (
      sx < bounds.x ||
      sx > bounds.x + bounds.w ||
      sy < bounds.y ||
      sy > bounds.y + bounds.h
    ) {
      return;
    }
    try {
      evt.currentTarget.setPointerCapture(evt.pointerId);
      captureRef.current = evt.pointerId;
    } catch {
      /* best-effort */
    }
    playClick({ mutedRef, freq: 1500 });
    setPatterns((prev) => [
      ...prev,
      {
        id: ++idRef.current,
        kind: activePattern,
        x: Math.round(sx * 100) / 100,
        y: Math.round(sy * 100) / 100,
      },
    ]);
  };

  const handlePointerUp = (evt: React.PointerEvent<SVGSVGElement>) => {
    if (
      captureRef.current !== null &&
      evt.currentTarget.hasPointerCapture(captureRef.current)
    ) {
      evt.currentTarget.releasePointerCapture(captureRef.current);
    }
    captureRef.current = null;
  };

  const undo = () => {
    if (patterns.length === 0) return;
    playClick({ mutedRef, freq: 600 });
    setPatterns((prev) => prev.slice(0, -1));
  };

  return (
    <div className="absolute inset-0 flex">
      <div className="relative flex-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="absolute inset-0 mx-auto h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <DollBody kata={kata} zoneColors={zoneColors} patterns={patterns} />
          {/* dashed bounds hint */}
          <rect
            x={bounds.x}
            y={bounds.y}
            width={bounds.w}
            height={bounds.h}
            fill="none"
            stroke="rgba(255,238,180,0.18)"
            strokeWidth={0.6}
            strokeDasharray="2 3"
            pointerEvents="none"
          />
        </svg>
      </div>
      {/* Pattern picker */}
      <div className="flex w-28 flex-col items-stretch justify-center gap-3 border-l border-washi-50/10 bg-black/30 p-3 backdrop-blur sm:w-32">
        <p className="text-center text-[0.55rem] uppercase tracking-[0.35em] text-washi-50/55">
          Mongon
        </p>
        {(Object.keys(PATTERN_NAMES) as PatternKey[]).map((p) => {
          const meta = PATTERN_NAMES[p];
          const active = p === activePattern;
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                setActivePattern(p);
                playClick({ mutedRef, freq: 1100 });
              }}
              className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 transition ${
                active
                  ? "border-amber-300 bg-white/10"
                  : "border-washi-50/15 hover:border-washi-50/40"
              }`}
            >
              <svg viewBox="-12 -12 24 24" className="h-5 w-5">
                <PatternMotif kind={p} cx={0} cy={0} size={20} />
              </svg>
              <span className="font-jp text-xs tracking-wider text-washi-50">
                {meta.jp}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={undo}
          disabled={patterns.length === 0}
          className="mt-2 rounded-sm border border-washi-50/15 px-2 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-washi-50/70 transition hover:bg-washi-50/10 disabled:opacity-30"
        >
          Undo
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 4 — Me-ire (目入れ)
// ─────────────────────────────────────────────────────────────────────

function MeireStep({
  svgRef,
  kata,
  zoneColors,
  patterns,
  eyesEntered,
  setEyesEntered,
  onAllEyesIn,
  finalizing,
  mutedRef,
}: {
  svgRef: React.MutableRefObject<SVGSVGElement | null>;
  kata: KataKey;
  zoneColors: Partial<Record<ZoneId, ColorKey>>;
  patterns: PlacedPattern[];
  eyesEntered: number;
  setEyesEntered: React.Dispatch<React.SetStateAction<number>>;
  onAllEyesIn: () => void;
  finalizing: boolean;
  mutedRef: ReturnType<typeof useMutedRef>;
}) {
  const def = KATA[kata];
  const [flash, setFlash] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // Close-up viewBox centered on face — zoom by ~2.4x
  const fc = def.face;
  const closeupW = Math.round(fc.rx * 4.4 * 100) / 100;
  const closeupH = Math.round(fc.ry * 4.4 * 100) / 100;
  const closeupX = Math.round((fc.cx - closeupW / 2) * 100) / 100;
  const closeupY = Math.round((fc.cy - closeupH / 2) * 100) / 100;

  // Animate target marker pulse with rAF
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      setPulse(0.5 + 0.5 * Math.sin(t * 4));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleEyeTap = (which: "left" | "right") => {
    if (finalizing) return;
    // Enforce order: left first, then right.
    if (which === "left" && eyesEntered !== 0) return;
    if (which === "right" && eyesEntered !== 1) return;
    const next = eyesEntered + 1;
    setEyesEntered(next);
    setFlash(true);
    setShakeKey((k) => k + 1);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(false), 200);
    playClick({ mutedRef, freq: 2200 });
    if (next === 2) {
      // Fire completion synchronously — the parent finalize() already
      // defers the dataURL generation by 1.2s for the chime/flash to
      // play, so adding another 350ms here is redundant and just
      // creates a window where double-tap could re-trigger.
      onAllEyesIn();
    }
  };

  const drawnEyes = (
    <>
      {eyesEntered >= 1 && (
        <g pointerEvents="none">
          <ellipse
            cx={def.eyes.left.cx}
            cy={def.eyes.left.cy}
            rx={2.6}
            ry={3.4}
            fill="#1a120b"
          />
          <ellipse
            cx={Math.round((def.eyes.left.cx - 0.6) * 100) / 100}
            cy={Math.round((def.eyes.left.cy - 0.8) * 100) / 100}
            rx={0.8}
            ry={1}
            fill="#fff"
            opacity={0.85}
          />
        </g>
      )}
      {eyesEntered >= 2 && (
        <g pointerEvents="none">
          <ellipse
            cx={def.eyes.right.cx}
            cy={def.eyes.right.cy}
            rx={2.6}
            ry={3.4}
            fill="#1a120b"
          />
          <ellipse
            cx={Math.round((def.eyes.right.cx - 0.6) * 100) / 100}
            cy={Math.round((def.eyes.right.cy - 0.8) * 100) / 100}
            rx={0.8}
            ry={1}
            fill="#fff"
            opacity={0.85}
          />
        </g>
      )}
    </>
  );

  const TargetMarker = ({
    cx,
    cy,
    visible,
  }: {
    cx: number;
    cy: number;
    visible: boolean;
  }) => {
    if (!visible) return null;
    const r1 = Math.round((4 + pulse * 2) * 100) / 100;
    const r2 = Math.round((7 + pulse * 3) * 100) / 100;
    return (
      <g pointerEvents="none">
        <circle
          cx={cx}
          cy={cy}
          r={r2}
          fill="none"
          stroke="rgba(255,235,150,0.85)"
          strokeWidth={0.7}
          opacity={0.6 + pulse * 0.4}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r1}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={0.7}
        />
        <line
          x1={Math.round((cx - r2 - 1) * 100) / 100}
          y1={cy}
          x2={Math.round((cx - r2 + 2) * 100) / 100}
          y2={cy}
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={0.5}
        />
        <line
          x1={Math.round((cx + r2 - 2) * 100) / 100}
          y1={cy}
          x2={Math.round((cx + r2 + 1) * 100) / 100}
          y2={cy}
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={0.5}
        />
      </g>
    );
  };

  return (
    <div className="absolute inset-0 grid grid-cols-1 lg:grid-cols-[1fr,1fr]">
      {/* Full doll preview */}
      <div className="relative hidden items-center justify-center border-r border-washi-50/10 bg-black/20 lg:flex">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-[88%] w-auto drop-shadow-[0_18px_40px_rgba(0,0,0,0.7)]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <DollBody kata={kata} zoneColors={zoneColors} patterns={patterns} />
          {drawnEyes}
        </svg>
      </div>
      {/* Face close-up */}
      <div
        className={`relative flex items-center justify-center ${
          shakeKey > 0 ? "" : ""
        }`}
      >
        <div
          key={shakeKey}
          className="relative h-full w-full"
          style={{
            animation:
              shakeKey > 0 ? "ningyo-shake 0.32s ease-out" : undefined,
          }}
        >
          <svg
            viewBox={`${closeupX} ${closeupY} ${closeupW} ${closeupH}`}
            className="absolute inset-0 mx-auto h-full w-full touch-none"
            preserveAspectRatio="xMidYMid meet"
          >
            <DollBody kata={kata} zoneColors={zoneColors} patterns={patterns} />
            {drawnEyes}
            {/* tap targets — invisible, larger hit area */}
            {eyesEntered === 0 && (
              <circle
                cx={def.eyes.left.cx}
                cy={def.eyes.left.cy}
                r={9}
                fill="rgba(0,0,0,0.001)"
                onPointerDown={(e) => {
                  e.preventDefault();
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    /* best-effort */
                  }
                  handleEyeTap("left");
                  try {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  } catch {
                    /* best-effort */
                  }
                }}
                style={{ cursor: "pointer" }}
              />
            )}
            {eyesEntered === 1 && (
              <circle
                cx={def.eyes.right.cx}
                cy={def.eyes.right.cy}
                r={9}
                fill="rgba(0,0,0,0.001)"
                onPointerDown={(e) => {
                  e.preventDefault();
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    /* best-effort */
                  }
                  handleEyeTap("right");
                  try {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  } catch {
                    /* best-effort */
                  }
                }}
                style={{ cursor: "pointer" }}
              />
            )}
            <TargetMarker
              cx={def.eyes.left.cx}
              cy={def.eyes.left.cy}
              visible={eyesEntered === 0}
            />
            <TargetMarker
              cx={def.eyes.right.cx}
              cy={def.eyes.right.cy}
              visible={eyesEntered === 1}
            />
          </svg>
        </div>
        {/* Flash overlay */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-150"
          style={{
            background:
              "radial-gradient(circle at center, rgba(255,255,255,0.75), rgba(255,255,255,0) 65%)",
            opacity: flash ? 1 : 0,
          }}
        />
        {/* Hint */}
        <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center font-jp text-xs tracking-wider text-washi-50/80">
          {eyesEntered === 0 && "左目をタップ"}
          {eyesEntered === 1 && "右目をタップ"}
          {eyesEntered === 2 && "魂が宿りました"}
        </p>
      </div>
      {/* Inline keyframes — kept local so the component is self-contained
          rather than depending on a global stylesheet. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes ningyo-shake {
              0% { transform: translate(0,0); }
              25% { transform: translate(-3px,1px); }
              50% { transform: translate(2px,-2px); }
              75% { transform: translate(-1px,2px); }
              100% { transform: translate(0,0); }
            }`,
        }}
      />
    </div>
  );
}
