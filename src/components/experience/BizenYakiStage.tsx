"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import {
  Check,
  ChevronLeft,
  FastForward,
  Flame,
  Hand,
  MapPin,
  Sparkles,
} from "lucide-react";
import {
  playChime,
  playClick,
  playCrackle,
  playFire,
  playThud,
  useMutedRef,
} from "@/lib/craftAudio";
import { useTranslations } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

type StepId = "rokuro" | "kamaire" | "shosei" | "kashoku";
type KamairePos = "floor" | "top" | "corner" | "center" | "side";
type Keshiki = "goma" | "sangiri" | "hidasuki" | "botamochi" | "yohen";

interface Shape {
  segs: [number, number, number, number]; // 0..1 width per band, bottom→top
}

interface KeshikiSpot {
  type: Keshiki;
  // Coordinates are inside vase bbox: x relative to centerline (-1..1),
  // y top→bottom (0..1). The renderer maps these into the vase profile
  // and clips with the path so spots can never spill outside.
  x: number;
  y: number;
  size: number;
  drift: number; // small random rotation/jitter for variety
}

// ─────────────────────────────────────────────────────────────────────
// Static metadata
// ─────────────────────────────────────────────────────────────────────

const STEPS: { id: StepId; jp: string; en: string; hint: string }[] = [
  {
    id: "rokuro",
    jp: "轆轤",
    en: "Rokuro",
    hint: "ひよせ土を轆轤で挽く. 鉄分が焼成で独特な色を出す",
  },
  {
    id: "kamaire",
    jp: "窯入れ位置",
    en: "Kama-ire",
    hint: "窯のどこに置くかで「景色」が変わる. 場所も作品の一部",
  },
  {
    id: "shosei",
    jp: "焼成",
    en: "Shōsei",
    hint: "窯焚き 10〜14 日. 灰・炎・温度の偶然が「景色」を作る",
  },
  {
    id: "kashoku",
    jp: "景色確認",
    en: "Keshiki",
    hint: "完成体の景色を眺める. 同じ作品は二度と作れない",
  },
];

const KAMAIRE_INFO: Record<
  KamairePos,
  {
    jp: string;
    en: string;
    desc: string;
    primary: Keshiki;
    cx: number; // 0..1 in kiln SVG
    cy: number;
  }
> = {
  floor: {
    jp: "床",
    en: "Floor",
    desc: "灰被り強い → 胡麻が深く乗る",
    primary: "goma",
    cx: 0.5,
    cy: 0.78,
  },
  top: {
    jp: "上部",
    en: "Top",
    desc: "火焔の通り道 → 桟切が走る",
    primary: "sangiri",
    cx: 0.55,
    cy: 0.34,
  },
  corner: {
    jp: "隅",
    en: "Corner",
    desc: "炎弱く → 緋襷が淡く現れる",
    primary: "hidasuki",
    cx: 0.18,
    cy: 0.66,
  },
  center: {
    jp: "中央",
    en: "Center",
    desc: "炎と灰のバランス → 牡丹餅",
    primary: "botamochi",
    cx: 0.5,
    cy: 0.56,
  },
  side: {
    jp: "横",
    en: "Side",
    desc: "気まぐれな炎 → 窯変 (レア)",
    primary: "yohen",
    cx: 0.84,
    cy: 0.66,
  },
};

const KESHIKI_INFO: Record<
  Keshiki,
  { jp: string; en: string; desc: string; color: string; ring: string }
> = {
  goma: {
    jp: "胡麻",
    en: "Goma",
    desc: "降りかかった松灰が溶けたガラス質の点",
    color: "#e0c47a",
    ring: "rgba(224, 196, 122, 0.45)",
  },
  sangiri: {
    jp: "桟切",
    en: "Sangiri",
    desc: "炭に埋もれて生じた青黒い帯",
    color: "#3a3852",
    ring: "rgba(58, 56, 82, 0.55)",
  },
  hidasuki: {
    jp: "緋襷",
    en: "Hidasuki",
    desc: "藁を巻いて焼いた緋色の線",
    color: "#d05d34",
    ring: "rgba(208, 93, 52, 0.45)",
  },
  botamochi: {
    jp: "牡丹餅",
    en: "Botamochi",
    desc: "重ね焼きで残った白い円",
    color: "#ead8b3",
    ring: "rgba(234, 216, 179, 0.45)",
  },
  yohen: {
    jp: "窯変",
    en: "Yohen",
    desc: "炎の戯れが残した複雑な変化",
    color: "#1f5d4f",
    ring: "rgba(31, 93, 79, 0.55)",
  },
};

// Per-position weighted blend: primary always present, plus 1–2 secondaries.
const SECONDARY_KESHIKI: Record<KamairePos, Keshiki[]> = {
  floor: ["sangiri", "botamochi"],
  top: ["goma", "yohen"],
  corner: ["botamochi", "goma"],
  center: ["goma", "hidasuki"],
  side: ["sangiri", "hidasuki"],
};

const DEFAULT_SHAPE: Shape = { segs: [0.55, 0.78, 0.78, 0.5] };

// ─────────────────────────────────────────────────────────────────────
// Vase profile geometry (shared between SVG previews and final canvas)
// ─────────────────────────────────────────────────────────────────────

const VASE = { w: 200, h: 240, cx: 100, base: 220, top: 30 } as const;
const VASE_BASE_R = 28;
const VASE_MAX_R = 78;

function bandRadius(seg: number): number {
  return VASE_BASE_R + seg * (VASE_MAX_R - VASE_BASE_R);
}

