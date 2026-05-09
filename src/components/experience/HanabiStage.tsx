"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  Package,
  Sparkles,
  Undo2,
} from "lucide-react";
import clsx from "clsx";
import { playBoom, playWhistle, useMutedRef } from "@/lib/craftAudio";

type Pattern =
  | "peony"
  | "chrysanthemum"
  | "willow"
  | "senrin"
  // Additional 割物 added in the grand-finale expansion
  | "yashi"      // 椰子 — palm tree drop
  | "yaeshin"    // 八重芯 — three-tier concentric expansion
  | "kobana"     // 小花 — main bloom + 4-6 mini satellite clusters
  // 型物 (katamono) — pictograph fireworks, modern artisan repertoire.
  | "heart"
  | "star"
  | "smiley";    // ニコちゃん — face shape (eyes + arc mouth)
type Step = "design" | "hoshi" | "tamabari" | "launch";

// Real shell sizes used by Japanese 花火師. Bigger shell = higher launch
// + larger bloom + more wrapping paper layers in 玉貼り. We considered
// adding a finale-only 二尺玉 (20号) for the grand climax, but at that
// scale the bloom radius spilled outside the canvas viewport, so the
// finale now climaxes with the user's pattern at 尺玉 (10号) instead.
type ShellSize = "3" | "5" | "7" | "10";

interface ShellSizeInfo {
  jp: string;       // "三号"
  cm: string;       // "9 cm"
  bloomM: string;   // "50 m"
  heightM: string;  // "120 m"
  desc: string;
  // Animation tuning. radiusFactor scales bloom speed/size, heightFactor
  // raises the bloom higher in the canvas (smaller targetYNorm).
  radiusFactor: number;
  heightFactor: number;
  // Number of paper layers wrapped in 玉貼り to reach this size.
  wrapTarget: number;
}

const SHELL_SIZE_INFO: Record<ShellSize, ShellSizeInfo> = {
  "3": {
    jp: "三号玉",
    cm: "約 9 cm",
    bloomM: "開花 50 m",
    heightM: "高さ 120 m",
    desc: "町の小さな祭りで上がる、最も親しみやすいサイズ。",
    radiusFactor: 0.7,
    heightFactor: 0.55,
    wrapTarget: 3,
  },
  "5": {
    jp: "五号玉",
    cm: "約 15 cm",
    bloomM: "開花 170 m",
    heightM: "高さ 190 m",
    desc: "地方花火大会の主役。バランスのとれた標準サイズ。",
    radiusFactor: 1.0,
    heightFactor: 0.45,
    wrapTarget: 7,
  },
  "7": {
    jp: "七号玉",
    cm: "約 21 cm",
    bloomM: "開花 230 m",
    heightM: "高さ 250 m",
    desc: "中規模花火大会の主役。五号と尺玉の中間、迫力と細工が両立。",
    radiusFactor: 1.2,
    heightFactor: 0.39,
    wrapTarget: 9,
  },
  "10": {
    jp: "尺玉(十号)",
    cm: "約 30 cm",
    bloomM: "開花 320 m",
    heightM: "高さ 330 m",
    desc: "大花火大会のクライマックス。重量約 8kg、玉貼り十数層。",
    radiusFactor: 1.4,
    heightFactor: 0.32,
    wrapTarget: 12,
  },
};

// Sizes the user can pick during the 玉貼り step (excludes the
// finale-only 二尺玉, which fires during complete()).
const SELECTABLE_SHELL_SIZES: ShellSize[] = ["3", "5", "7", "10"];

// Maximum number of layers the user can stack in 星掛け. Each tap on a
// colour adds a new outer ring; 5 layers is enough for visible burn-
// through without overwhelming the cross-section graphic.
const MAX_HOSHI_LAYERS = 5;
const MIN_HOSHI_LAYERS = 2;

// Round to 3 decimals — used for any computed value that lands inside
// JSX as an SVG attribute. Math.cos / Math.sin can produce slightly
// different last-bit floats between SSR (Node) and CSR (browser),
// which React 19 surfaces as a hydration mismatch ("57.896733171588906"
// vs "57.89673317158891"). Rounding to a fixed precision keeps the
// serialised string identical between the two passes.
const r3 = (n: number) => Math.round(n * 1000) / 1000;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  // Layered hoshi colours, sampled by life ratio at draw time so each
  // particle visibly transitions from outermost → innermost colour as
  // the gunpowder burns through. When omitted, `hue` is used directly.
  hueLayers?: number[];
  // Per-particle hue offset (±30°) so even a single-layer star bloom
  // has visual texture. Applied on top of the sampled layer hue.
  hueJitter?: number;
  trail: boolean;
  size: number;
  isFlash?: boolean;
}

