"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Droplets,
  Flame,
  Hand,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "@/lib/i18n";

import {
  playChime,
  playFire,
  playPour,
  playThud,
  useMutedRef,
} from "@/lib/craftAudio";

// ─────────────────────────────────────────────────────────────────────
// 4-step craft flow following the Mashiko-yaki (益子焼) production
// sequence. The town of Mashiko in Tochigi has produced rustic pottery
// since the 1850s; Hamada Shōji turned its kilns into the heart of the
// 民芸 (mingei) folk-craft movement in the early 20th century.
//
//   1. 土練り   (Tsuchimomi) — knead clay to even out moisture & expel air
//   2. 轆轤     (Rokuro)     — throw the form on the wheel
//   3. 施釉     (Seyu)       — dip / pour one of the four traditional glazes
//   4. 本焼き   (Honyaki)    — fire in the noborigama (climbing kiln) at 1230℃
// ─────────────────────────────────────────────────────────────────────

type Step = "tsuchi" | "rokuro" | "seyu" | "honyaki";

const SIZE = 560;
const TOTAL_STEPS = 4;
const TSUCHI_TAPS = 7;
const BANDS = 10;
const ROKURO_DRAG_TARGET = 360;

type GlazeId = "kaki" | "koku" | "nuka" | "ame";

interface Glaze {
  id: GlazeId;
  jp: string;
  romaji: string;
  /** raw, un-fired glaze colour — what you see when applying it */
  color: string;
  /** post-firing colour — kiln deepens & vitrifies the surface */
  fired: string;
  /** specular highlight after vitrification */
  highlight: string;
}

const GLAZES: Glaze[] = [
  {
    id: "kaki",
    jp: "柿釉",
    romaji: "Kakiyū",
    color: "#B85F2E",
    fired: "#9C4D22",
    highlight: "#E69767",
  },
  {
    id: "koku",
    jp: "黒釉",
    romaji: "Kokuyū",
    color: "#241a14",
    fired: "#0c0805",
    highlight: "#3a2a1d",
  },
  {
    id: "nuka",
    jp: "糠白釉",
    romaji: "Nukajiroyū",
    color: "#E8DFC7",
    fired: "#D5C7A2",
    highlight: "#FFF6DC",
  },
  {
    id: "ame",
    jp: "飴釉",
    romaji: "Ameyū",
    color: "#7a4220",
    fired: "#5a2e12",
    highlight: "#A8704A",
  },
];