// Build a smooth left-then-right vase silhouette using quadratic curves
// through 6 sample points. Returns an SVG path string usable both in
// <path d="…"/> and as `new Path2D(d)` for the final image canvas.
function buildVasePath(shape: Shape): string {
  const cx = VASE.cx;
  const base = VASE.base;
  const top = VASE.top;
  const totalH = base - top;
  const segs = shape.segs;
  // 6 sample radii, bottom → rim
  const rs = [
    VASE_BASE_R * 0.95,
    bandRadius(segs[0]),
    bandRadius(segs[1]),
    bandRadius(segs[2]),
    bandRadius(segs[3]),
    VASE_BASE_R + 0.55 * (segs[3] * (VASE_MAX_R - VASE_BASE_R)),
  ];
  const ys = [
    base,
    base - totalH * 0.18,
    base - totalH * 0.4,
    base - totalH * 0.62,
    base - totalH * 0.84,
    top,
  ];

  const fmt = (n: number) => Math.round(n * 10) / 10;

  let path = `M ${fmt(cx - rs[0])} ${fmt(ys[0])}`;
  // Up the left side
  for (let i = 1; i < ys.length; i++) {
    const xMid = cx - (rs[i - 1] + rs[i]) / 2;
    const yMid = (ys[i - 1] + ys[i]) / 2;
    path += ` Q ${fmt(xMid)} ${fmt(yMid)} ${fmt(cx - rs[i])} ${fmt(ys[i])}`;
  }
  // Rim (cap)
  path += ` Q ${fmt(cx)} ${fmt(top - 6)} ${fmt(cx + rs[5])} ${fmt(ys[5])}`;
  // Down the right side
  for (let i = ys.length - 2; i >= 0; i--) {
    const xMid = cx + (rs[i + 1] + rs[i]) / 2;
    const yMid = (ys[i + 1] + ys[i]) / 2;
    path += ` Q ${fmt(xMid)} ${fmt(yMid)} ${fmt(cx + rs[i])} ${fmt(ys[i])}`;
  }
  path += " Z";
  return path;
}