interface Rocket {
  x: number;
  yNorm: number;
  vyNorm: number;
  targetYNorm: number;
  // Outermost (first-burning) hue used for the launch trail and the
  // initial flash. Bloom particles carry their own hueLayers reference.
  hue: number;
  pattern: Pattern;
  charge: number;
  // The full hoshi recipe + size factor are passed straight through to
  // spawnBurst so the bloom honours both.
  hueLayers: number[];
  sizeRadiusFactor: number;
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

const ALL_PATTERNS: Pattern[] = [
  "peony",
  "chrysanthemum",
  "willow",
  "senrin",
  "yashi",
  "yaeshin",
  "kobana",
  "heart",
  "star",
  "smiley",
];

// 7 warimono (割物) + 3 katamono (型物). Real 花火師 distinguish between
// "scatter shells" and "shape shells" — both are in our menu.
const PATTERN_INFO: Record<
  Pattern,
  { jp: string; en: string; desc: string; category: "warimono" | "katamono" }
> = {
  peony: {
    jp: "牡丹",
    en: "Peony",
    desc: "中心から放射状に星が広がる、最も基本の型。",
    category: "warimono",
  },
  chrysanthemum: {
    jp: "菊",
    en: "Chrysanthemum",
    desc: "尾を引きながら大輪に咲く、二重円の構造。",
    category: "warimono",
  },
  willow: {
    jp: "柳",
    en: "Willow",
    desc: "重力に従って垂れ下がる、しだれ柳のような花火。",
    category: "warimono",
  },
  senrin: {
    jp: "千輪",
    en: "Senrin",
    desc: "親玉が咲いた後、無数の小玉が一斉に開花する。",
    category: "warimono",
  },
  yashi: {
    jp: "椰子",
    en: "Yashi (Palm)",
    desc: "南国の椰子の木のように太い幹から長い葉が垂れ下がる。",
    category: "warimono",
  },
  yaeshin: {
    jp: "八重芯",
    en: "Yaeshin",
    desc: "外殻 → 中殻 → 内殻と三段で開く、職人技の極み。",
    category: "warimono",
  },
  kobana: {
    jp: "小花",
    en: "Kobana",
    desc: "メイン開花の中で小さな花が次々ポッポッと咲く。",
    category: "warimono",
  },
  heart: {
    jp: "ハート",
    en: "Heart (katamono)",
    desc: "型物。星(色玉)をハート型に詰めて咲かせる、現代花火師の遊び心。",
    category: "katamono",
  },
  star: {
    jp: "星",
    en: "Star (katamono)",
    desc: "型物。五芒星の形に詰めて開花。祝祭でよく上がる。",
    category: "katamono",
  },
  smiley: {
    jp: "ニコちゃん",
    en: "Smiley (katamono)",
    desc: "型物。目と笑顔で空に浮かぶ、夏祭りの定番アンコール。",
    category: "katamono",
  },
};

// 6 hand-picked hues from the traditional palette + the metal salt that
// produces each colour in real pyrotechnics. Educational subtitle in the
// color picker.
const HUE_PALETTE: {
  hue: number;
  name: string;
  en: string;
  metal: string;
  metalEn: string;
}[] = [
  { hue: 16, name: "朱", en: "shu", metal: "ストロンチウム", metalEn: "Sr" },
  { hue: 48, name: "金", en: "kin", metal: "ナトリウム", metalEn: "Na" },
  { hue: 100, name: "緑", en: "midori", metal: "バリウム", metalEn: "Ba" },
  { hue: 205, name: "藍", en: "ai", metal: "銅", metalEn: "Cu" },
  { hue: 285, name: "紫", en: "murasaki", metal: "Sr+Cu", metalEn: "Sr+Cu" },
  { hue: 340, name: "紅", en: "kurenai", metal: "リチウム", metalEn: "Li" },
];

// ─────────────────────────────────────────────────────────────────────
// Katamono parametric curves — return a unit-vector (-1..1) representing
// the direction each particle flies from the burst center to trace the
// shape.
// ─────────────────────────────────────────────────────────────────────
function heartUnitPos(t: number): [number, number] {
  // Classic mathematical heart. 16 sin³t / 18 keeps |x| ≤ ~1.
  const x = (16 * Math.sin(t) ** 3) / 17;
  const y =
    -(13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)) /
    17;
  return [x, y];
}

function starUnitPos(t: number): [number, number] {
  // 5-pointed star, 10 alternating outer/inner vertices traversed linearly.
  const segments = 10;
  const s = (t / (Math.PI * 2)) * segments;
  const i = Math.floor(s);
  const frac = s - i;
  const a1 = (i / segments) * Math.PI * 2 - Math.PI / 2;
  const a2 = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2;
  const r1 = i % 2 === 0 ? 1.0 : 0.4;
  const r2 = (i + 1) % 2 === 0 ? 1.0 : 0.4;
  const x1 = Math.cos(a1) * r1;
  const y1 = Math.sin(a1) * r1;
  const x2 = Math.cos(a2) * r2;
  const y2 = Math.sin(a2) * r2;
  return [x1 + (x2 - x1) * frac, y1 + (y2 - y1) * frac];
}

// Smiley face composed from 4 regions distributed across [0, 2π):
//   0.00–0.60  face outline   (large circle)
//   0.60–0.72  left eye       (cluster, jitter)
//   0.72–0.84  right eye      (cluster, jitter)
//   0.84–1.00  smile arc      (lower semicircle, narrower span)
// The eye jitter is intentional — it spreads particles into an oval
// dot rather than collapsing onto a single point.
function smileyUnitPos(t: number, jitterSeed: number): [number, number] {
  const u = (t / (Math.PI * 2)) % 1;
  // Cheap deterministic jitter per particle index.
  const j = (n: number) => ((jitterSeed * 9301 + n * 49297) % 233280) / 233280;
  if (u < 0.6) {
    const a = (u / 0.6) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * 0.95, Math.sin(a) * 0.95];
  } else if (u < 0.72) {
    const jx = (j(1) - 0.5) * 0.18;
    const jy = (j(2) - 0.5) * 0.18;
    return [-0.38 + jx, -0.32 + jy];
  } else if (u < 0.84) {
    const jx = (j(3) - 0.5) * 0.18;
    const jy = (j(4) - 0.5) * 0.18;
    return [0.38 + jx, -0.32 + jy];
  } else {
    // Smile: arc from ~165° to ~15° (lower face), span 150°.
    const k = (u - 0.84) / 0.16;
    const a = Math.PI * (0.92 - k * 0.84); // 165° → 15° in radians
    return [Math.cos(a) * 0.55, Math.sin(a) * 0.55 + 0.18];
  }
}

const PATTERN_NAMES: Record<Pattern, string> = {
  peony: "牡丹",
  chrysanthemum: "菊",
  willow: "柳",
  senrin: "千輪",
  yashi: "椰子",
  yaeshin: "八重芯",
  kobana: "小花",
  heart: "ハート",
  star: "星",
  smiley: "ニコちゃん",
};