// Stable seeded RNG — same seed produces the same pattern every render,
// so canvas-derived random elements never flicker between frames or
// trigger SSR/CSR mismatches.
function makeRng(seed: number) {
  let s = seed || 1;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ─────────────────────────────────────────────────────────────────────
// Form silhouette helpers — used by Rokuro / Seyu / Honyaki to draw the
// same vessel from the user's wheel-thrown geometry. Top of the form
// has a small rim opening so it reads as a vase, not a solid blob.
// ─────────────────────────────────────────────────────────────────────
function buildFormPath(
  cx: number,
  baseY: number,
  height: number,
  radii: number[],
): Path2D {
  const path = new Path2D();
  const N = radii.length;
  path.moveTo(cx - radii[0]!, baseY);
  for (let i = 0; i < N; i++) {
    const y = baseY - (i / (N - 1)) * height;
    path.lineTo(cx - radii[i]!, y);
  }
  // Rim opening — flat top instead of a closed dome.
  for (let i = N - 1; i >= 0; i--) {
    const y = baseY - (i / (N - 1)) * height;
    path.lineTo(cx + radii[i]!, y);
  }
  path.closePath();
  return path;
}

export function MashikoYakiStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const t = useTranslations();
  const [step, setStep] = useState<Step>("tsuchi");
  // Form silhouette is shared across steps so glaze + firing operate on
  // the actual shape the user threw on the wheel.
  const [formHeight, setFormHeight] = useState(180);
  const [bandRadii, setBandRadii] = useState<number[]>(() =>
    Array.from({ length: BANDS }, () => 78),
  );
  const [glazeId, setGlazeId] = useState<GlazeId>("kaki");
  // Re-randomized when the user enters the kiln so every firing
  // produces a slightly different 「景色」 (kiln scenery).
  const [scenerySeed, setScenerySeed] = useState(() =>
    Math.floor(Math.random() * 1_000_000),
  );

  if (step === "tsuchi") {
    return <TsuchimomiStep onConfirm={() => setStep("rokuro")} />;
  }
  if (step === "rokuro") {
    return (
      <RokuroStep
        initialHeight={formHeight}
        initialRadii={bandRadii}
        onChange={(h, r) => {
          setFormHeight(h);
          setBandRadii(r);
        }}
        onConfirm={() => setStep("seyu")}
        onBack={() => setStep("tsuchi")}
      />
    );
  }
  if (step === "seyu") {
    return (
      <SeyuStep
        formHeight={formHeight}
        bandRadii={bandRadii}
        glazeId={glazeId}
        onGlazeChange={setGlazeId}
        onConfirm={() => {
          setScenerySeed(Math.floor(Math.random() * 1_000_000));
          setStep("honyaki");
        }}
        onBack={() => setStep("rokuro")}
      />
    );
  }
  return (
    <HonyakiStep
      formHeight={formHeight}
      bandRadii={bandRadii}
      glaze={GLAZES.find((g) => g.id === glazeId) ?? GLAZES[0]!}
      scenerySeed={scenerySeed}
      onComplete={onComplete}
      onBack={() => setStep("seyu")}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 1 — Tsuchimomi (土練り) — knead the clay
//
// Top-down view of a clay lump. Each tap squishes the blob in the
// direction of the tap (cosine-falloff compression along that axis,
// orthogonal expansion). After TSUCHI_TAPS taps the colour deepens
// from raw gray to moist rich brown — visual proxy for the cohesion
// (コシ) you build by working the clay.
// ═════════════════════════════════════════════════════════════════════
function TsuchimomiStep({ onConfirm }: { onConfirm: () => void }) {
  const mutedRef = useMutedRef();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [taps, setTaps] = useState(0);
  const tapsRef = useRef(0);
  const squishRef = useRef<{ angle: number; start: number } | null>(null);
  const ready = taps >= TSUCHI_TAPS;

  // Stable irregular outline so the blob never looks like a perfect circle.
  const shape = useMemo(() => {
    const rng = makeRng(42);
    return Array.from({ length: 56 }, () => 0.86 + rng() * 0.18);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createRadialGradient(
      w / 2,
      h / 2,
      40,
      w / 2,
      h / 2,
      w * 0.6,
    );
    bg.addColorStop(0, "#1d130a");
    bg.addColorStop(1, "#070403");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.55;
    const baseR = 130 + tapsRef.current * 3;

    // Squish state — decays in ~280ms after each tap.
    const sq = squishRef.current;
    let sStr = 0;
    let sAng = 0;
    if (sq) {
      const t = (performance.now() - sq.start) / 280;
      if (t < 1) {
        sStr = (1 - t) * 0.22;
        sAng = sq.angle;
      } else {
        squishRef.current = null;
      }
    }

    // Colour deepens with kneading — raw clay gray → moist rich brown.
    const t = tapsRef.current / TSUCHI_TAPS;
    const r = Math.round(lerp(0x7a, 0x4d, t));
    const g = Math.round(lerp(0x6a, 0x36, t));
    const bl = Math.round(lerp(0x55, 0x22, t));
    const fill = `rgb(${r},${g},${bl})`;

    // Cast shadow
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 26, baseR * 0.92, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Compute deformed boundary points once and reuse for fill + highlight.
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < shape.length; i++) {
      const ang = (i / shape.length) * Math.PI * 2;
      const cosD = Math.cos(ang - sAng);
      const sinD = Math.sin(ang - sAng);
      const compress = 1 - sStr * cosD * cosD * 0.7;
      const expand = 1 + sStr * sinD * sinD * 0.5;
      const rPx = baseR * shape[i]! * compress * expand;
      pts.push({
        x: cx + Math.cos(ang) * rPx,
        y: cy + Math.sin(ang) * rPx * 0.78,
      });
    }

    // Body
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // Directional highlight — upper-left light source, hints at 3-D.
    const hi = ctx.createRadialGradient(cx - 60, cy - 50, 8, cx, cy, baseR);
    hi.addColorStop(0, `rgba(255, 220, 180, ${0.18 + t * 0.06})`);
    hi.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = hi;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Knead crease — short arc near the most recent press, fades quickly.
    if (sq && sStr > 0.02) {
      ctx.strokeStyle = `rgba(40, 25, 15, ${clamp(sStr * 5, 0, 0.55)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 0.55, sAng - 0.32, sAng + 0.32);
      ctx.stroke();
    }

    // HUD count
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `${tapsRef.current} / ${TSUCHI_TAPS} 練り`,
      w / 2,
      h * 0.16,
    );
    if (ready) {
      ctx.fillStyle = "rgba(252,232,170,0.45)";
      ctx.font = "11px monospace";
      ctx.fillText("コシが出た", w / 2, h * 0.16 + 18);
    }
  }, [shape, ready]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  function onTap(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tapsRef.current >= TSUCHI_TAPS) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height * 0.55;
    const angle = Math.atan2(dy, dx);
    squishRef.current = { angle, start: performance.now() };
    tapsRef.current += 1;
    setTaps(tapsRef.current);
    // Slightly higher pitch as the clay tightens — gives audible feedback
    // of progress toward "コシ".
    const pitchUp = (tapsRef.current / TSUCHI_TAPS) * 30;
    playThud({
      mutedRef,
      freqStart: 150 + pitchUp,
      freqEnd: 80 + pitchUp,
      duration: 0.2,
    });
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Hand size={14} />
        <span className="font-jp">Step 1 / {TOTAL_STEPS} · 土練り</span>
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        粘土を練り、コシを出す
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        練りで気泡を抜き、粒子を均一にする。土の質が器の質を決める。
      </p>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={onTap}
        className={clsx(
          "aspect-square w-[min(92vw,32rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60",
          ready ? "cursor-default" : "cursor-pointer",
        )}
      />

      <div className="flex items-center gap-2">
        {Array.from({ length: TSUCHI_TAPS }).map((_, i) => (
          <span
            key={i}
            className={clsx(
              "h-1 w-3 rounded-full transition-colors",
              i < taps ? "bg-amber-300" : "bg-washi-50/20",
            )}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={!ready}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        <span className="font-jp">轆轤へ</span>
        <ArrowRight size={12} />
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 2 — Rokuro (轆轤) — throw the form on the wheel
//
// Side view of a rotating potter's wheel with the kneaded lump on top.
// Vertical drag stretches/squashes the form's overall height; horizontal
// drag pushes/pulls the radius at the band the cursor is hovering over,
// with Gaussian falloff into neighbours so the silhouette stays smooth.
// ═════════════════════════════════════════════════════════════════════
function RokuroStep({
  initialHeight,
  initialRadii,
  onChange,
  onConfirm,
  onBack,
}: {
  initialHeight: number;
  initialRadii: number[];
  onChange: (h: number, r: number[]) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const mutedRef = useMutedRef();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heightRef = useRef(initialHeight);
  const radiiRef = useRef<number[]>([...initialRadii]);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const totalDragRef = useRef(0);
  // If the user already shaped the form on a previous visit (came back
  // from glazing), pre-arm dragProgress so the Continue button isn't
  // disabled until they drag again. Codex P2: returning from Seyu
  // otherwise made it look like the wheel had been reset.
  const hasShapedBefore =
    initialHeight !== 180 ||
    initialRadii.some((r) => r !== 78);
  const [dragProgress, setDragProgress] = useState(
    hasShapedBefore ? 1 : 0,
  );
  const ready = dragProgress >= 1;

  // Ambient wheel hum — one play on entry. Restart on each pointer-down
  // so the hum is tied to interaction rather than looping forever.
  useEffect(() => {
    playFire({ mutedRef, duration: 4.0, volume: 0.3 });
  }, [mutedRef]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1d130a");
    bg.addColorStop(1, "#070403");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const baseY = h * 0.78;

    // Wheel base — perspective ellipse with rotating spokes.
    const wheelW = 240;
    const wheelH = 26;
    const wheelY = baseY + 6;
    ctx.fillStyle = "#3a2614";
    ctx.beginPath();
    ctx.ellipse(cx, wheelY, wheelW / 2, wheelH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,12,5,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Rim shine
    ctx.strokeStyle = "rgba(255,200,140,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, wheelY - 1, wheelW / 2 - 2, wheelH / 2 - 2, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    // Animated spokes — fakes rotation at ~1 rev/sec.
    const phase = (performance.now() / 700) % (Math.PI * 2);
    ctx.strokeStyle = "rgba(255,200,140,0.14)";
    for (let i = 0; i < 8; i++) {
      const a = phase + (Math.PI * 2 * i) / 8;
      ctx.beginPath();
      ctx.moveTo(cx, wheelY);
      ctx.lineTo(
        cx + Math.cos(a) * (wheelW / 2 - 4),
        wheelY + Math.sin(a) * (wheelH / 2 - 1),
      );
      ctx.stroke();
    }

    // Form
    const formPath = buildFormPath(cx, baseY, heightRef.current, radiiRef.current);
    // Fill — wet clay
    const fill = ctx.createLinearGradient(cx - 100, 0, cx + 100, 0);
    fill.addColorStop(0, "#3b2818");
    fill.addColorStop(0.5, "#5b3a20");
    fill.addColorStop(1, "#2c1d10");
    ctx.fillStyle = fill;
    ctx.fill(formPath);

    // Throw lines — horizontal striations that read as wheel rotation.
    ctx.save();
    ctx.clip(formPath);
    ctx.strokeStyle = "rgba(20,12,5,0.32)";
    ctx.lineWidth = 0.6;
    const N = radiiRef.current.length;
    for (let i = 1; i < N - 1; i++) {
      const y = baseY - (i / (N - 1)) * heightRef.current;
      ctx.beginPath();
      ctx.moveTo(cx - radiiRef.current[i]!, y);
      ctx.lineTo(cx + radiiRef.current[i]!, y);
      ctx.stroke();
    }
    // Subtle highlight strip (left-of-center light source)
    const sheen = ctx.createLinearGradient(cx - 80, 0, cx + 30, 0);
    sheen.addColorStop(0, "rgba(255,200,140,0.05)");
    sheen.addColorStop(0.5, "rgba(255,200,140,0.18)");
    sheen.addColorStop(1, "rgba(255,200,140,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Outline
    ctx.strokeStyle = "rgba(20,12,5,0.8)";
    ctx.lineWidth = 1.2;
    ctx.stroke(formPath);

    // Rim opening — dark ellipse on top of the form to read as a vase mouth.
    const topY = baseY - heightRef.current;
    const rimR = radiiRef.current[N - 1]!;
    ctx.fillStyle = "#150d05";
    ctx.beginPath();
    ctx.ellipse(cx, topY, rimR, rimR * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,200,140,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, topY, rimR, rimR * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();

    // HUD
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    const cm = Math.round(heightRef.current / 10);
    ctx.fillText(`高さ ${cm}cm`, w / 2, h * 0.14);
    ctx.fillStyle = "rgba(252,232,170,0.45)";
    ctx.font = "11px monospace";
    ctx.fillText(
      ready ? "形が決まった" : "縦ドラッグで高さ・横ドラッグで膨らみ",
      w / 2,
      h * 0.14 + 18,
    );
  }, [ready]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPt.current = canvasPoint(e);
    // Re-fire ambient hum on each grab so it tracks active sculpting.
    playFire({ mutedRef, duration: 1.4, volume: 0.25 });
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!lastPt.current) return;
    const p = canvasPoint(e);
    const dx = p.x - lastPt.current.x;
    const dy = p.y - lastPt.current.y;
    lastPt.current = p;

    // Determine which band the cursor is hovering — continuous index.
    const baseY = SIZE * 0.78;
    const yFromBase = baseY - p.y;
    const tBand = clamp((yFromBase / heightRef.current) * (BANDS - 1), 0, BANDS - 1);

    // Apply horizontal drag → radius change with Gaussian falloff.
    const next = [...radiiRef.current];
    const sigma2 = 2.2;
    for (let i = 0; i < BANDS; i++) {
      const w = Math.exp(-((i - tBand) ** 2) / sigma2);
      next[i] = clamp(next[i]! + dx * 0.55 * w, 30, 130);
    }
    radiiRef.current = next;

    // Vertical drag (up = positive) → grow form height, with limits.
    heightRef.current = clamp(heightRef.current - dy * 0.7, 130, 250);

    totalDragRef.current += Math.abs(dx) + Math.abs(dy);
    const progress = clamp(totalDragRef.current / ROKURO_DRAG_TARGET, 0, 1);
    if (Math.abs(progress - dragProgress) > 0.01) {
      setDragProgress(progress);
    }
  }

  function endPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    lastPt.current = null;
  }

  function confirm() {
    onChange(heightRef.current, [...radiiRef.current]);
    onConfirm();
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Circle size={14} />
        <span className="font-jp">Step 2 / {TOTAL_STEPS} · 轆轤</span>
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        轆轤を回し、形を引き上げる
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        轆轤を回しながら指で形を引き上げる。中心が決まれば後は対話。
      </p>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
        className="aspect-square w-[min(92vw,32rem)] touch-none cursor-grab rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60 active:cursor-grabbing"
      />

      <div className="h-[2px] w-56 overflow-hidden rounded-full bg-washi-50/20">
        <div
          className="h-full bg-amber-300 transition-[width] duration-100"
          style={{ width: `${dragProgress * 100}%` }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} />
          <span className="font-jp">前へ戻る</span>
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <span className="font-jp">施釉へ</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 3 — Seyu (施釉) — apply one of four traditional Mashiko glazes
//
// User picks a glaze card; the chosen glaze pours from the rim and
// flows down over the form (gravity-driven drip animation). They can
// re-pick to try a different glaze before committing.
// ═════════════════════════════════════════════════════════════════════
function SeyuStep({
  formHeight,
  bandRadii,
  glazeId,
  onGlazeChange,
  onConfirm,
  onBack,
}: {
  formHeight: number;
  bandRadii: number[];
  glazeId: GlazeId;
  onGlazeChange: (id: GlazeId) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const mutedRef = useMutedRef();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pourStartRef = useRef<number | null>(null);
  const pourProgressRef = useRef(0);
  const [poured, setPoured] = useState(false);

  const glaze = GLAZES.find((g) => g.id === glazeId) ?? GLAZES[0]!;

  // Per-band drip variability — stable per render, gives the pour an
  // organic feel rather than a flat sweeping line.
  const dripOffsets = useMemo(() => {
    const rng = makeRng(91);
    return Array.from({ length: BANDS }, () => 0.7 + rng() * 0.6);
  }, []);

  function startPour() {
    pourStartRef.current = performance.now();
    pourProgressRef.current = 0;
    setPoured(false);
    playPour({ mutedRef, duration: 1.0 });
  }

  // Auto-start a pour whenever the glaze choice changes, including the
  // initial mount (default 柿釉).
  useEffect(() => {
    startPour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glazeId]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1d130a");
    bg.addColorStop(1, "#070403");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const baseY = h * 0.78;
    const formPath = buildFormPath(cx, baseY, formHeight, bandRadii);

    // Bare clay base — this is what the glaze pours over.
    ctx.fillStyle = "#5b3a20";
    ctx.fill(formPath);
    ctx.save();
    ctx.clip(formPath);
    const sheen = ctx.createLinearGradient(cx - 80, 0, cx + 30, 0);
    sheen.addColorStop(0, "rgba(255,200,140,0.04)");
    sheen.addColorStop(0.5, "rgba(255,200,140,0.16)");
    sheen.addColorStop(1, "rgba(255,200,140,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Pour progress — 0..1 over ~1.1s, then settles.
    if (pourStartRef.current !== null) {
      const t = (performance.now() - pourStartRef.current) / 1100;
      pourProgressRef.current = clamp(t, 0, 1);
      if (t >= 1.05 && !poured) {
        setPoured(true);
      }
    }
    const p = pourProgressRef.current;

    // Glaze layer — drips down clipped to form path.
    if (p > 0) {
      ctx.save();
      ctx.clip(formPath);
      const topY = baseY - formHeight;
      const N = bandRadii.length;
      // For each horizontal band, pour reaches it when p >= bandThreshold.
      for (let i = N - 1; i >= 0; i--) {
        const tBand = (N - 1 - i) / (N - 1);
        const arrival = tBand * 0.85;
        if (p < arrival) continue;
        const local = clamp((p - arrival) / 0.18, 0, 1);
        const yTop = baseY - (i / (N - 1)) * formHeight;
        const yPrev = i < N - 1 ? baseY - ((i + 1) / (N - 1)) * formHeight : topY - 4;
        const drip = local * (yTop - yPrev) * dripOffsets[i]!;
        const yBottom = yPrev + drip;
        const r0 = bandRadii[i]!;
        const r1 = i < N - 1 ? bandRadii[i + 1]! : r0;
        ctx.fillStyle = glaze.color;
        ctx.beginPath();
        ctx.moveTo(cx - r0, yTop);
        ctx.lineTo(cx + r0, yTop);
        ctx.lineTo(cx + r1, yBottom);
        ctx.lineTo(cx - r1, yBottom);
        ctx.closePath();
        ctx.fill();
      }
      // Drip beads at the bottom rim once the pour has finished its descent.
      if (p > 0.85) {
        const beadAlpha = clamp((p - 0.85) / 0.15, 0, 1);
        ctx.fillStyle = `${glaze.color}${Math.round(220 * beadAlpha).toString(16).padStart(2, "0")}`;
        const rng = makeRng(31);
        for (let i = 0; i < 5; i++) {
          const off = (rng() - 0.5) * bandRadii[0]! * 1.5;
          const drop = 4 + rng() * 8;
          ctx.beginPath();
          ctx.arc(cx + off, baseY + drop * beadAlpha, 2 + rng() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Overlay rim gloss
    if (p > 0.05) {
      ctx.save();
      ctx.clip(formPath);
      const gloss = ctx.createLinearGradient(cx - 70, 0, cx + 20, 0);
      gloss.addColorStop(0, "rgba(255,255,255,0)");
      gloss.addColorStop(0.5, `${glaze.highlight}55`);
      gloss.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gloss;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Outline
    ctx.strokeStyle = "rgba(20,12,5,0.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke(formPath);

    // Pouring stream — thin liquid line above the rim during pour.
    if (p < 0.9) {
      const streamX = cx;
      const top = baseY - formHeight - 90;
      const reach = baseY - formHeight + (p * 30);
      ctx.strokeStyle = glaze.color;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(streamX - 1, top);
      ctx.lineTo(streamX + 1, reach);
      ctx.stroke();
      ctx.fillStyle = `${glaze.color}aa`;
      ctx.beginPath();
      ctx.arc(streamX, reach + 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // HUD
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${glaze.romaji}`, w / 2, h * 0.14);
  }, [bandRadii, formHeight, glaze, poured, dripOffsets]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Droplets size={14} />
        <span className="font-jp">Step 3 / {TOTAL_STEPS} · 施釉</span>
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        伝統四釉から選ぶ
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        釉薬を浸けがけ。焼くと化学変化で発色する。
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {GLAZES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onGlazeChange(g.id)}
            className={clsx(
              "flex flex-col items-center gap-1 rounded-md border px-3 py-2 transition",
              glazeId === g.id
                ? "scale-105 border-washi-50 text-washi-50"
                : "border-washi-50/25 text-washi-50/70 hover:border-washi-50/50",
            )}
          >
            <span
              className="block h-7 w-7 rounded-full border border-black/30 shadow-inner"
              style={{ backgroundColor: g.color }}
              aria-hidden
            />
            <span className="font-jp text-xs">{g.jp}</span>
            <span className="text-[0.55rem] uppercase tracking-[0.2em] text-washi-50/60">
              {g.romaji}
            </span>
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="aspect-square w-[min(92vw,32rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} />
          <span className="font-jp">前へ戻る</span>
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!poured}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <span className="font-jp">本焼きへ</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Step 4 — Honyaki (本焼き) — fire in the noborigama
//
// Animated noborigama (climbing kiln) firing sequence: orange → red →
// white-hot → cool. Glaze deepens to its post-firing colour. Random
// 「景色」 (kiln scenery) — drips, ash flecks, pinholes — varies per
// scenerySeed so each firing produces a unique vessel.
// ═════════════════════════════════════════════════════════════════════
type FirePhase = "ready" | "firing" | "done";

function HonyakiStep({
  formHeight,
  bandRadii,
  glaze,
  scenerySeed,
  onComplete,
  onBack,
}: {
  formHeight: number;
  bandRadii: number[];
  glaze: Glaze;
  scenerySeed: number;
  onComplete: (dataUrl: string) => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const mutedRef = useMutedRef();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<FirePhase>("ready");
  const fireStartRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<FirePhase>("ready");
  const finalizingRef = useRef(false);
  const [finalizing, setFinalizing] = useState(false);
  const mountedRef = useRef(true);

  // Per-firing scenery — drips, ash flecks. Deterministic for a given
  // seed so the canvas doesn't re-shuffle between frames.
  const scenery = useMemo(() => {
    const rng = makeRng(scenerySeed);
    const drips = Array.from({ length: 6 }, () => ({
      x: rng() * 0.9 + 0.05,
      y: rng() * 0.55 + 0.15,
      len: 12 + rng() * 36,
      width: 1.5 + rng() * 2.2,
      hueShift: (rng() - 0.5) * 0.4,
    }));
    const ash = Array.from({ length: 24 }, () => ({
      x: rng(),
      y: rng() * 0.7 + 0.1,
      r: 0.8 + rng() * 1.6,
      a: 0.1 + rng() * 0.25,
    }));
    const pinholes = Array.from({ length: 8 }, () => ({
      x: rng(),
      y: rng() * 0.7 + 0.15,
      r: 0.4 + rng() * 0.8,
    }));
    return { drips, ash, pinholes };
  }, [scenerySeed]);

  // Firing timer — drives phase transitions. Cleaned up on unmount so a
  // stale rAF can't update state after teardown.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Workshop ambient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#0d0805");
    bg.addColorStop(1, "#050200");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const baseY = h * 0.82;
    const topY = baseY - formHeight;

    // Compute firing intensity (0 ready → peaks mid-firing → 0 done).
    let intensity = 0;
    if (phaseRef.current === "firing" && fireStartRef.current !== null) {
      const t = (performance.now() - fireStartRef.current) / 3000;
      if (t >= 1) {
        intensity = 0;
        phaseRef.current = "done";
        if (mountedRef.current) setPhase("done");
      } else {
        // Bell curve — peaks at 0.5, smooth at edges.
        intensity = Math.sin(Math.PI * t);
      }
    }

    // Kiln chamber — brick arch behind & enveloping the form.
    drawKiln(ctx, cx, baseY, formHeight, intensity);

    // The form itself
    const formPath = buildFormPath(cx, baseY, formHeight, bandRadii);

    // Base glaze colour: raw before firing; deepened to fired after.
    const baseColor = phaseRef.current === "done" ? glaze.fired : glaze.color;
    ctx.fillStyle = baseColor;
    ctx.fill(formPath);

    // Firing glow — additive heat layer on the form.
    if (intensity > 0) {
      ctx.save();
      ctx.clip(formPath);
      // Heat colour: orange (low) → red (mid) → white-hot (peak)
      const heat =
        intensity < 0.5
          ? blendHex("#FF7A22", "#FFD37A", intensity * 2)
          : blendHex("#FFD37A", "#FFFFFF", (intensity - 0.5) * 2);
      const heatGrad = ctx.createRadialGradient(
        cx,
        baseY - formHeight * 0.4,
        10,
        cx,
        baseY - formHeight * 0.4,
        formHeight * 0.95,
      );
      heatGrad.addColorStop(0, hexAlpha(heat, 0.85 * intensity));
      heatGrad.addColorStop(0.5, hexAlpha(heat, 0.4 * intensity));
      heatGrad.addColorStop(1, hexAlpha(heat, 0));
      ctx.fillStyle = heatGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Post-fire scenery & gloss
    if (phaseRef.current === "done") {
      ctx.save();
      ctx.clip(formPath);

      // Vertical drips of pooled glaze — kiln gravity made these.
      for (const d of scenery.drips) {
        const dx = cx - bandRadii[0]! + d.x * (bandRadii[0]! * 2);
        const dy = baseY - d.y * formHeight;
        ctx.fillStyle = blendHex(glaze.fired, "#000000", 0.25 + d.hueShift);
        ctx.beginPath();
        ctx.moveTo(dx - d.width, dy);
        ctx.lineTo(dx + d.width, dy);
        ctx.lineTo(dx + d.width * 0.4, dy + d.len);
        ctx.lineTo(dx - d.width * 0.4, dy + d.len);
        ctx.closePath();
        ctx.fill();
      }
      // Ash flecks — small pale dots scattered across the surface.
      for (const a of scenery.ash) {
        const dx = cx - bandRadii[0]! + a.x * (bandRadii[0]! * 2);
        const dy = baseY - a.y * formHeight;
        ctx.fillStyle = `rgba(245, 230, 200, ${a.a})`;
        ctx.beginPath();
        ctx.arc(dx, dy, a.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Pinholes — tiny darker specks.
      for (const ph of scenery.pinholes) {
        const dx = cx - bandRadii[0]! + ph.x * (bandRadii[0]! * 2);
        const dy = baseY - ph.y * formHeight;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.arc(dx, dy, ph.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Vitrified gloss — diagonal sheen on the upper-left.
      const gloss = ctx.createLinearGradient(cx - 80, 0, cx + 30, 0);
      gloss.addColorStop(0, "rgba(255,255,255,0)");
      gloss.addColorStop(0.5, `${glaze.highlight}66`);
      gloss.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gloss;
      ctx.fillRect(0, 0, w, h);

      ctx.restore();
    }

    // Form outline
    ctx.strokeStyle = "rgba(20,12,5,0.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke(formPath);

    // Rim opening — dark mouth.
    const N = bandRadii.length;
    const rimR = bandRadii[N - 1]!;
    ctx.fillStyle = "#0a0604";
    ctx.beginPath();
    ctx.ellipse(cx, topY, rimR, rimR * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Floating heat shimmer particles during firing.
    if (intensity > 0) {
      const tNow = performance.now();
      for (let i = 0; i < 14; i++) {
        const phase = (tNow / 800 + i * 0.7) % 1;
        const ax = cx + Math.sin(i * 1.7) * 90;
        const ay = baseY - phase * (formHeight + 60);
        const a = (1 - phase) * intensity * 0.7;
        ctx.fillStyle = `rgba(255, 200, 130, ${a})`;
        ctx.beginPath();
        ctx.arc(ax, ay, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // HUD
    ctx.fillStyle = "rgba(252,232,170,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    if (phaseRef.current === "ready") {
      ctx.fillText("登り窯に器を据える", w / 2, h * 0.12);
    } else if (phaseRef.current === "firing") {
      ctx.fillText("焼成中... 1230℃", w / 2, h * 0.12);
    } else {
      ctx.fillText("焼き上がり", w / 2, h * 0.12);
    }
  }, [bandRadii, formHeight, glaze, scenery]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  function startFiring() {
    if (phaseRef.current !== "ready") return;
    phaseRef.current = "firing";
    fireStartRef.current = performance.now();
    setPhase("firing");
    playFire({ mutedRef, duration: 3.0 });
  }

  function complete() {
    if (finalizingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    finalizingRef.current = true;
    setFinalizing(true);
    playChime({ mutedRef });
    onComplete(canvas.toDataURL("image/png"));
  }

  const heightCm = Math.round(formHeight / 10);

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
        <Flame size={14} />
        <span className="font-jp">Step 4 / {TOTAL_STEPS} · 本焼き</span>
      </p>
      <h2 className="text-center font-serif text-3xl font-light leading-tight">
        登り窯で焼き上げる
      </h2>
      <p className="max-w-md text-center text-sm italic text-washi-50/70">
        登り窯で 24 時間焼成。火と灰の偶然が景色を作る。
      </p>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="aspect-square w-[min(92vw,32rem)] touch-none rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60"
      />

      {phase === "done" && (
        <div className="rounded-full border border-washi-50/30 bg-washi-50/5 px-4 py-1.5 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/90 backdrop-blur">
          <span className="font-jp">益子焼</span> · 高さ {heightCm}cm ·{" "}
          <span className="font-jp">{glaze.jp}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={phase === "firing" || finalizing}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10 disabled:opacity-40"
        >
          <ArrowLeft size={12} />
          <span className="font-jp">前へ戻る</span>
        </button>
        {phase === "ready" && (
          <button
            type="button"
            onClick={startFiring}
            className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-amber-200"
          >
            <Flame size={12} />
            <span className="font-jp">焼成を始める</span>
          </button>
        )}
        {phase === "firing" && (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-full bg-washi-50/30 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi"
          >
            <Sparkles size={12} />
            <span className="font-jp">焼成中…</span>
          </button>
        )}
        {phase === "done" && (
          <button
            type="button"
            onClick={complete}
            disabled={finalizing}
            className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
          >
            <Check size={12} /> {t("common.complete")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Drawing helpers
// ─────────────────────────────────────────────────────────────────────
function drawKiln(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  formHeight: number,
  intensity: number,
) {
  // Kiln chamber arches up around the form. Brick courses are lit from
  // within during firing — a simulated chamber glow.
  const archW = 380;
  const archH = formHeight + 120;
  const archX = cx - archW / 2;
  const archY = baseY - archH;

  ctx.save();

  // Outer chamber silhouette
  ctx.fillStyle = "#1a1108";
  ctx.beginPath();
  ctx.moveTo(archX - 18, baseY + 20);
  ctx.lineTo(archX - 18, archY + archW * 0.5);
  ctx.quadraticCurveTo(archX - 18, archY, archX + archW / 2, archY);
  ctx.quadraticCurveTo(archX + archW + 18, archY, archX + archW + 18, archY + archW * 0.5);
  ctx.lineTo(archX + archW + 18, baseY + 20);
  ctx.closePath();
  ctx.fill();

  // Chamber interior — lit / dark.
  const innerY = archY + 12;
  const innerW = archW - 30;
  const innerH = archH - 18;
  const interiorPath = new Path2D();
  interiorPath.moveTo(archX + 15, baseY);
  interiorPath.lineTo(archX + 15, innerY + innerW * 0.45);
  interiorPath.quadraticCurveTo(archX + 15, innerY, archX + archW / 2, innerY);
  interiorPath.quadraticCurveTo(archX + archW - 15, innerY, archX + archW - 15, innerY + innerW * 0.45);
  interiorPath.lineTo(archX + archW - 15, baseY);
  interiorPath.closePath();

  if (intensity > 0) {
    const glow = ctx.createRadialGradient(
      cx,
      baseY - innerH * 0.55,
      20,
      cx,
      baseY - innerH * 0.55,
      innerW * 0.7,
    );
    const heat =
      intensity < 0.5
        ? blendHex("#FF6A18", "#FFC36A", intensity * 2)
        : blendHex("#FFC36A", "#FFEFCA", (intensity - 0.5) * 2);
    glow.addColorStop(0, hexAlpha(heat, 0.95));
    glow.addColorStop(0.6, hexAlpha(heat, 0.55));
    glow.addColorStop(1, hexAlpha(heat, 0.05));
    ctx.fillStyle = glow;
    ctx.fill(interiorPath);
  } else {
    ctx.fillStyle = "#0c0703";
    ctx.fill(interiorPath);
  }

  // Brick courses — horizontal lines on the chamber outer face.
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1;
  for (let y = innerY + innerW * 0.5; y < baseY; y += 12) {
    ctx.beginPath();
    ctx.moveTo(archX - 14, y);
    ctx.lineTo(archX + 12, y);
    ctx.moveTo(archX + archW - 12, y);
    ctx.lineTo(archX + archW + 14, y);
    ctx.stroke();
  }

  // Hearth floor under the form.
  ctx.fillStyle = "#22150a";
  ctx.fillRect(archX + 10, baseY, archW - 20, 18);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.moveTo(archX + 10, baseY);
  ctx.lineTo(archX + archW - 10, baseY);
  ctx.stroke();

  // Flame licks during firing.
  if (intensity > 0) {
    const tNow = performance.now();
    ctx.save();
    ctx.clip(interiorPath);
    for (let i = 0; i < 8; i++) {
      const phase = (tNow / 320 + i * 0.81) % 1;
      const flameX = cx + Math.sin(i * 2.3 + tNow / 400) * (innerW * 0.35);
      const flameH = 40 + intensity * 60 + Math.sin(tNow / 200 + i) * 10;
      const flameY = baseY - phase * flameH;
      const a = (1 - phase) * intensity * 0.7;
      const grad = ctx.createRadialGradient(flameX, flameY, 0, flameX, flameY, 22);
      grad.addColorStop(0, `rgba(255, 230, 160, ${a})`);
      grad.addColorStop(1, "rgba(255, 90, 30, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(flameX, flameY, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}

// Linearly blend two hex colours (#RRGGBB) by t in [0,1].
function blendHex(a: string, b: string, t: number): string {
  const ai = parseInt(a.slice(1), 16);
  const bi = parseInt(b.slice(1), 16);
  const ar = (ai >> 16) & 0xff;
  const ag = (ai >> 8) & 0xff;
  const ab = ai & 0xff;
  const br = (bi >> 16) & 0xff;
  const bg = (bi >> 8) & 0xff;
  const bb = bi & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return `rgb(${r},${g},${bl})`;
}

// Hex (#RRGGBB) → rgba string with given alpha.
function hexAlpha(hex: string, a: number): string {
  if (hex.startsWith("rgb(")) {
    return hex.replace("rgb(", "rgba(").replace(")", `,${a})`);
  }
  const i = parseInt(hex.slice(1), 16);
  const r = (i >> 16) & 0xff;
  const g = (i >> 8) & 0xff;
  const b = i & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}