// Map normalized keshiki coordinate to absolute SVG coordinate inside
// the vase bbox. Used by both the kashoku preview and the final image.
function spotPoint(spot: KeshikiSpot, shape: Shape) {
  const totalH = VASE.base - VASE.top;
  const yLocal = VASE.top + 8 + spot.y * (totalH - 24);
  // Approximate segment radius at this y for safer x clamping
  const segIdx = Math.min(3, Math.max(0, Math.floor(spot.y * 4)));
  const r = bandRadius(shape.segs[segIdx]) - 6;
  const xLocal = VASE.cx + spot.x * r;
  return {
    x: Math.round(xLocal * 10) / 10,
    y: Math.round(yLocal * 10) / 10,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Keshiki generator
// 同じ位置でも微妙に違うランダム性 — primary is always present (×2 spots),
// plus 1–2 secondaries from SECONDARY_KESHIKI[pos].
// Called only after mount → safe to use Math.random.
// ─────────────────────────────────────────────────────────────────────

function generateKeshiki(pos: KamairePos): {
  list: KeshikiSpot[];
  primary: Keshiki;
} {
  const primary = KAMAIRE_INFO[pos].primary;
  const secondaries = SECONDARY_KESHIKI[pos];
  const list: KeshikiSpot[] = [];

  const place = (type: Keshiki, sizeMin: number, sizeMax: number) => {
    list.push({
      type,
      x: (Math.random() - 0.5) * 1.4,
      y: 0.18 + Math.random() * 0.6,
      size: sizeMin + Math.random() * (sizeMax - sizeMin),
      drift: Math.random() * Math.PI * 2,
    });
  };

  // 2 primary spots — mid-large
  place(primary, 0.18, 0.32);
  place(primary, 0.12, 0.22);
  // 1–2 secondary spots — smaller
  const secondaryCount = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < secondaryCount; i++) {
    const k = secondaries[Math.floor(Math.random() * secondaries.length)];
    place(k, 0.08, 0.16);
  }
  return { list, primary };
}

// ─────────────────────────────────────────────────────────────────────
// Final image renderer — draws the finished vase + keshiki onto a 2D
// canvas and returns a PNG dataUrl. The recipe badge is overlaid so the
// archive thumbnail tells the whole story at a glance.
// ─────────────────────────────────────────────────────────────────────

function renderFinalImage(
  shape: Shape,
  pos: KamairePos,
  primary: Keshiki,
  spots: KeshikiSpot[],
): string {
  const W = 600;
  const H = 600;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Smoky background
  const bg = ctx.createRadialGradient(
    W * 0.35,
    H * 0.45,
    20,
    W * 0.5,
    H * 0.6,
    W * 0.85,
  );
  bg.addColorStop(0, "#2a1a0d");
  bg.addColorStop(0.6, "#15100a");
  bg.addColorStop(1, "#070504");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Position vase: scale 200×240 → ~440×528 inside frame, centered.
  const scale = 2.1;
  const offX = (W - VASE.w * scale) / 2;
  const offY = (H - VASE.h * scale) / 2 - 20;
  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  const path = new Path2D(buildVasePath(shape));

  // Body — warm iron-rich body gradient
  const body = ctx.createLinearGradient(0, VASE.top, 0, VASE.base);
  body.addColorStop(0, "#6b4a2e");
  body.addColorStop(0.55, "#43271a");
  body.addColorStop(1, "#2c170c");
  ctx.fillStyle = body;
  ctx.fill(path);

  // Ash dust shading (vertical highlight)
  ctx.save();
  ctx.clip(path);
  const sheen = ctx.createLinearGradient(VASE.cx - 50, 0, VASE.cx + 60, 0);
  sheen.addColorStop(0, "rgba(0,0,0,0.35)");
  sheen.addColorStop(0.5, "rgba(255,210,160,0.06)");
  sheen.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, VASE.top, VASE.w, VASE.h);

  // Keshiki spots
  for (const spot of spots) {
    const info = KESHIKI_INFO[spot.type];
    const p = spotPoint(spot, shape);
    const sizePx = spot.size * 60;
    if (spot.type === "sangiri") {
      // streak band
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(spot.drift * 0.25 - 0.3);
      const grd = ctx.createLinearGradient(-sizePx, 0, sizePx, 0);
      grd.addColorStop(0, "rgba(58,56,82,0)");
      grd.addColorStop(0.5, info.color);
      grd.addColorStop(1, "rgba(58,56,82,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(-sizePx, -sizePx * 0.35, sizePx * 2, sizePx * 0.7);
      ctx.restore();
    } else if (spot.type === "hidasuki") {
      // thin scarlet line
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(spot.drift * 0.4);
      ctx.strokeStyle = info.color;
      ctx.lineWidth = sizePx * 0.18;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-sizePx, 0);
      ctx.lineTo(sizePx, 0);
      ctx.stroke();
      ctx.restore();
    } else if (spot.type === "yohen") {
      // mottled patch
      const grd = ctx.createRadialGradient(
        p.x,
        p.y,
        0,
        p.x,
        p.y,
        sizePx * 1.1,
      );
      grd.addColorStop(0, info.color);
      grd.addColorStop(0.5, "rgba(31,93,79,0.5)");
      grd.addColorStop(1, "rgba(31,93,79,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sizePx * 1.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // goma / botamochi: round dab
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sizePx);
      grd.addColorStop(0, info.color);
      grd.addColorStop(0.7, info.color);
      grd.addColorStop(1, info.ring);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sizePx, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Outline
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = "rgba(20,10,5,0.7)";
  ctx.stroke(path);

  ctx.restore();

  // Recipe overlay
  ctx.fillStyle = "rgba(245,228,196,0.92)";
  ctx.font = "20px serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    `備前焼  ·  位置 ${KAMAIRE_INFO[pos].jp}  ·  景色 ${KESHIKI_INFO[primary].jp}  ·  一点物`,
    24,
    H - 28,
  );
  ctx.fillStyle = "rgba(245,228,196,0.45)";
  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillText("Bizen-yaki — Okayama", 24, H - 48);

  return canvas.toDataURL("image/png");
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — Rokuro (轆轤)
// ─────────────────────────────────────────────────────────────────────

function RokuroStep({
  shape,
  setShape,
  mutedRef,
}: {
  shape: Shape;
  setShape: (s: Shape) => void;
  mutedRef: RefObject<boolean>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ idx: number } | null>(null);
  const [touched, setTouched] = useState(0);
  const lastSoundRef = useRef(0);

  // Continuous wheel hum — kicks off the first time the user gestures
  // (browsers gate AudioContext until then). We schedule a re-trigger
  // every ~3.8s so the ambient never gaps; cleanup clears the interval.
  useEffect(() => {
    playFire({ mutedRef, duration: 4.0, volume: 0.3 });
    const id = setInterval(() => {
      playFire({ mutedRef, duration: 4.0, volume: 0.3 });
    }, 3800);
    return () => clearInterval(id);
  }, [mutedRef]);

  // Spinning marker dots on the wheel — DOM-driven so we don't trigger a
  // React re-render every frame.
  const dotsRef = useRef<(SVGCircleElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      const baseAngle = t * 1.4;
      for (let i = 0; i < dotsRef.current.length; i++) {
        const dot = dotsRef.current[i];
        if (!dot) continue;
        const a = baseAngle + (i / dotsRef.current.length) * Math.PI * 2;
        const x = VASE.cx + Math.cos(a) * 60;
        const y = VASE.base + Math.sin(a) * 9;
        dot.setAttribute("cx", (Math.round(x * 10) / 10).toString());
        dot.setAttribute("cy", (Math.round(y * 10) / 10).toString());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function svgPoint(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  // Map a y in vase coords to which segment band it belongs to.
  function bandIdxAt(y: number): number {
    const totalH = VASE.base - VASE.top;
    const ratio = (VASE.base - y) / totalH; // 0 at base, 1 at top
    const idx = Math.floor(ratio * 4);
    return Math.max(0, Math.min(3, idx));
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const p = svgPoint(e);
    if (!p) return;
    if (p.y < VASE.top || p.y > VASE.base) return;
    const idx = bandIdxAt(p.y);
    dragRef.current = { idx };
    e.currentTarget.setPointerCapture(e.pointerId);
    playThud({
      mutedRef,
      freqStart: 80,
      freqEnd: 38,
      duration: 0.18,
      volume: 0.4,
    });
    applyDrag(p.x, idx);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const p = svgPoint(e);
    if (!p) return;
    applyDrag(p.x, dragRef.current.idx);
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }

  function applyDrag(localX: number, idx: number) {
    const dx = Math.abs(localX - VASE.cx);
    // Clamp to band radius range
    const newSeg = Math.max(0.18, Math.min(1, (dx - VASE_BASE_R) / (VASE_MAX_R - VASE_BASE_R) + 0.18));
    const segs = [...shape.segs] as Shape["segs"];
    if (Math.abs(segs[idx] - newSeg) < 0.005) return;
    segs[idx] = newSeg;
    setShape({ segs });
    setTouched((t) => (t & (1 << idx) ? t : t | (1 << idx)));
    // Throttled tick to avoid audio spam
    const now = performance.now();
    if (now - lastSoundRef.current > 80) {
      lastSoundRef.current = now;
      playClick({ mutedRef, freq: 600 + idx * 200, duration: 0.04, volume: 0.2 });
    }
  }

  const path = buildVasePath(shape);
  const touchedCount =
    ((touched >> 0) & 1) +
    ((touched >> 1) & 1) +
    ((touched >> 2) & 1) +
    ((touched >> 3) & 1);

  // Static spoke positions (deterministic, hydration-safe)
  const spokes = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return {
        x1: Math.round((VASE.cx + Math.cos(a) * 24) * 10) / 10,
        y1: Math.round((VASE.base + Math.sin(a) * 4) * 10) / 10,
        x2: Math.round((VASE.cx + Math.cos(a) * 70) * 10) / 10,
        y2: Math.round((VASE.base + Math.sin(a) * 9) * 10) / 10,
      };
    });
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VASE.w} ${VASE.h + 30}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="aspect-[5/7] w-[min(82vw,22rem)] cursor-ew-resize touch-none rounded-sm border border-washi-50/10 bg-[#1d130a] shadow-2xl shadow-black/60"
      >
        {/* Floor shadow */}
        <ellipse
          cx={VASE.cx}
          cy={VASE.base + 22}
          rx={92}
          ry={6}
          fill="rgba(0,0,0,0.55)"
        />
        {/* Wheel disc */}
        <ellipse
          cx={VASE.cx}
          cy={VASE.base + 4}
          rx={84}
          ry={14}
          fill="#2a1a0d"
        />
        <ellipse
          cx={VASE.cx}
          cy={VASE.base}
          rx={78}
          ry={11}
          fill="#5b3a20"
        />
        {/* Static spokes (visual reference) */}
        {spokes.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={0.8}
          />
        ))}
        {/* Spinning markers — repositioned each frame via DOM */}
        {[0, 1, 2, 3].map((i) => (
          <circle
            key={i}
            ref={(el) => {
              dotsRef.current[i] = el;
            }}
            cx={VASE.cx + 60}
            cy={VASE.base}
            r={1.6}
            fill="#c98a4f"
          />
        ))}

        {/* Clay body */}
        <defs>
          <linearGradient id="clay" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8c5a3a" />
            <stop offset="55%" stopColor="#5b3017" />
            <stop offset="100%" stopColor="#3a1d0c" />
          </linearGradient>
        </defs>
        <path d={path} fill="url(#clay)" stroke="rgba(20,10,5,0.7)" strokeWidth={0.6} />

        {/* Drag handles — small caps on each band's outer edge */}
        {shape.segs.map((seg, i) => {
          const totalH = VASE.base - VASE.top;
          const y = Math.round((VASE.base - totalH * (0.18 + 0.22 * i)) * 10) / 10;
          const r = bandRadius(seg);
          const xL = Math.round((VASE.cx - r) * 10) / 10;
          const xR = Math.round((VASE.cx + r) * 10) / 10;
          const isTouched = (touched >> i) & 1;
          const fill = isTouched ? "rgba(255, 220, 160, 0.95)" : "rgba(255, 220, 160, 0.55)";
          return (
            <g key={i}>
              <circle cx={xL} cy={y} r={3.4} fill={fill} />
              <circle cx={xR} cy={y} r={3.4} fill={fill} />
            </g>
          );
        })}
      </svg>

      <div className="flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/55">
        <Hand size={11} />
        <span>左右にドラッグで形を作る</span>
        <span className="font-jp">·</span>
        <span>{touchedCount}/4</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — Kama-ire (窯入れ位置)
// ─────────────────────────────────────────────────────────────────────

function KamaireStep({
  position,
  setPosition,
  mutedRef,
}: {
  position: KamairePos | null;
  setPosition: (p: KamairePos) => void;
  mutedRef: RefObject<boolean>;
}) {
  // Climbing-kiln cross-section (登り窯) — 320×240 viewBox.
  const W = 320;
  const H = 240;

  function onSelect(p: KamairePos) {
    setPosition(p);
    playClick({ mutedRef, freq: 1500 });
  }

  // Kiln dome path (deterministic)
  const kilnPath = useMemo(() => {
    // Ground line, then dome. Stepped tunnel for 登り窯 silhouette.
    const fmt = (n: number) => Math.round(n * 10) / 10;
    return `M ${fmt(20)} ${fmt(H - 24)}
      L ${fmt(20)} ${fmt(H - 60)}
      Q ${fmt(40)} ${fmt(60)} ${fmt(110)} ${fmt(50)}
      Q ${fmt(180)} ${fmt(40)} ${fmt(220)} ${fmt(80)}
      Q ${fmt(260)} ${fmt(120)} ${fmt(290)} ${fmt(H - 70)}
      L ${fmt(290)} ${fmt(H - 24)} Z`;
  }, []);

  // Inner cavity (where pots go)
  const cavityPath = useMemo(() => {
    const fmt = (n: number) => Math.round(n * 10) / 10;
    return `M ${fmt(40)} ${fmt(H - 30)}
      L ${fmt(40)} ${fmt(H - 70)}
      Q ${fmt(60)} ${fmt(85)} ${fmt(115)} ${fmt(78)}
      Q ${fmt(180)} ${fmt(70)} ${fmt(210)} ${fmt(105)}
      Q ${fmt(245)} ${fmt(140)} ${fmt(270)} ${fmt(H - 78)}
      L ${fmt(270)} ${fmt(H - 30)} Z`;
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="aspect-[4/3] w-[min(86vw,28rem)] touch-none rounded-sm border border-washi-50/10 bg-[#1a0e07] shadow-2xl shadow-black/60"
      >
        <defs>
          <radialGradient id="kilnHeat" cx="50%" cy="80%" r="80%">
            <stop offset="0%" stopColor="#c5421a" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#3a1804" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0c0604" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="kilnBrick" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a2618" />
            <stop offset="100%" stopColor="#1a0e07" />
          </linearGradient>
        </defs>

        {/* Outer kiln body */}
        <path d={kilnPath} fill="url(#kilnBrick)" stroke="rgba(0,0,0,0.6)" strokeWidth={1} />
        {/* Inner cavity (heat zone) */}
        <path d={cavityPath} fill="url(#kilnHeat)" />
        {/* Brick texture lines */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = Math.round(((H - 28) - i * 28) * 10) / 10;
          return (
            <line
              key={i}
              x1={22}
              y1={y}
              x2={288}
              y2={y}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={0.4}
              strokeDasharray="3 5"
            />
          );
        })}
        {/* Ground line */}
        <line
          x1={0}
          y1={H - 22}
          x2={W}
          y2={H - 22}
          stroke="rgba(245,228,196,0.18)"
          strokeWidth={0.6}
        />
        {/* Firebox glow at the bottom-left */}
        <ellipse cx={50} cy={H - 30} rx={20} ry={6} fill="#c5421a" opacity={0.6} />

        {/* Position spots */}
        {(Object.keys(KAMAIRE_INFO) as KamairePos[]).map((p) => {
          const info = KAMAIRE_INFO[p];
          const cx = Math.round(info.cx * W * 10) / 10;
          const cy = Math.round(info.cy * H * 10) / 10;
          const active = position === p;
          return (
            <g
              key={p}
              onClick={() => onSelect(p)}
              className="cursor-pointer"
            >
              <circle
                cx={cx}
                cy={cy}
                r={active ? 18 : 14}
                fill={active ? "rgba(255,210,120,0.35)" : "rgba(255,210,120,0.12)"}
                stroke={active ? "#ffd76a" : "rgba(255,210,120,0.55)"}
                strokeWidth={active ? 2 : 1}
              />
              <circle
                cx={cx}
                cy={cy}
                r={5}
                fill={active ? "#ffd76a" : "rgba(255,210,120,0.7)"}
              />
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                fill={active ? "#1d130a" : "#1a0e07"}
                fontSize="7"
                className="font-jp"
              >
                {info.jp}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Selected position description */}
      <div className="min-h-[2.4rem] text-center text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/70">
        {position ? (
          <>
            <span className="font-jp text-base tracking-wider text-washi-50">
              {KAMAIRE_INFO[position].jp}
            </span>
            <span className="mx-2 text-washi-50/40">·</span>
            <span className="font-jp tracking-wider text-washi-50/85 normal-case">
              {KAMAIRE_INFO[position].desc}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-2">
            <MapPin size={11} /> 5 つの位置から選ぶ
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3 — Shōsei (焼成) 14-second firing animation
// ─────────────────────────────────────────────────────────────────────

interface ShoseiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  size: number;
  type: "ember" | "ash";
}

function ShoseiStep({
  shape,
  onDone,
  mutedRef,
}: {
  shape: Shape;
  onDone: () => void;
  mutedRef: RefObject<boolean>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const finishedRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  const handleSkip = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDoneRef.current();
  }, []);

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

    // Audio — long fire ambient + delayed crackle at 6s.
    playFire({ mutedRef, duration: 14.0 });
    const crackleTimer = setTimeout(() => {
      playCrackle({ mutedRef, duration: 2.0 });
    }, 6000);

    let raf = 0;
    let doneTimer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = performance.now();
    const particles: ShoseiParticle[] = [];

    const path = new Path2D(buildVasePath(shape));

    const loop = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const elapsed = (performance.now() - startedAt) / 1000;
      const t = Math.min(14, elapsed) / 14;

      // Background — kiln interior with a heat-pulse tint
      const heat = 0.4 + Math.sin(elapsed * 1.2) * 0.05 + t * 0.4;
      const bg = ctx.createRadialGradient(
        w * 0.5,
        h * 0.85,
        20,
        w * 0.5,
        h * 0.7,
        w * 0.85,
      );
      const r = Math.round(60 + heat * 100);
      const g = Math.round(20 + heat * 28);
      bg.addColorStop(0, `rgba(${r},${g},10,1)`);
      bg.addColorStop(1, "#0a0503");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Trail veil — softens particle motion into glowing afterimages
      ctx.fillStyle = "rgba(8,4,2,0.18)";
      ctx.fillRect(0, 0, w, h);

      // Kiln dome silhouette
      ctx.fillStyle = "#0c0604";
      ctx.beginPath();
      ctx.moveTo(w * 0.05, h * 0.92);
      ctx.lineTo(w * 0.05, h * 0.7);
      ctx.quadraticCurveTo(w * 0.5, h * 0.05, w * 0.95, h * 0.7);
      ctx.lineTo(w * 0.95, h * 0.92);
      ctx.closePath();
      ctx.fill();

      // Inner cavity — kiln glow
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w * 0.13, h * 0.92);
      ctx.lineTo(w * 0.13, h * 0.72);
      ctx.quadraticCurveTo(w * 0.5, h * 0.18, w * 0.87, h * 0.72);
      ctx.lineTo(w * 0.87, h * 0.92);
      ctx.closePath();
      ctx.clip();

      const cavGrad = ctx.createRadialGradient(
        w * 0.5,
        h * 0.85,
        20,
        w * 0.5,
        h * 0.85,
        w * 0.5,
      );
      cavGrad.addColorStop(0, `rgba(255,${Math.round(120 + heat * 60)},40,${0.7 + heat * 0.2})`);
      cavGrad.addColorStop(0.6, "rgba(120,40,10,0.5)");
      cavGrad.addColorStop(1, "rgba(20,8,4,0)");
      ctx.fillStyle = cavGrad;
      ctx.fillRect(0, 0, w, h);

      // Vessel inside — scale path to canvas. Path is in 200×240 space.
      const vScale = Math.min(w / 360, h / 360);
      const offX = w * 0.5 - VASE.cx * vScale;
      const offY = h * 0.55 - VASE.base * vScale;
      ctx.save();
      ctx.translate(offX, offY);
      ctx.scale(vScale, vScale);
      const vBody = ctx.createLinearGradient(0, VASE.top, 0, VASE.base);
      vBody.addColorStop(0, "#5a3a22");
      vBody.addColorStop(0.6, "#36200f");
      vBody.addColorStop(1, "#1a0a04");
      ctx.fillStyle = vBody;
      ctx.fill(path);

      // Glow on vessel rim/edge that scales with heat
      ctx.strokeStyle = `rgba(255,${Math.round(140 + t * 80)},80,${0.35 + t * 0.45})`;
      ctx.lineWidth = 1.2;
      ctx.stroke(path);
      ctx.restore();

      ctx.restore();

      // Phase: 0–3 ignite, 3–8 ash, 8–12 flame caress, 12–14 cooling
      const phase: 0 | 1 | 2 | 3 =
        elapsed < 3 ? 0 : elapsed < 8 ? 1 : elapsed < 12 ? 2 : 3;

      // Spawn embers (flames at base)
      const baseY = h * 0.9;
      const emberIntensity =
        phase === 0
          ? elapsed / 3
          : phase === 1
            ? 1
            : phase === 2
              ? 1.3
              : Math.max(0, 1 - (elapsed - 12) / 2);
      const emberRate = 0.45 * emberIntensity;
      while (Math.random() < emberRate) {
        particles.push({
          x: w * 0.18 + Math.random() * w * 0.64,
          y: baseY + Math.random() * 8,
          vx: (Math.random() - 0.5) * 0.9,
          vy: -1.4 - Math.random() * 1.6 - phase * 0.2,
          life: 0,
          max: 70 + Math.random() * 30,
          hue: 14 + Math.random() * 26,
          size: 1.2 + Math.random() * 1.6,
          type: "ember",
        });
        if (Math.random() > 0.92) break;
      }

      // Spawn ash drift in phase 1+
      if (phase >= 1 && Math.random() < 0.35) {
        particles.push({
          x: Math.random() * w,
          y: -10,
          vx: (Math.random() - 0.5) * 0.3,
          vy: 0.35 + Math.random() * 0.4,
          life: 0,
          max: 220,
          hue: 0,
          size: 0.7 + Math.random() * 0.9,
          type: "ash",
        });
      }

      // Update & draw particles
      let writeIdx = 0;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        if (p.type === "ember") {
          p.vy += 0.005;
          p.vx *= 0.99;
        } else {
          p.vx += Math.sin(p.life * 0.04 + p.x * 0.01) * 0.015;
          p.vy *= 0.998;
        }
        if (p.life < p.max && p.y < h + 20 && p.y > -40) {
          particles[writeIdx++] = p;
        }
      }
      particles.length = writeIdx;

      for (const p of particles) {
        const a = 1 - p.life / p.max;
        if (p.type === "ember") {
          ctx.fillStyle = `hsla(${p.hue}, 92%, 62%, ${a})`;
          ctx.shadowColor = `hsla(${p.hue}, 100%, 50%, ${a * 0.7})`;
          ctx.shadowBlur = 10;
        } else {
          ctx.fillStyle = `rgba(195,180,160,${a * 0.4})`;
          ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Flame curtain at the base in phase 2 — gently licks the vessel
      if (phase === 2) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let k = 0; k < 6; k++) {
          const fx = w * 0.3 + (k / 5) * w * 0.4;
          const sway = Math.sin(elapsed * 3 + k) * 8;
          const fg = ctx.createRadialGradient(
            fx + sway,
            h * 0.7,
            5,
            fx + sway,
            h * 0.7,
            48,
          );
          fg.addColorStop(0, "rgba(255,180,80,0.55)");
          fg.addColorStop(1, "rgba(120,40,10,0)");
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(fx + sway, h * 0.7, 48, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Throttled progress update for outer UI
      const newP = Math.min(1, elapsed / 14);
      if (Math.abs(newP - progressRef.current) > 0.01) {
        progressRef.current = newP;
        setProgress(newP);
      }

      if (elapsed >= 14 && !finishedRef.current) {
        finishedRef.current = true;
        // Slight delay to let final frame breathe
        doneTimer = setTimeout(() => {
          onDoneRef.current();
        }, 350);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(crackleTimer);
      if (doneTimer) clearTimeout(doneTimer);
      window.removeEventListener("resize", resize);
    };
  }, [shape, mutedRef]);

  const phaseLabel =
    progress < 3 / 14
      ? "点火"
      : progress < 8 / 14
        ? "灰が舞う"
        : progress < 12 / 14
          ? "火焔の流れ"
          : "冷却";
  const days = Math.min(14, Math.floor(progress * 14) + 1);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative aspect-[4/3] w-[min(88vw,30rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60"
        style={{ background: "#0a0503" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
        />
        {/* Day counter overlay */}
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/85 backdrop-blur">
          <span className="font-jp tracking-wider">{days} 日目</span>
          <span className="mx-2 text-amber-200/40">·</span>
          <span className="font-jp">{phaseLabel}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] w-72 overflow-hidden rounded-full bg-washi-50/15">
        <div
          className="h-full bg-amber-400/80 transition-[width] duration-150"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <button
        type="button"
        onClick={handleSkip}
        className="inline-flex items-center gap-2 rounded-full border border-washi-50/20 px-3 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-washi-50/70 transition hover:border-washi-50/45 hover:text-washi-50"
      >
        <FastForward size={11} /> Skip 焼成
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 4 — Kashoku (景色確認)
// ─────────────────────────────────────────────────────────────────────

function KashokuStep({
  shape,
  position,
  primary,
  spots,
  mutedRef,
}: {
  shape: Shape;
  position: KamairePos;
  primary: Keshiki;
  spots: KeshikiSpot[];
  mutedRef: RefObject<boolean>;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  // Deterministic display order for the description fade-in
  const [revealCount, setRevealCount] = useState(0);

  // Stagger-reveal each spot description
  useEffect(() => {
    setRevealCount(0);
    const ids: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < spots.length; i++) {
      ids.push(
        setTimeout(() => {
          setRevealCount((c) => Math.max(c, i + 1));
        }, 350 + i * 250),
      );
    }
    return () => {
      for (const t of ids) clearTimeout(t);
    };
  }, [spots]);

  const path = buildVasePath(shape);
  // Subtle gentle sway (DOM-driven, no re-renders)
  const swayRef = useRef<SVGGElement>(null);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      const r = Math.sin(t * 0.6) * 1.4;
      const g = swayRef.current;
      if (g) {
        g.setAttribute(
          "transform",
          `rotate(${(Math.round(r * 100) / 100).toFixed(2)} ${VASE.cx} ${VASE.base})`,
        );
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        viewBox={`0 0 ${VASE.w} ${VASE.h + 30}`}
        className="aspect-[5/7] w-[min(82vw,22rem)] touch-none rounded-sm border border-washi-50/10 bg-[#100805] shadow-2xl shadow-black/60"
      >
        <defs>
          <radialGradient id="kashokuBg" cx="50%" cy="60%" r="80%">
            <stop offset="0%" stopColor="#3a1d10" />
            <stop offset="100%" stopColor="#0c0604" />
          </radialGradient>
          <linearGradient id="kashokuClay" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8c5a3a" />
            <stop offset="55%" stopColor="#5b3017" />
            <stop offset="100%" stopColor="#2c170c" />
          </linearGradient>
          <clipPath id="vaseClip">
            <path d={path} />
          </clipPath>
        </defs>
        <rect width={VASE.w} height={VASE.h + 30} fill="url(#kashokuBg)" />

        {/* Floor shadow */}
        <ellipse
          cx={VASE.cx}
          cy={VASE.base + 22}
          rx={84}
          ry={5}
          fill="rgba(0,0,0,0.6)"
        />

        <g ref={swayRef}>
          <path
            d={path}
            fill="url(#kashokuClay)"
            stroke="rgba(20,10,5,0.7)"
            strokeWidth={0.6}
          />
          {/* Sheen */}
          <g clipPath="url(#vaseClip)">
            <rect
              x={VASE.cx - 50}
              y={VASE.top}
              width={20}
              height={VASE.h}
              fill="rgba(0,0,0,0.4)"
            />
            <rect
              x={VASE.cx + 30}
              y={VASE.top}
              width={28}
              height={VASE.h}
              fill="rgba(0,0,0,0.32)"
            />
            {/* Keshiki spots */}
            {spots.map((s, i) => {
              const info = KESHIKI_INFO[s.type];
              const p = spotPoint(s, shape);
              const sizePx = Math.round(s.size * 24 * 10) / 10;
              const active = hoveredIdx === i;

              if (s.type === "sangiri") {
                const rot = Math.round((s.drift * 12 - 14) * 10) / 10;
                return (
                  <g
                    key={i}
                    transform={`translate(${p.x} ${p.y}) rotate(${rot})`}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    <rect
                      x={-sizePx}
                      y={-sizePx * 0.35}
                      width={sizePx * 2}
                      height={sizePx * 0.7}
                      fill={info.color}
                      opacity={0.78}
                    />
                    {active && (
                      <rect
                        x={-sizePx - 2}
                        y={-sizePx * 0.35 - 2}
                        width={sizePx * 2 + 4}
                        height={sizePx * 0.7 + 4}
                        fill="none"
                        stroke={info.ring}
                        strokeWidth={0.7}
                      />
                    )}
                  </g>
                );
              }
              if (s.type === "hidasuki") {
                const rot = Math.round(s.drift * 25 * 10) / 10;
                return (
                  <g
                    key={i}
                    transform={`translate(${p.x} ${p.y}) rotate(${rot})`}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    <line
                      x1={-sizePx}
                      y1={0}
                      x2={sizePx}
                      y2={0}
                      stroke={info.color}
                      strokeWidth={Math.round(sizePx * 0.35 * 10) / 10}
                      strokeLinecap="round"
                      opacity={0.85}
                    />
                  </g>
                );
              }
              return (
                <g
                  key={i}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={sizePx}
                    fill={info.color}
                    opacity={0.85}
                  />
                  {/* Pulsing ring (CSS) */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={Math.round((sizePx + 2) * 10) / 10}
                    fill="none"
                    stroke={info.ring}
                    strokeWidth={1}
                    opacity={active ? 0.95 : 0.6}
                    className="animate-pulse"
                  />
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Recipe / position summary */}
      <div className="text-center">
        <p className="font-jp text-base tracking-wider text-washi-50/95">
          {KAMAIRE_INFO[position].jp}
          <span className="mx-2 text-washi-50/35">·</span>
          {KESHIKI_INFO[primary].jp}
        </p>
        <p className="mt-1 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/55">
          {KAMAIRE_INFO[position].en} · {KESHIKI_INFO[primary].en}
        </p>
      </div>

      {/* Keshiki list with stagger reveal */}
      <ul className="w-[min(82vw,22rem)] space-y-1.5 text-[0.65rem] tracking-wider text-washi-50/80">
        {spots.map((s, i) => {
          const info = KESHIKI_INFO[s.type];
          const visible = i < revealCount;
          return (
            <li
              key={i}
              onMouseEnter={() => {
                setHoveredIdx(i);
                playClick({ mutedRef, freq: 1100 + i * 80, volume: 0.25 });
              }}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`flex items-center gap-2 transition-opacity duration-500 ${
                visible ? "opacity-100" : "opacity-0"
              } ${hoveredIdx === i ? "text-washi-50" : ""}`}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: info.color }}
              />
              <span className="font-jp">{info.jp}</span>
              <span className="text-washi-50/45">·</span>
              <span className="font-jp text-washi-50/70">{info.desc}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Outer stage — orchestrates step state, navigation, and finalization.
// ─────────────────────────────────────────────────────────────────────

export function BizenYakiStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const mutedRef = useMutedRef();
  const t = useTranslations();
  const [stepIdx, setStepIdx] = useState(0);
  const [shape, setShape] = useState<Shape>(DEFAULT_SHAPE);
  const [position, setPosition] = useState<KamairePos | null>(null);
  const [keshikiSpots, setKeshikiSpots] = useState<KeshikiSpot[]>([]);
  const [primaryKeshiki, setPrimaryKeshiki] = useState<Keshiki | null>(null);

  // Finalize guard — re-entrancy protection like HanabiStage. The async
  // image render + onComplete (which navigates) must run at most once.
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

  const step = STEPS[stepIdx];

  const goNext = useCallback(() => {
    setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
    playClick({ mutedRef, freq: 1400 });
  }, [mutedRef]);
  const goPrev = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
    playClick({ mutedRef, freq: 900 });
  }, [mutedRef]);

  // When entering kashoku, materialize the keshiki list (random per run)
  // and play the completion chime. Only generates once per (position) so
  // 前へ戻る → 戻る doesn't reroll.
  useEffect(() => {
    if (step.id !== "kashoku") return;
    if (!position) return;
    if (keshikiSpots.length > 0) return;
    const { list, primary } = generateKeshiki(position);
    setKeshikiSpots(list);
    setPrimaryKeshiki(primary);
    playChime({ mutedRef, freq: 720 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, position]);

  function complete() {
    if (finalizingRef.current) return;
    if (!position || !primaryKeshiki) return;
    finalizingRef.current = true;
    setFinalizing(true);
    playChime({ mutedRef, freq: 540 });
    finaleTimersRef.current.push(
      setTimeout(() => {
        if (!mountedRef.current) return;
        const dataUrl = renderFinalImage(
          shape,
          position,
          primaryKeshiki,
          keshikiSpots,
        );
        onComplete(dataUrl);
      }, 700),
    );
  }

  // Step gating
  const canAdvance =
    step.id === "rokuro" ||
    (step.id === "kamaire" && position !== null) ||
    step.id === "shosei" ||
    step.id === "kashoku";

  const recipeReady = position && primaryKeshiki;

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      {/* Step indicator */}
      <p className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/65">
        <Flame size={12} />
        Step {stepIdx + 1} / {STEPS.length}
        <span className="text-washi-50/35">·</span>
        <span className="font-jp tracking-wider">{step.jp}</span>
      </p>

      {/* Recipe badge — appears once enough state is locked in */}
      {recipeReady && step.id === "kashoku" && (
        <div className="rounded-full border border-amber-200/40 bg-amber-950/40 px-3 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-amber-100/85 backdrop-blur">
          <span className="font-jp tracking-wider">
            備前焼 · 位置 {KAMAIRE_INFO[position].jp} · 景色{" "}
            {KESHIKI_INFO[primaryKeshiki].jp} · 一点物
          </span>
        </div>
      )}

      {/* Step body */}
      {step.id === "rokuro" && (
        <RokuroStep shape={shape} setShape={setShape} mutedRef={mutedRef} />
      )}
      {step.id === "kamaire" && (
        <KamaireStep
          position={position}
          setPosition={setPosition}
          mutedRef={mutedRef}
        />
      )}
      {step.id === "shosei" && (
        <ShoseiStep shape={shape} onDone={goNext} mutedRef={mutedRef} />
      )}
      {step.id === "kashoku" && position && primaryKeshiki && (
        <KashokuStep
          shape={shape}
          position={position}
          primary={primaryKeshiki}
          spots={keshikiSpots}
          mutedRef={mutedRef}
        />
      )}

      {/* Hint */}
      <p className="max-w-md text-center font-jp text-sm tracking-wider text-washi-50/85">
        {step.hint}
      </p>
      <p className="-mt-3 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/40">
        {step.en}
      </p>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        {stepIdx > 0 && step.id !== "shosei" && (
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex items-center gap-2 rounded-full border border-washi-50/25 px-4 py-2 text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/75 transition hover:border-washi-50/55 hover:text-washi-50"
          >
            <ChevronLeft size={12} />
            <span className="font-jp">前へ戻る</span>
          </button>
        )}

        {step.id !== "shosei" && step.id !== "kashoku" && (
          <button
            type="button"
            onClick={goNext}
            disabled={!canAdvance}
            className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-35"
          >
            <span className="font-jp">次へ</span>
            <Sparkles size={12} />
          </button>
        )}

        {step.id === "kashoku" && (
          <button
            type="button"
            onClick={complete}
            disabled={finalizing || !recipeReady}
            className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-35"
          >
            <Check size={12} /> {t("common.complete")}
          </button>
        )}
      </div>
    </div>
  );
}