export function HanabiStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  // ─────────────────────────────────────────────────────────────────
  // 4-step craft flow mirroring the real 花火師 process:
  //   1. design   — pick pattern (絵柄 — what you're making)
  //   2. hoshi    — layer gunpowder colours on the star (星掛け)
  //   3. tamabari — wrap paper layers, choose shell size (玉貼り)
  //   4. launch   — charge & release; bloom uses the shell + star recipe
  // ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("design");
  const [pattern, setPattern] = useState<Pattern | null>(null);
  // Hoshi layers in build order: index 0 = innermost (laid first),
  // last index = outermost (laid last, burns first).
  const [layers, setLayers] = useState<number[]>([]);
  const [shellSize, setShellSize] = useState<ShellSize | null>(null);

  if (step === "design") {
    return (
      <DesignStep
        onPick={(p) => {
          setPattern(p);
          setStep("hoshi");
        }}
      />
    );
  }
  if (step === "hoshi") {
    return (
      <HoshiStep
        pattern={pattern!}
        layers={layers}
        onAddLayer={(h) =>
          setLayers((prev) =>
            prev.length < MAX_HOSHI_LAYERS ? [...prev, h] : prev,
          )
        }
        onUndoLayer={() => setLayers((prev) => prev.slice(0, -1))}
        onClear={() => setLayers([])}
        onConfirm={() => setStep("tamabari")}
        onBack={() => {
          setLayers([]);
          setStep("design");
        }}
      />
    );
  }
  if (step === "tamabari") {
    return (
      <TamabariStep
        pattern={pattern!}
        layers={layers}
        selected={shellSize}
        onSelect={setShellSize}
        onConfirm={() => setStep("launch")}
        onBack={() => {
          setShellSize(null);
          setStep("hoshi");
        }}
      />
    );
  }
  return (
    <LaunchStep
      pattern={pattern!}
      layers={layers}
      shellSize={shellSize!}
      onComplete={onComplete}
      onBack={() => setStep("tamabari")}
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
        <Sparkles size={14} /> Step 1 / 4 · 絵柄を決める
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        どの割物にする？
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        花火師はまず「何を咲かせるか」を決める。星(色玉)もシェルもこの絵柄に合わせて作る。
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
  } else if (pattern === "senrin") {
    // central cluster + small satellite clusters
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
  } else if (pattern === "yashi") {
    // Palm tree — short top dome (the burst) + 5 long drooping leaves
    // arcing down from the centre.
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (Math.PI * i) / 6;
      dots.push({
        x: cx + Math.cos(a) * 14,
        y: cy + Math.sin(a) * 14,
        r: 1.4,
        opacity: 0.7,
      });
    }
    for (let lf = 0; lf < 5; lf++) {
      const baseAngle = -Math.PI / 2 + ((lf - 2) * Math.PI) / 6;
      for (let s = 0; s < 8; s++) {
        const t = s / 7;
        const r = 14 + t * 18;
        const droop = Math.pow(t, 1.6) * 16;
        dots.push({
          x: cx + Math.cos(baseAngle) * r,
          y: cy + Math.sin(baseAngle) * r + droop,
          r: 1.1 - t * 0.4,
          opacity: 0.85 - t * 0.35,
        });
      }
    }
  } else if (pattern === "yaeshin") {
    // Three concentric rings (outer / middle / inner) for the 3-tier
    // expansion. Outer ring is sparser (would be drawn first), inner
    // densest (drawn last on top).
    for (const [radius, count, opacity] of [
      [28, 18, 0.55] as const,
      [18, 14, 0.75] as const,
      [9, 10, 0.95] as const,
    ]) {
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count;
        dots.push({
          x: cx + Math.cos(a) * radius,
          y: cy + Math.sin(a) * radius,
          r: 1.6,
          opacity,
        });
      }
    }
  } else if (pattern === "kobana") {
    // Main central cluster + 5 satellite mini-clusters scattered around.
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10;
      dots.push({
        x: cx + Math.cos(a) * 8,
        y: cy + Math.sin(a) * 8,
        r: 1.4,
        opacity: 0.85,
      });
    }
    const satellites = [
      [-22, -10],
      [22, -8],
      [0, -22],
      [-18, 18],
      [20, 16],
    ] as const;
    for (const [ox, oy] of satellites) {
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5;
        dots.push({
          x: cx + ox + Math.cos(a) * 4,
          y: cy + oy + Math.sin(a) * 4,
          r: 1,
          opacity: 0.7,
        });
      }
    }
  } else if (pattern === "heart") {
    // Sample the heart parametric curve at 28 points.
    for (let i = 0; i < 28; i++) {
      const t = (Math.PI * 2 * i) / 28;
      const [dx, dy] = heartUnitPos(t);
      dots.push({
        x: cx + dx * 26,
        y: cy + dy * 26,
        r: 1.8,
        opacity: 0.85,
      });
    }
  } else if (pattern === "star") {
    // 5-point star at 30 sample points.
    for (let i = 0; i < 30; i++) {
      const t = (Math.PI * 2 * i) / 30;
      const [dx, dy] = starUnitPos(t);
      dots.push({
        x: cx + dx * 26,
        y: cy + dy * 26,
        r: 1.6,
        opacity: 0.85,
      });
    }
  } else {
    // smiley — 32 face outline + 6 each eye + 12 smile arc.
    for (let i = 0; i < 32; i++) {
      const a = (Math.PI * 2 * i) / 32;
      dots.push({
        x: cx + Math.cos(a) * 26,
        y: cy + Math.sin(a) * 26,
        r: 1.4,
        opacity: 0.85,
      });
    }
    for (const ex of [-10, 10]) {
      for (let j = 0; j < 6; j++) {
        const ja = (Math.PI * 2 * j) / 6;
        dots.push({
          x: cx + ex + Math.cos(ja) * 2,
          y: cy - 8 + Math.sin(ja) * 2,
          r: 1.3,
          opacity: 0.95,
        });
      }
    }
    for (let m = 0; m < 12; m++) {
      const k = m / 11;
      const a = Math.PI * (0.92 - k * 0.84); // mirror of smileyUnitPos
      dots.push({
        x: cx + Math.cos(a) * 13,
        y: cy + Math.sin(a) * 13 + 6,
        r: 1.4,
        opacity: 0.9,
      });
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
          cx={r3(d.x)}
          cy={r3(d.y)}
          r={d.r}
          fill="rgba(252, 232, 170, 1)"
          opacity={d.opacity}
        />
      ))}
    </svg>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 2 — Hoshi (星掛け / Hoshigake) — layer gunpowder colours on a
