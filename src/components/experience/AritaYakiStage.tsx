"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brush,
  Check,
  Droplets,
  Flame,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import {
  playBrush,
  playChime,
  playClick,
  playFire,
  useMutedRef,
} from "@/lib/craftAudio";
import { useTranslations } from "@/lib/i18n";

// Arita-yaki — Japan's first porcelain (Saga, 1610s-).
// Four-step process: 下絵 (Shitae) → 染め (Some) → 本焼 (Honyaki) → 完成 (Kansei)
//
// Cobalt oxide pigment (呉須) is grey before firing and turns vivid indigo
// at 1300℃. The honyaki step animates that chemical shift — a 5-second
// rAF lerp from #8a8a8a to #2B4A6F plus a specular gloss highlight that
// fades in over the final second.

type Stroke = { d: string; tx?: number; ty?: number };
type FillBlob = { x: number; y: number; intensity: number };
type StepId = "shitae" | "some" | "honyaki" | "kansei";

const PLATE_SIZE = 480;
const CENTER = 240;
const PLATE_R = 200;

const GREY = "#8a8a8a";
const COBALT = "#2B4A6F";

const TOTAL_STEPS = 4;

interface StepDef {
  id: StepId;
  jp: string;
  romaji: string;
  desc: string;
  hint: string;
}

const STEPS: StepDef[] = [
  {
    id: "shitae",
    jp: "下絵",
    romaji: "Shitae",
    desc: "白磁皿に呉須で輪郭を描く",
    hint: "呉須で輪郭を描く. 焼く前は地味な灰色だが、焼くと鮮やかな藍に化ける.",
  },
  {
    id: "some",
    jp: "染め",
    romaji: "Some",
    desc: "領域内を呉須で塗り、濃淡を表現する",
    hint: "線の中を呉須の濃淡で埋める. 染めの濃淡が立体感を生む.",
  },
  {
    id: "honyaki",
    jp: "本焼",
    romaji: "Honyaki",
    desc: "1300℃ の窯で焼成",
    hint: "1300℃ で本焼成. 化学変化で呉須が鮮やかな藍に. 釉薬が艶を出す.",
  },
  {
    id: "kansei",
    jp: "完成",
    romaji: "Kansei",
    desc: "伊万里として世界に渡る",
    hint: "江戸時代に欧州に渡った日本の宝. 王族たちが争って手に入れた.",
  },
];

interface Template {
  id: string;
  jp: string;
  romaji: string;
  d: string;
}

// Eight classical 染付 motifs. Each path is centered at (0,0) and fits in
// roughly a 64x56 box; placement applies a translate based on stroke index.
const TEMPLATES: Template[] = [
  {
    id: "karakusa",
    jp: "唐草",
    romaji: "Karakusa",
    d: "M-30 4 C-30 -16 -12 -16 -12 0 C-12 18 8 18 8 0 C8 -16 26 -16 30 -2",
  },
  {
    id: "ryu",
    jp: "龍",
    romaji: "Ryu",
    d: "M-30 -10 C-15 -22 0 4 16 -8 C30 -16 28 12 6 14 M12 -8 L20 -12 L18 -3",
  },
  {
    id: "houou",
    jp: "鳳凰",
    romaji: "Houou",
    d: "M-26 -8 L0 0 L26 -8 M-15 -18 L0 -2 L15 -18 M0 -2 L-8 22 L0 28 L8 22 Z",
  },
  {
    id: "botan",
    jp: "牡丹",
    romaji: "Botan",
    d: "M0 -22 C10 -22 14 -10 8 -2 L0 0 L-8 -2 C-14 -10 -10 -22 0 -22 Z M16 -8 C22 0 16 12 6 10 L0 0 Z M-16 -8 C-22 0 -16 12 -6 10 L0 0 Z M0 4 C10 8 8 20 0 22 C-8 20 -10 8 0 4 Z",
  },
  {
    id: "shouchikubai",
    jp: "松竹梅",
    romaji: "Shouchikubai",
    d: "M0 -22 L-12 -8 L-4 -8 L-14 6 L-2 6 L-8 18 L8 18 L2 6 L14 6 L4 -8 L12 -8 Z",
  },
  {
    id: "tsuru",
    jp: "鶴",
    romaji: "Tsuru",
    d: "M-26 12 Q-10 -10 8 -2 L20 -10 L24 -6 L18 0 Q12 12 -2 14 Z",
  },
  {
    id: "sakura",
    jp: "桜",
    romaji: "Sakura",
    d: "M0 -20 Q8 -10 0 -4 Q-8 -10 0 -20 Z M19 -6 Q14 4 6 0 Q12 -8 19 -6 Z M12 18 Q4 14 4 4 Q14 6 12 18 Z M-12 18 Q-4 14 -4 4 Q-14 6 -12 18 Z M-19 -6 Q-14 -8 -6 0 Q-14 4 -19 -6 Z",
  },
  {
    id: "fuji",
    jp: "富士",
    romaji: "Fuji",
    d: "M-30 14 Q-10 8 0 -22 Q10 8 30 14 M-12 0 L-6 -8 L0 -16 L6 -8 L12 0",
  },
];

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
  return `rgb(${r}, ${g}, ${bl})`;
}