// star pellet. Real stars are made by tumbling pellets in a slurry of
// gunpowder + colorant + binder, then drying, repeated 5+ times. The
// OUTERMOST layer ignites first, so the order users add layers
// determines the time-sequence of colours when the bloom burns through.
// ═════════════════════════════════════════════════════════════════════
function HoshiStep({
  pattern,
  layers,
  onAddLayer,
  onUndoLayer,
  onClear,
  onConfirm,
  onBack,
}: {
  pattern: Pattern;
  layers: number[];
  onAddLayer: (hue: number) => void;
  onUndoLayer: () => void;
  onClear: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const ready = layers.length >= MIN_HOSHI_LAYERS;
  const full = layers.length >= MAX_HOSHI_LAYERS;
  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Layers size={14} /> Step 2 / 4 · 星掛け
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        {PATTERN_INFO[pattern].jp}の星に色を重ねる
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        小さな種に火薬と色素を何層も塗り重ねる。外側から燃えるので、最後に重ねた色が一番先に咲く。同じ色を続けて重ねると、その色がより長く燃える。
      </p>

      {/* Cross-section visualization of the star being built. */}
      <HoshiCrossSection layers={layers} />

      {/* 星の作り方 — real-world process explanation. The interactive
          tap below abstracts a 4-stage artisan workflow: each tap
          stands in for the slow loop of slurry-coat → tumble → dry
          → inspect that real 花火師 repeat dozens of times per star. */}
      <div className="w-[min(92vw,34rem)] rounded-lg border border-amber-200/15 bg-black/30 p-3 backdrop-blur-sm">
        <p className="mb-2 flex items-center gap-2 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/80">
          <Sparkles size={10} /> 星の作り方 · How fireworks stars are made
        </p>
        <ol className="grid grid-cols-2 gap-x-4 gap-y-1 font-jp text-[0.7rem] leading-relaxed text-washi-50/80 sm:grid-cols-4">
          <li>
            <span className="text-amber-200/85">①種 (tane)</span>
            <span className="block text-[0.6rem] text-washi-50/55">
              粟粒大の小核
            </span>
          </li>
          <li>
            <span className="text-amber-200/85">②掛け (kake)</span>
            <span className="block text-[0.6rem] text-washi-50/55">
              火薬と色素を塗布
            </span>
          </li>
          <li>
            <span className="text-amber-200/85">③乾燥 (kansō)</span>
            <span className="block text-[0.6rem] text-washi-50/55">
              一晩乾かす
            </span>
          </li>
          <li>
            <span className="text-amber-200/85">④検品 (kenpin)</span>
            <span className="block text-[0.6rem] text-washi-50/55">
              径と重さを揃える
            </span>
          </li>
        </ol>
        <p className="mt-2 text-[0.6rem] leading-relaxed text-washi-50/55">
          実物は ②③ を 30〜80 回繰り返して 1cm 弱の星に育てる。本体験では各タップが「もう一層掛ける」一回分。
        </p>
      </div>

      <div className="text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/55">
        {layers.length} / {MAX_HOSHI_LAYERS} 層 ·{" "}
        {layers.length === 0
          ? "色を選んで重ねる"
          : full
            ? "これ以上は重ねられない"
            : `${MAX_HOSHI_LAYERS - layers.length} 層追加できる`}
      </div>

      {/* Colour palette — tap to ADD as next outer layer. Re-tapping
          the same colour is allowed (real artisans often double up to
          extend a colour's burn time). The ×N badge shows how many
          times each hue is currently in the stack. */}
      <div className="grid w-[min(92vw,32rem)] grid-cols-3 gap-3 sm:grid-cols-6">
        {HUE_PALETTE.map((h) => {
          const count = layers.filter((l) => l === h.hue).length;
          return (
            <button
              key={h.hue}
              type="button"
              onClick={() => onAddLayer(h.hue)}
              disabled={full}
              className={clsx(
                "relative flex flex-col items-center gap-1.5 rounded-lg border p-3 transition",
                count > 0
                  ? "border-amber-300/60 bg-amber-300/5"
                  : "border-washi-50/15 hover:border-washi-50/40",
                full && "cursor-not-allowed opacity-30",
              )}
            >
              {/* ×N badge — only when this hue has been added at least
                  once. Reassures the user that re-tapping registered. */}
              {count > 0 && (
                <span
                  className="absolute right-1.5 top-1.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-amber-300 px-1 font-mono text-[0.6rem] font-medium text-sumi"
                  aria-label={`${count} 層`}
                >
                  ×{count}
                </span>
              )}
              <span
                className="h-10 w-10 rounded-full"
                style={{
                  background: `radial-gradient(circle at 35% 35%, hsl(${h.hue}, 100%, 78%), hsl(${h.hue}, 90%, 45%) 70%)`,
                  boxShadow:
                    count > 0
                      ? `0 0 16px hsla(${h.hue}, 100%, 70%, 0.5)`
                      : "none",
                }}
              />
              <span className="font-jp text-sm">{h.name}</span>
              <span className="mt-0.5 text-[0.5rem] tracking-[0.15em] text-amber-200/45">
                {h.metalEn}
              </span>
            </button>
          );
        })}
      </div>

      {/* Layer history strip — shows burn order (outermost = burns first) */}
      {layers.length > 0 && (
        <div className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.25em] text-washi-50/55">
          <span className="text-washi-50/40">中心</span>
          <div className="flex items-center gap-1.5">
            {layers.map((h, i) => (
              <span
                key={`${i}-${h}`}
                className="block h-3 w-3 rounded-full ring-1 ring-washi-50/20"
                style={{ background: `hsl(${h}, 90%, 65%)` }}
              />
            ))}
          </div>
          <span className="text-washi-50/40">外側</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 絵柄を選び直す
        </button>
        <button
          type="button"
          onClick={onUndoLayer}
          disabled={layers.length === 0}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Undo2 size={12} /> 1 層戻す
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={layers.length === 0}
          className="text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/45 transition hover:text-washi-50/80 disabled:cursor-not-allowed disabled:opacity-30"
        >
          全部やり直す
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          玉貼りへ
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// Concentric-ring SVG showing the star being built up. The center is
// the "tane" (seed), and each user-added layer paints a ring outward.
// Sized so a fully-loaded 5-layer star comfortably fits inside.
function HoshiCrossSection({ layers }: { layers: number[] }) {
  const cx = 90;
  const cy = 90;
  const seedR = 8;
  const ringStep = 12; // each layer adds this much radius
  return (
    <svg
      width="180"
      height="180"
      viewBox="0 0 180 180"
      className="drop-shadow-[0_0_24px_rgba(255,200,120,0.18)]"
      aria-label="星の断面図"
    >
      {/* Outermost first (drawn behind), inner layers drawn last so
          they appear on top — but since each is a smaller circle, they
          naturally overlap correctly. Use a stronger contrasting stroke
          when the next-inner layer is the SAME hue, so a "double-up"
          (e.g. 朱→朱) still reads as two distinct rings instead of
          merging into one fat band. */}
      {layers
        .map((hue, i) => ({ hue, r: seedR + (i + 1) * ringStep, i }))
        .reverse()
        .map(({ hue, r, i }) => {
          // i is the original index in `layers`. The next-inner ring
          // (i.e. drawn ON TOP of this one) is layers[i-1]. If it's
          // the same hue, we need a darker outline to keep the boundary
          // legible.
          const innerSameHue = i > 0 && layers[i - 1] === hue;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill={`hsl(${hue}, 85%, 55%)`}
              stroke={
                innerSameHue
                  ? "rgba(20,12,5,0.55)"
                  : `hsl(${hue}, 90%, 35%)`
              }
              strokeWidth={innerSameHue ? 1.2 : 0.8}
              opacity={0.92}
            />
          );
        })}
      {/* The tane — small dark seed at center */}
      <circle cx={cx} cy={cy} r={seedR} fill="#2a2218" />
      <circle cx={cx} cy={cy} r={seedR} fill="url(#tane-grad)" />
      <defs>
        <radialGradient id="tane-grad">
          <stop offset="0%" stopColor="rgba(180,150,100,0.6)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      {/* Empty-state hint */}
      {layers.length === 0 && (
        <text
          x={cx}
          y={cy + 38}
          textAnchor="middle"
          fontSize="9"
          fill="rgba(252,232,170,0.5)"
        >
          色をタップして層を重ねる
        </text>
      )}
    </svg>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 3 — Tamabari (玉貼り) — wrap kraft paper around the assembled
// shell. More layers = larger, sturdier shell that flies higher and
// blooms wider. We let the user TAP to add a wrap, and the displayed
// size badge auto-classifies into 3号 / 5号 / 10号 by wrap count.
// Tapping past the 10号 threshold clamps; "やり直す" rewinds.
// ═════════════════════════════════════════════════════════════════════
function TamabariStep({
  pattern,
  layers,
  selected,
  onSelect,
  onConfirm,
  onBack,
}: {
  pattern: Pattern;
  layers: number[];
  selected: ShellSize | null;
  onSelect: (s: ShellSize) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const SIZES = SELECTABLE_SHELL_SIZES;
  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Package size={14} /> Step 3 / 4 · 玉貼り
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        花火玉の大きさを決める
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        作った星をシェルに詰め、クラフト紙を何層も巻き付ける。巻きが厚いほど大きな花火が咲く。
      </p>

      <div className="grid w-[min(92vw,52rem)] grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SIZES.map((sz) => {
          const info = SHELL_SIZE_INFO[sz];
          const active = selected === sz;
          return (
            <button
              key={sz}
              type="button"
              onClick={() => onSelect(sz)}
              className={clsx(
                "group relative flex flex-col items-center gap-3 rounded-lg border p-4 text-center transition",
                active
                  ? "border-amber-300 bg-amber-300/5 shadow-[0_0_24px_rgba(255,200,120,0.18)]"
                  : "border-washi-50/15 bg-white/5 hover:border-amber-300/50",
              )}
            >
              <ShellPreview
                size={sz}
                layers={layers}
                wrapTarget={info.wrapTarget}
              />
              <div>
                <h3 className="font-jp text-xl tracking-wider">{info.jp}</h3>
                <p className="text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/55">
                  {info.cm}
                </p>
              </div>
              <div className="flex flex-col gap-0.5 text-[0.6rem] tracking-[0.15em] text-amber-200/65">
                <span>{info.heightM}</span>
                <span>{info.bloomM}</span>
                <span className="text-washi-50/40">
                  玉貼り {info.wrapTarget} 層
                </span>
              </div>
              <p className="text-[0.65rem] leading-relaxed text-washi-50/65">
                {info.desc}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 星を作り直す
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!selected}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          打ち上げ準備
          <ArrowRight size={12} />
        </button>
      </div>

      {/* Recipe summary */}
      <div className="mt-2 flex items-center gap-3 rounded-full bg-black/30 px-4 py-2 text-[0.65rem] tracking-[0.2em] text-washi-50/70">
        <span className="font-jp">{PATTERN_INFO[pattern].jp}</span>
        <span className="text-washi-50/30">·</span>
        <span>星 {layers.length} 層</span>
        <div className="flex items-center gap-1">
          {layers.map((h, i) => (
            <span
              key={i}
              className="block h-2 w-2 rounded-full ring-1 ring-black/30"
              style={{ background: `hsl(${h}, 90%, 65%)` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// SVG of a half-shell with concentric paper wrap layers. The outline
// scales with wrapTarget so 三号 shows as a small circle and 尺玉 as a
// big one.
function ShellPreview({
  size,
  layers,
  wrapTarget,
}: {
  size: ShellSize;
  layers: number[];
  wrapTarget: number;
}) {
  const cx = 60;
  const cy = 60;
  // Visual radius scales with the actual shell size factor.
  const factor = SHELL_SIZE_INFO[size].radiusFactor;
  const coreR = 12 + factor * 6; // star cluster footprint
  const wrapStep = 1.6;
  const finalR = coreR + wrapTarget * wrapStep;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
      {/* Paper wrap layers (drawn outermost first) */}
      {Array.from({ length: wrapTarget }).map((_, idx) => {
        const r = coreR + (idx + 1) * wrapStep;
        const opacity = 0.18 + (idx / wrapTarget) * 0.18;
        return (
          <circle
            key={idx}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(220,200,160,1)"
            strokeWidth="0.8"
            opacity={opacity}
          />
        );
      })}
      {/* Outer paper boundary */}
      <circle
        cx={cx}
        cy={cy}
        r={finalR}
        fill="none"
        stroke="rgba(252,232,170,0.55)"
        strokeWidth="1"
        strokeDasharray="3 2"
      />
      {/* Star cluster at the center, arranged on a small ring */}
      {(() => {
        const dots = [];
        const ringR = coreR * 0.55;
        const count = Math.max(6, layers.length * 3 + 6);
        for (let i = 0; i < count; i++) {
          const a = (Math.PI * 2 * i) / count;
          const hue = layers[i % Math.max(layers.length, 1)] ?? 48;
          dots.push(
            <circle
              key={i}
              cx={r3(cx + Math.cos(a) * ringR)}
              cy={r3(cy + Math.sin(a) * ringR)}
              r={1.6}
              fill={`hsl(${hue}, 90%, 65%)`}
            />,
          );
        }
        // Center bursting charge (割薬)
        dots.push(
          <circle key="warikusari" cx={cx} cy={cy} r={2.5} fill="#3a2410" />,
        );
        return dots;
      })()}
    </svg>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 4 — Launch (打ち上げ) — charge & release with the locked recipe.
// shellSize scales bloom radius + launch height. Layered hoshi colours
// burn outside-in: the OUTERMOST layer's hue shows immediately after
// burst, then transitions inward to the seed colour.
// ═════════════════════════════════════════════════════════════════════
function LaunchStep({
  pattern,
  layers,
  shellSize,
  onComplete,
  onBack,
}: {
  pattern: Pattern;
  layers: number[];
  shellSize: ShellSize;
  onComplete: (dataUrl: string) => void;
  onBack: () => void;
}) {
  const sizeInfo = SHELL_SIZE_INFO[shellSize];
  const mutedRef = useMutedRef();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const rockets = useRef<Rocket[]>([]);
  const chargeRef = useRef<{ x: number; start: number } | null>(null);
  const rocketCycleRef = useRef(0);

  const [bursts, setBursts] = useState(0);
  const burstsRef = useRef(0);
  const [chargeProgress, setChargeProgress] = useState(0);
  const finalizingRef = useRef(false);
  // Mirrors finalizingRef in React state so we can disable the Finale
  // button after the first click. Without this, a rapid double-click
  // queues two finale chains and onComplete fires twice (router.push
  // gets called against an unmounted tree on the second invocation).
  const [finalizing, setFinalizing] = useState(false);
  const chargeProgressRef = useRef(0);
  const mountedRef = useRef(true);
  // Tracks every setTimeout used by the finale so we can cancel them
  // if the user navigates away mid-bloom — otherwise the deferred
  // `onComplete` callback would fire against an unmounted component
  // and trigger router.push from ExperienceShell against a torn-down
  // tree.
  const finaleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    // Re-arm mountedRef on (re-)mount so React 19 StrictMode's dev
    // double-mount doesn't leave it false. Without this the finale
    // setTimeout chain silent-skips and the Complete button does
    // nothing.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const id of finaleTimersRef.current) clearTimeout(id);
      finaleTimersRef.current = [];
    };
  }, []);

  // Unified firework audio — a single normal launch whistle + burst
  // boom for every pattern. Earlier we layered pattern-specific tails
  // (chrysanthemum crackle, willow whoosh, senrin pops, etc.) but the
  // user asked to keep it consistent. Volume + frequency still scale
  // with sizeFactor so 尺玉 lands deeper / louder than 三号.
  // Patterns whose bursts intentionally play silently. The launch
  // whistle still fires for these (so you hear the rocket go up), but
  // the burst itself is silent — used for the small / decorative
  // patterns (kobana, heart, star, smiley) where a boom would feel
  // out of proportion to the gentle visual.
  const SILENT_BURST_PATTERNS: Pattern[] = ["kobana", "heart", "star", "smiley"];

  function fireworkSound(
    pat: Pattern,
    phase: "launch" | "burst",
    sizeFactor: number,
  ) {
    const m = mutedRef;
    const vol = Math.min(1, 0.55 + sizeFactor * 0.4);

    if (phase === "launch") {
      playWhistle({
        mutedRef: m,
        duration: 0.55 + sizeFactor * 0.18,
        volume: vol,
      });
      return;
    }
    if (SILENT_BURST_PATTERNS.includes(pat)) return;
    playBoom({
      mutedRef: m,
      freq: 80 - sizeFactor * 12,
      duration: 0.85 + sizeFactor * 0.15,
      volume: vol,
    });
  }

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
          spawnBurst(
            r.x,
            ry,
            r.charge,
            r.hueLayers,
            r.pattern,
            r.sizeRadiusFactor,
          );
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
            hueLayers: p.hueLayers,
            hueJitter: p.hueJitter,
            trail: false,
            size: p.size * 0.55,
          });
        }
      }
      particles.current = particles.current.filter((p) => p.life < p.maxLife);

      for (const p of particles.current) {
        const a = 1 - p.life / p.maxLife;
        // Sample the hoshi layer that's currently exposed. Outermost
        // (last index) burns first → at life=0 we want layers[N-1],
        // at life=maxLife we want layers[0]. Snap by segment so the
        // colour change is perceptible (real burns flicker but the
        // dominant tint shifts in clear bands).
        const baseHue = (() => {
          if (!p.hueLayers || p.hueLayers.length === 0) return p.hue;
          const N = p.hueLayers.length;
          const t = Math.min(0.999, p.life / p.maxLife);
          const segIdx = Math.min(N - 1, Math.floor(t * N));
          return p.hueLayers[N - 1 - segIdx]!;
        })();
        const hue = baseHue + (p.hueJitter ?? 0);
        if (p.isFlash) {
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          grd.addColorStop(0, `hsla(${hue}, 100%, 80%, ${a * 0.9})`);
          grd.addColorStop(0.5, `hsla(${hue}, 100%, 65%, ${a * 0.4})`);
          grd.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${a})`;
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
    layersForBurst: number[],
    pat: Pattern,
    sizeFactor: number,
  ) {
    // Initial flash uses the OUTERMOST layer hue — that's what burns
    // first when the bursting charge ignites the stars. Stack two
    // overlapping flashes so the burst centre reads as a hot, dense
    // core instead of a single soft halo: the wide outer flash
    // provides the gradient bloom, the smaller white-hot core makes
    // the very centre look bright + concentrated.
    const flashHue = layersForBurst[layersForBurst.length - 1] ?? 48;
    particles.current.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 22,
      hue: flashHue,
      trail: false,
      size: (95 + charge * 95) * sizeFactor,
      isFlash: true,
    });
    // White-hot core flash — smaller radius, shorter life, brighter.
    particles.current.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 14,
      hue: flashHue,
      trail: false,
      size: (40 + charge * 40) * sizeFactor,
      isFlash: true,
    });
    // Pattern-specific burst audio fires on impact — common boom plus
    // a tail tuned to the visual character (crackle / whoosh / pop /
    // chime depending on pat).
    fireworkSound(pat, "burst", sizeFactor);

    if (pat === "senrin") {
      const cores = 5 + Math.floor(charge * 4);
      for (let m = 0; m < cores; m++) {
        const ox = (Math.random() - 0.5) * 90 * sizeFactor;
        const oy = (Math.random() - 0.5) * 60 * sizeFactor;
        for (let i = 0; i < 14; i++) {
          const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.1;
          const speed = (0.7 + Math.random() * 0.6) * sizeFactor;
          particles.current.push({
            x: x + ox,
            y: y + oy,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            life: 0,
            // Senrin sub-cores: bumped from 38+20 to 60+30 so the
            // many small flowers stay visible long enough to read.
            maxLife: 60 + Math.random() * 30,
            hue: flashHue,
            hueLayers: layersForBurst,
            hueJitter: (Math.random() - 0.5) * 30,
            trail: false,
            size: 1.4,
          });
        }
      }
      return;
    }

    // Bumped from 80 + 140·charge (max 220) to 150 + 250·charge (max
    // 400 at full charge) so the bloom reads as a solid disk rather
    // than a sparse cloud of dots. Trailing patterns
    // (chrysanthemum / willow / yashi) effectively double via their
    // trail children, but the visible per-frame count is what
    // controls perceived density at the burst moment.
    const count = 150 + Math.floor(charge * 250);
    const baseSpeed = (1.6 + charge * 2.6) * sizeFactor;
    const trailing =
      pat === "chrysanthemum" || pat === "willow" || pat === "yashi";

    // Yashi (椰子 / palm tree) — like willow but with a brisk top-burst
    // dome before the long droop. Particles bias upward then fall.
    if (pat === "yashi") {
      const yashiCount = Math.floor(count * 1.2);
      for (let i = 0; i < yashiCount; i++) {
        // Bias direction upward — strong at top, sparser at the sides.
        const theta = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
        const v = baseSpeed * (0.55 + Math.random() * 0.35);
        particles.current.push({
          x,
          y,
          vx: Math.cos(theta) * v,
          vy: Math.sin(theta) * v - 0.5,
          life: 0,
          // Yashi (palm) leaves drop further now — bumped from 70+30
          // to 110+40 so the falling fronds linger at the bottom of
          // the canvas, matching willow's new 2.6× life multiplier.
          maxLife: 110 + Math.random() * 40,
          hue: flashHue,
          hueLayers: layersForBurst,
          hueJitter: (Math.random() - 0.5) * 24,
          trail: true,
          size: 1.8,
        });
      }
      return;
    }

    // Yaeshin (八重芯) — single dense ring burst. Originally fired three
    // staggered rings (220 ms / 440 ms follow-ups) for a layered
    // expansion effect, but the user found the repeated booms
    // distracting. Now fires only the initial ring; the dense
    // count + smaller hueJitter still gives it a more uniform look
    // than peony so the pattern stays distinct visually.
    if (pat === "yaeshin") {
      const c = Math.floor(count * 0.85);
      for (let i = 0; i < c; i++) {
        const theta = (Math.PI * 2 * i) / c + Math.random() * 0.05;
        const v = baseSpeed * (0.92 + Math.random() * 0.16);
        particles.current.push({
          x,
          y,
          vx: Math.cos(theta) * v,
          vy: Math.sin(theta) * v - 0.2,
          life: 0,
          maxLife: (50 + Math.random() * 25) * 1.4,
          hue: flashHue,
          hueLayers: layersForBurst,
          hueJitter: (Math.random() - 0.5) * 18,
          trail: false,
          size: 1.7,
        });
      }
      return;
    }

    // Kobana (小花) — peony-style main bloom, plus 4-6 mini satellite
    // clusters spawning ~100ms later at random offsets so the eye sees
    // little flowers blooming inside the main one.
    if (pat === "kobana") {
      // Main bloom (re-uses the warimono solid-disk recipe inline).
      const mainCount = Math.floor(count * 0.7);
      for (let i = 0; i < mainCount; i++) {
        const u = 2 * Math.random() - 1;
        const theta = Math.PI * 2 * Math.random();
        const r2d = Math.sqrt(1 - u * u);
        const dirX = r2d * Math.cos(theta);
        const dirY = r2d * Math.sin(theta);
        const v = baseSpeed * (0.85 + Math.random() * 0.2);
        const depth = 1 - Math.abs(u) * 0.45;
        particles.current.push({
          x,
          y,
          vx: dirX * v,
          vy: dirY * v - 0.3,
          life: 0,
          // Kobana main bloom — 1.4× life so it lingers for the
          // satellite mini-bursts to land while the main is still
          // visible.
          maxLife: (50 + Math.random() * 25) * 1.4,
          hue: flashHue,
          hueLayers: layersForBurst,
          hueJitter: (Math.random() - 0.5) * 30,
          trail: false,
          size: 1.7 * depth,
        });
      }
      // 4-6 satellite mini bursts — fired ~100ms in so they read as
      // secondary blooms rather than contemporaneous noise.
      const sats = 4 + Math.floor(Math.random() * 3);
      for (let s = 0; s < sats; s++) {
        const ox = (Math.random() - 0.5) * 110 * sizeFactor;
        const oy = (Math.random() - 0.5) * 90 * sizeFactor;
        const delay = 80 + Math.random() * 90;
        finaleTimersRef.current.push(
          setTimeout(() => {
            if (!mountedRef.current) return;
            const miniCount = 14 + Math.floor(Math.random() * 8);
            for (let i = 0; i < miniCount; i++) {
              const a = (Math.PI * 2 * i) / miniCount + Math.random() * 0.1;
              const v = baseSpeed * 0.4 * (0.8 + Math.random() * 0.4);
              particles.current.push({
                x: x + ox,
                y: y + oy,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v,
                life: 0,
                // Kobana satellite mini-flowers — bumped from 30+15
                // to 50+20 so each little bloom stays visible long
                // enough to register before the next pops.
                maxLife: 50 + Math.random() * 20,
                hue: flashHue + (Math.random() - 0.5) * 60,
                hueLayers: layersForBurst,
                hueJitter: (Math.random() - 0.5) * 30,
                trail: false,
                size: 1.3,
              });
            }
          }, delay),
        );
      }
      return;
    }

    // Katamono (pictograph) patterns — particles trace a parametric shape
    // instead of distributing radially. Heart / star / smiley are real
    // pyrotechnic 型物 used by modern 花火師.
    if (pat === "heart" || pat === "star" || pat === "smiley") {
      for (let i = 0; i < count; i++) {
        const t = (Math.PI * 2 * i) / count;
        const [dx, dy] =
          pat === "heart"
            ? heartUnitPos(t)
            : pat === "star"
              ? starUnitPos(t)
              : smileyUnitPos(t, i + 1);
        particles.current.push({
          x,
          y,
          vx: dx * baseSpeed,
          vy: dy * baseSpeed - 0.3,
          life: 0,
          // Katamono shapes (heart / star / smiley) — bumped 1.6× so
          // the parametric shape stays legible long enough to read
          // instead of dissipating before the eye locks onto it.
          maxLife: (55 + Math.random() * 25) * 1.6,
          hue: flashHue,
          hueLayers: layersForBurst,
          hueJitter: (Math.random() - 0.5) * 30,
          trail: false,
          size: 1.6,
        });
      }
      return;
    }

    // 割物 (warimono) patterns — bloom in 3D and project to 2D so the
    // burst reads as a SOLID DISK, not just a ring on the perimeter.
    // Picking a uniform direction on the unit sphere and dropping the z
    // component gives the natural "filled disk with edge falloff" look
    // because particles with high |z| end up moving slowly on the screen
    // (their motion is into / out of the page).
    for (let i = 0; i < count; i++) {
      const u = 2 * Math.random() - 1; // unseen z component, [-1, 1]
      const theta = Math.PI * 2 * Math.random();
      const r2d = Math.sqrt(1 - u * u);
      const dirX = r2d * Math.cos(theta);
      const dirY = r2d * Math.sin(theta);
      const v =
        pat === "willow"
          ? baseSpeed * (0.4 + Math.random() * 0.3)
          : baseSpeed * (0.9 + Math.random() * 0.2);
      // Willow's signature is the long droop — bumped from 1.5× to
      // 2.6× so the leaves visibly fall well after every other
      // pattern has faded. All other warimono patterns get a 1.4×
      // bump so the bloom lingers in the night sky instead of
      // snapping out instantly.
      const lifeFactor = pat === "willow" ? 2.6 : 1.4;
      // Depth cue: particles moving mostly along z appear smaller in 2D.
      const depthAttenuation = 1 - Math.abs(u) * 0.45;
      particles.current.push({
        x,
        y,
        vx: dirX * v,
        vy: dirY * v - (pat === "willow" ? 0 : 0.3),
        life: 0,
        maxLife: (50 + Math.random() * 25) * lifeFactor,
        hue: flashHue,
        hueLayers: layersForBurst,
        hueJitter: (Math.random() - 0.5) * 30,
        trail: trailing,
        size: 1.7 * depthAttenuation,
      });
    }
  }

  function spawnRocket(canvasX: number, charge: number) {
    // Locked recipe: pattern + hoshi layers + shellSize chosen during
    // steps 1-3. The launch trail uses the outermost layer hue (= what
    // ignites first), and the bloom honours all layers.
    spawnRocketWithOverride(canvasX, charge, pattern, shellSize);
  }

  // Variant of spawnRocket that overrides pattern/size — used by the
  // grand finale to fire showcase rockets cycling through every
  // pattern, then a single 二尺玉 climax with the user's pattern.
  function spawnRocketWithOverride(
    canvasX: number,
    charge: number,
    patOverride: Pattern,
    sizeOverride: ShellSize,
  ) {
    const sizeInfoLocal = SHELL_SIZE_INFO[sizeOverride];
    const outerHue = layers[layers.length - 1] ?? 48;
    rocketCycleRef.current++;
    rockets.current.push({
      x: canvasX,
      yNorm: 1,
      vyNorm:
        -(0.011 + charge * 0.006) * (0.85 + sizeInfoLocal.heightFactor * 0.4),
      targetYNorm: sizeInfoLocal.heightFactor - charge * 0.18,
      hue: outerHue,
      pattern: patOverride,
      charge,
      hueLayers: layers,
      sizeRadiusFactor: sizeInfoLocal.radiusFactor,
    });
    // Launch whistle, scaled by the rocket's shell size.
    fireworkSound(patOverride, "launch", sizeInfoLocal.radiusFactor);
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
    // Re-entry guard: a double-click would otherwise queue a second
    // finale chain and call onComplete twice.
    if (finalizingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    finalizingRef.current = true;
    setFinalizing(true);

    // ─── Grand Finale ─────────────────────────────────────────────────
    // Two-phase fireworks-festival-style climax:
    //   Phase 1 — SHOWCASE: 8 rockets cycling through every pattern at
    //             alternating 5号/7号, ~220ms apart. Demonstrates the
    //             full repertoire to the audience.
    //   Phase 2 — pause ~1.2s for the showcase blooms to settle.
    //   Phase 3 — GRAND: a single 二尺玉 with the user's chosen pattern,
    //             dead centre, max charge. Loudest, biggest bloom.
    //   Phase 4 — capture canvas + onComplete after the grand bloom
    //             matures (~2.2s post-launch).
    //
    // All timers go into finaleTimersRef so unmount cleans them up.
    const SHOWCASE_PATTERNS: Pattern[] = [
      "peony",
      "chrysanthemum",
      "willow",
      "yashi",
      "yaeshin",
      "kobana",
      "smiley",
      "senrin",
    ];
    const SHOWCASE_SPACING = 220; // ms between showcase rockets
    const SHOWCASE_COUNT = SHOWCASE_PATTERNS.length;
    const PAUSE_BEFORE_GRAND = 1200;
    const GRAND_TO_CAPTURE = 2200;

    // Phase 1: showcase — fire from i=0 (immediate) through i=7
    for (let i = 0; i < SHOWCASE_COUNT; i++) {
      const pat = SHOWCASE_PATTERNS[i]!;
      const sz: ShellSize = i % 2 === 0 ? "5" : "7";
      const xPos = w * (0.15 + (i / (SHOWCASE_COUNT - 1)) * 0.7);
      const fire = () => {
        if (!mountedRef.current) return;
        spawnRocketWithOverride(xPos, 1, pat, sz);
      };
      if (i === 0) {
        fire();
      } else {
        finaleTimersRef.current.push(
          setTimeout(fire, i * SHOWCASE_SPACING),
        );
      }
    }

    // Phase 3: grand finale — user's pattern at 尺玉 (10号), max
    // charge, dead centre. Originally tried 二尺玉 here but the bloom
    // overflowed the viewport so we settled on 尺玉.
    const grandDelay = SHOWCASE_COUNT * SHOWCASE_SPACING + PAUSE_BEFORE_GRAND;
    finaleTimersRef.current.push(
      setTimeout(() => {
        if (!mountedRef.current) return;
        spawnRocketWithOverride(w * 0.5, 1, pattern, "10");
      }, grandDelay),
    );

    // Phase 4: capture + onComplete after grand bloom matures
    finaleTimersRef.current.push(
      setTimeout(() => {
        if (!mountedRef.current) return;
        const dataUrl = canvas.toDataURL("image/png");
        onComplete(dataUrl);
      }, grandDelay + GRAND_TO_CAPTURE),
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Sparkles size={14} /> Step 4 / 4 · 押して溜める · 離して打ち上げる
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

        {/* Recipe badge — shows the locked pattern + shell size + hoshi
            layers (in burn order: outermost first) */}
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 backdrop-blur">
          <span className="font-jp text-[0.65rem] tracking-wider text-amber-200/85">
            {PATTERN_NAMES[pattern]}
          </span>
          <span className="text-amber-200/30">·</span>
          <span className="text-[0.6rem] tracking-[0.15em] text-amber-200/65">
            {sizeInfo.jp}
          </span>
          <span className="text-amber-200/30">·</span>
          {[...layers].reverse().map((h, i) => (
            <span
              key={i}
              className="block h-2 w-2 rounded-full ring-1 ring-black/30"
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
          <ArrowLeft size={12} /> サイズを選び直す
        </button>
        <button
          type="button"
          onClick={complete}
          disabled={bursts < TARGET_BURSTS || finalizing}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> Finale
        </button>
      </div>
    </div>
  );
}