interface PlateProps {
  mode: "draw" | "fill" | "view";
  strokes: Stroke[];
  drawing: Stroke | null;
  fills: FillBlob[];
  inkColor: string;
  glossOpacity: number;
  rotateDeg: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => void;
}

function PlateSurface({
  mode,
  strokes,
  drawing,
  fills,
  inkColor,
  glossOpacity,
  rotateDeg,
  svgRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PlateProps) {
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${PLATE_SIZE} ${PLATE_SIZE}`}
      xmlns="http://www.w3.org/2000/svg"
      className={clsx(
        "block h-full w-full touch-none select-none",
        mode === "draw" && "cursor-crosshair",
        mode === "fill" && "cursor-pointer",
      )}
      style={{ transform: `rotate(${rotateDeg}deg)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <defs>
        <radialGradient id="arita-body" cx="0.4" cy="0.35">
          <stop offset="0" stopColor="#FFFEFA" />
          <stop offset="0.55" stopColor="#F8F2E2" />
          <stop offset="1" stopColor="#E8DDC2" />
        </radialGradient>
        <radialGradient id="arita-shadow" cx="0.5" cy="0.5">
          <stop offset="0.86" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.45)" />
        </radialGradient>
      </defs>
      <rect width={PLATE_SIZE} height={PLATE_SIZE} fill="#1a1108" />
      <circle cx={CENTER} cy={CENTER} r={PLATE_R} fill="url(#arita-body)" />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={Math.round(PLATE_R - 14)}
        fill="none"
        stroke="rgba(150,140,110,0.32)"
        strokeWidth={0.6}
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={Math.round(PLATE_R - 28)}
        fill="none"
        stroke="rgba(150,140,110,0.18)"
        strokeWidth={0.4}
      />
      <g>
        {fills.map((f, i) => (
          <circle
            key={i}
            cx={Math.round(f.x)}
            cy={Math.round(f.y)}
            r={Math.round(20 + f.intensity * 4)}
            fill={inkColor}
            opacity={Math.min(0.85, 0.24 * f.intensity)}
          />
        ))}
      </g>
      <g>
        {strokes.map((s, i) => (
          <path
            key={i}
            d={s.d}
            transform={
              s.tx !== undefined
                ? `translate(${Math.round(s.tx)} ${Math.round(s.ty ?? 0)})`
                : undefined
            }
            fill="none"
            stroke={inkColor}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {drawing && (
          <path
            d={drawing.d}
            fill="none"
            stroke={inkColor}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>
      {glossOpacity > 0 && (
        <ellipse
          cx={Math.round(CENTER - 60)}
          cy={Math.round(CENTER - 80)}
          rx={92}
          ry={32}
          fill="white"
          opacity={glossOpacity}
          transform={`rotate(-22 ${Math.round(CENTER - 60)} ${Math.round(
            CENTER - 80,
          )})`}
        />
      )}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={PLATE_R}
        fill="none"
        stroke="#cabd9a"
        strokeWidth={1.4}
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={PLATE_R}
        fill="url(#arita-shadow)"
        pointerEvents="none"
      />
    </svg>
  );
}

export function AritaYakiStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const t = useTranslations();
  const muted = useMutedRef();
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [fills, setFills] = useState<FillBlob[]>([]);
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const [kilnProgress, setKilnProgress] = useState(0);
  const [rotateDeg, setRotateDeg] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const finalizingRef = useRef(false);
  const [finalizing, setFinalizing] = useState(false);
  const mountedRef = useRef(true);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Holds the live stroke during a drag — the d-string is mutated each
  // pointermove and copied into `drawing` state for re-render. Using a
  // ref avoids the stale closure that would otherwise stop appending
  // points after the first move.
  const drawingRef = useRef<Stroke | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current = [];
    };
  }, []);

  // Honyaki kiln animation — auto-runs while step.id === "honyaki".
  useEffect(() => {
    if (step.id !== "honyaki") {
      setKilnProgress(0);
      return;
    }
    setKilnProgress(0);
    playFire({ mutedRef: muted, duration: 4.5 });
    const start = performance.now();
    let raf = 0;
    // Local handle for this effect's auto-advance timer so the cleanup
    // can cancel it. Without this, leaving honyaki (back button or
    // unmount) before the 5s+500ms completes would still queue a
    // setStepIdx(3) call, jumping the user forward unexpectedly
    // (Codex P2).
    let advanceTimer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / 5000);
      if (mountedRef.current) setKilnProgress(t);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        playChime({ mutedRef: muted });
        advanceTimer = setTimeout(() => {
          if (mountedRef.current) setStepIdx(3);
        }, 500);
        timersRef.current.push(advanceTimer);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (advanceTimer) clearTimeout(advanceTimer);
    };
  }, [step.id, muted]);

  // Kansei rotation — slow continuous spin showcasing the finished plate.
  useEffect(() => {
    if (step.id !== "kansei") {
      setRotateDeg(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      if (mountedRef.current) setRotateDeg((elapsed * 5) % 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step.id]);

  const inkColor = useMemo(() => {
    if (step.id === "shitae" || step.id === "some") return GREY;
    if (step.id === "kansei") return COBALT;
    // honyaki: phase 2-4s of the 5s anim is the colour shift.
    const t = Math.max(0, Math.min(1, (kilnProgress * 5 - 2) / 2));
    return lerpColor(GREY, COBALT, t);
  }, [step.id, kilnProgress]);

  const glossOpacity = useMemo(() => {
    if (step.id === "kansei") return 0.32;
    if (step.id !== "honyaki") return 0;
    const t = Math.max(0, Math.min(1, (kilnProgress * 5 - 4) / 1));
    return t * 0.32;
  }, [step.id, kilnProgress]);

  const kilnHeat = useMemo(() => {
    if (step.id !== "honyaki") return 0;
    if (kilnProgress < 0.4) return kilnProgress / 0.4;
    return Math.max(0, 1 - (kilnProgress - 0.4) / 0.6);
  }, [step.id, kilnProgress]);

  const mode: "draw" | "fill" | "view" =
    step.id === "shitae" ? "draw" : step.id === "some" ? "fill" : "view";

  function pointerCoords(
    e: React.PointerEvent<SVGSVGElement>,
  ): [number, number] {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * PLATE_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * PLATE_SIZE;
    return [x, y];
  }
  function inside(x: number, y: number) {
    const dx = x - CENTER;
    const dy = y - CENTER;
    return dx * dx + dy * dy <= (PLATE_R - 6) * (PLATE_R - 6);
  }

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode === "view") return;
    const [x, y] = pointerCoords(e);
    if (!inside(x, y)) return;
    if (mode === "draw") {
      const start: Stroke = { d: `M ${Math.round(x)} ${Math.round(y)}` };
      drawingRef.current = start;
      setDrawing(start);
      e.currentTarget.setPointerCapture(e.pointerId);
      playBrush({ mutedRef: muted, duration: 0.15 });
    } else if (mode === "fill") {
      addFill(x, y);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode !== "draw") return;
    const cur = drawingRef.current;
    if (!cur) return;
    const [x, y] = pointerCoords(e);
    if (!inside(x, y)) return;
    cur.d += ` L ${Math.round(x)} ${Math.round(y)}`;
    setDrawing({ ...cur });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode === "draw") {
      const cur = drawingRef.current;
      if (cur && cur.d.length > 8) {
        setStrokes((s) => [...s, cur]);
      }
      drawingRef.current = null;
      setDrawing(null);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handlePointerCancel = () => {
    drawingRef.current = null;
    setDrawing(null);
  };

  function addFill(x: number, y: number) {
    setFills((prev) => {
      const next = [...prev];
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < next.length; i++) {
        const dx = next[i].x - x;
        const dy = next[i].y - y;
        const dist = dx * dx + dy * dy;
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
      if (nearestIdx >= 0 && nearestDist < 22 * 22) {
        next[nearestIdx] = {
          ...next[nearestIdx],
          intensity: Math.min(3, next[nearestIdx].intensity + 1),
        };
      } else {
        next.push({ x, y, intensity: 1 });
      }
      return next;
    });
    playBrush({ mutedRef: muted, duration: 0.2 });
  }

  function placeTemplate(t: Template) {
    if (mode !== "draw") return;
    const i = strokes.length;
    const angleDeg = (i * 137.5) % 360;
    const angle = angleDeg * (Math.PI / 180);
    const dist = i === 0 ? 0 : 40 + ((i * 11) % 90);
    const tx = CENTER + Math.cos(angle) * dist;
    const ty = CENTER + Math.sin(angle) * dist;
    setStrokes((s) => [...s, { d: t.d, tx, ty }]);
    playBrush({ mutedRef: muted, duration: 0.18 });
  }

  function clearAll() {
    setStrokes([]);
    setFills([]);
    setDrawing(null);
    drawingRef.current = null;
    playClick({ mutedRef: muted });
  }

  function goNext() {
    if (stepIdx >= STEPS.length - 1) return;
    playClick({ mutedRef: muted });
    setStepIdx((i) => i + 1);
  }
  function goBack() {
    if (stepIdx === 0) return;
    playClick({ mutedRef: muted });
    setStepIdx((i) => i - 1);
  }

  const handleFinalize = useCallback(() => {
    if (finalizingRef.current) return;
    if (!svgRef.current) return;
    finalizingRef.current = true;
    setFinalizing(true);
    playChime({ mutedRef: muted });

    const svg = svgRef.current;
    let serialized: string;
    try {
      serialized = new XMLSerializer().serializeToString(svg);
    } catch {
      finalizingRef.current = false;
      setFinalizing(false);
      return;
    }
    if (!serialized.includes("xmlns=")) {
      serialized = serialized.replace(
        /^<svg /,
        '<svg xmlns="http://www.w3.org/2000/svg" ',
      );
    }
    const dataSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      serialized,
    )}`;
    const img = new Image();
    img.onload = () => {
      if (!mountedRef.current) return;
      const c = document.createElement("canvas");
      c.width = PLATE_SIZE;
      c.height = PLATE_SIZE;
      const ctx = c.getContext("2d");
      if (!ctx) {
        finalizingRef.current = false;
        setFinalizing(false);
        return;
      }
      ctx.fillStyle = "#1a1108";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      onComplete(c.toDataURL("image/png"));
    };
    img.onerror = () => {
      if (!mountedRef.current) return;
      finalizingRef.current = false;
      setFinalizing(false);
    };
    img.src = dataSvg;
  }, [muted, onComplete]);

  const intensityTotal = useMemo(
    () => fills.reduce((sum, f) => sum + f.intensity, 0),
    [fills],
  );

  const showRegularBack = stepIdx > 0 && step.id !== "kansei";

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/85">
        <Sparkles size={14} /> Step {stepIdx + 1} / {TOTAL_STEPS} ·{" "}
        <span className="font-jp text-washi-50/95">
          {step.jp} ({step.romaji})
        </span>
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 text-[0.55rem] uppercase tracking-[0.36em] text-washi-50/65">
        <span className="rounded-full border border-washi-50/15 bg-black/30 px-3 py-1 backdrop-blur">
          <span className="font-jp tracking-wider text-washi-50/85">
            有田焼
          </span>{" "}
          · 染付 · 濃淡 {intensityTotal} · 伊万里印
        </span>
      </div>

      <div
        className="relative overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60"
        style={{
          width: "min(80vw, 32rem)",
          height: "min(80vw, 32rem)",
          background: "#1a1108",
        }}
      >
        {kilnHeat > 0 && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 55%, rgba(255,140,40,${(
                0.55 * kilnHeat
              ).toFixed(3)}) 0%, rgba(255,80,30,${(0.32 * kilnHeat).toFixed(
                3,
              )}) 35%, rgba(0,0,0,0) 70%)`,
              mixBlendMode: "screen",
            }}
          />
        )}

        <PlateSurface
          mode={mode}
          strokes={strokes}
          drawing={drawing}
          fills={fills}
          inkColor={inkColor}
          glossOpacity={glossOpacity}
          rotateDeg={rotateDeg}
          svgRef={svgRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />

        {step.id === "kansei" && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-sm border border-amber-200/40 bg-black/45 px-3 py-1.5 text-right text-[0.5rem] uppercase tracking-[0.4em] text-amber-200/85 backdrop-blur">
            <p className="font-jp text-base leading-tight tracking-wide">
              伊万里
            </p>
            <p className="text-[0.5rem]">Imari · 1659–</p>
          </div>
        )}

        {step.id === "honyaki" && (
          <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/90 backdrop-blur">
            <Flame size={12} />
            <span>1300℃ · {Math.round(kilnProgress * 100)}%</span>
          </div>
        )}
      </div>

      <p className="max-w-md text-center text-[0.7rem] leading-relaxed text-washi-50/80">
        <span className="font-jp text-washi-50/95">{step.desc}</span> —{" "}
        {step.hint}
      </p>

      {step.id === "shitae" && (
        <div className="flex flex-col items-center gap-3">
          <p className="flex items-center gap-2 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/60">
            <Brush size={12} /> 古典文様をタップで配置 / ドラッグで自由筆
          </p>
          <div className="grid max-w-md grid-cols-4 gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => placeTemplate(t)}
                className="flex flex-col items-center gap-1 rounded-sm border border-washi-50/15 bg-black/30 px-2 py-1.5 text-washi-50/85 transition hover:border-washi-50/45 hover:bg-black/50"
              >
                <svg
                  viewBox="-32 -28 64 56"
                  className="h-7 w-10"
                  aria-hidden
                >
                  <path
                    d={t.d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="font-jp text-[0.65rem] tracking-wide">
                  {t.jp}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step.id === "some" && (
        <p className="flex items-center gap-2 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/60">
          <Droplets size={12} /> 皿をタップで濃淡を重ねる (最大 3 段階)
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {showRegularBack && (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.55rem] uppercase tracking-[0.36em] text-washi-50/80 transition hover:border-washi-50/60 hover:text-washi-50"
          >
            <ArrowLeft size={12} /> {t("common.previousStep")}
          </button>
        )}
        {step.id === "shitae" && strokes.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[0.55rem] uppercase tracking-[0.36em] text-washi-50/55 underline-offset-4 hover:text-washi-50/85 hover:underline"
          >
            Clear
          </button>
        )}
        {step.id === "shitae" && (
          <button
            type="button"
            onClick={goNext}
            disabled={strokes.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
          >
            染めへ <ArrowRight size={12} />
          </button>
        )}
        {step.id === "some" && (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100"
          >
            <Flame size={12} /> 本焼へ
          </button>
        )}
        {step.id === "kansei" && (
          <>
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.55rem] uppercase tracking-[0.36em] text-washi-50/80 transition hover:border-washi-50/60 hover:text-washi-50"
            >
              <ArrowLeft size={12} /> {t("common.previousStep")}
            </button>
            <button
              type="button"
              onClick={handleFinalize}
              disabled={finalizing}
              className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
            >
              <Check size={12} /> {t("common.complete")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
