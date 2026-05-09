"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  ArrowLeft,
  Check,
  Droplets,
  Flame,
  Hammer,
  Sparkles,
} from "lucide-react";
import {
  playBrush,
  playChime,
  playClick,
  playFire,
  playMetalRing,
  playWater,
  useMutedRef,
} from "@/lib/craftAudio";

// ─────────────────────────────────────────────────────────────────────
// Step definitions — 4 stages of Echizen blade forging.
// 火床 → 鍛造 → 焼入れ → 研ぎ
// ─────────────────────────────────────────────────────────────────────

type StepId = "kashitsu" | "tanzo" | "yakiire" | "togi";

interface StepDef {
  id: StepId;
  jp: string;
  romaji: string;
  desc: string;
  hint: string;
}

const STEPS: StepDef[] = [
  {
    id: "kashitsu",
    jp: "火床",
    romaji: "kashitsu",
    desc: "Heat the steel in charcoal",
    hint: "火床(ほど)で 1100℃ まで加熱。鋼が白熱したら鎚を打つ合図",
  },
  {
    id: "tanzo",
    jp: "鍛造",
    romaji: "tanzō",
    desc: "Hammer the white-hot steel",
    hint: "鎚で叩いて伸ばす。二枚広げで効率化、千代鶴の伝統",
  },
  {
    id: "yakiire",
    jp: "焼入れ",
    romaji: "yakiire",
    desc: "Quench in water — locks in the hamon",
    hint: "水焼入れで急冷 → 鋼が焼き戻りで硬化。名刀の刃文(はもん)はここで決まる",
  },
  {
    id: "togi",
    jp: "研ぎ",
    romaji: "togi",
    desc: "Sharpen on natural whetstone",
    hint: "天然砥石で研ぎ上げる。刃文の波形は焼入れと研ぎの合作",
  },
];

const TOTAL = STEPS.length;
const TANZO_TARGET = 14; // strikes — spec window is 12-18
const TANZO_MIN = 12;
const TOGI_TARGET = 6;
const HEAT_ADVANCE = 0.9;

// ─────────────────────────────────────────────────────────────────────
// Top-level Stage — owns step state + finalize guard.
// ─────────────────────────────────────────────────────────────────────

export function EchizenBladeStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const muted = useMutedRef();
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const [strikes, setStrikes] = useState(0);
  const [sori, setSori] = useState(0);
  const [togiStrokes, setTogiStrokes] = useState(0);

  // Re-entrancy guard for the final onComplete call. The mounted ref
  // protects us from setting state / navigating after teardown if the
  // user backs out mid-finalize.
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

  const goBack = useCallback(() => {
    if (finalizingRef.current) return;
    playClick({ mutedRef: muted });
    setStepIdx((i) => {
      const prev = Math.max(0, i - 1);
      // Only clear values that the destination step will overwrite, not
      // every downstream value. Otherwise stepping back from yakiire
      // (3) → tanzō (2) clears the strike count the user just earned —
      // even though tanzō is the step that PRODUCED that count
      // (Codex P2). Strikes belong to step 2; sori belongs to step 3;
      // togiStrokes to step 4. Wipe only the values OWNED by steps
      // strictly downstream of `prev`.
      if (prev <= 0) {
        // Back to kashitsu — every downstream value will be redone.
        setStrikes(0);
        setSori(0);
        setTogiStrokes(0);
      } else if (prev <= 1) {
        // Back to tanzō — strikes will be re-earned, sori/togi too.
        setStrikes(0);
        setSori(0);
        setTogiStrokes(0);
      } else if (prev <= 2) {
        // Back to yakiire — keep strikes, redo sori + togi.
        setSori(0);
        setTogiStrokes(0);
      } else {
        // Back to togi — keep strikes + sori, redo togi.
        setTogiStrokes(0);
      }
      return prev;
    });
  }, [muted]);

  const advanceFromKashitsu = useCallback(() => {
    setStepIdx(1);
  }, []);
  const advanceFromTanzo = useCallback(() => {
    setStepIdx(2);
  }, []);
  const advanceFromYakiire = useCallback((s: number) => {
    setSori(s);
    setStepIdx(3);
  }, []);

  const handleStageComplete = useCallback(
    (dataUrl: string) => {
      if (finalizingRef.current) return;
      finalizingRef.current = true;
      setFinalizing(true);
      playChime({ mutedRef: muted });
      playMetalRing({ mutedRef: muted, freq: 1760, duration: 0.8 });
      finaleTimersRef.current.push(
        setTimeout(() => {
          if (!mountedRef.current) return;
          onComplete(dataUrl);
        }, 700),
      );
    },
    [muted, onComplete],
  );

  return (
    <div className="flex w-full flex-col items-center gap-4 text-washi-50">
      {/* Step indicator */}
      <p className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/80">
        <StepIcon id={step.id} />
        Step {stepIdx + 1} / {TOTAL} ·{" "}
        <span className="font-jp tracking-wider text-washi-50">{step.jp}</span>
        <span className="text-washi-50/45">({step.romaji})</span>
      </p>

      {/* English description */}
      <p className="-mt-2 text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/45">
        {step.desc}
      </p>

      {/* Educational sub-text per step */}
      <p className="font-jp max-w-md text-center text-sm leading-relaxed tracking-wider text-washi-50/85">
        {step.hint}
      </p>

      {/* Recipe badge */}
      <div className="rounded-full bg-black/40 px-4 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-amber-200/80 backdrop-blur">
        <span className="font-jp text-amber-200">越前打刃物</span>
        <span className="mx-2 text-washi-50/30">·</span>
        <span className="font-jp">鍛造</span> {strikes}回
        <span className="mx-2 text-washi-50/30">·</span>
        <span className="font-jp">研ぎ</span> {togiStrokes}回
        <span className="mx-2 text-washi-50/30">·</span>
        <span className="font-jp">反り</span> {sori.toFixed(1)}°
      </div>

      {/* Step-specific stage */}
      {step.id === "kashitsu" && (
        <KashitsuStep mutedRef={muted} onAdvance={advanceFromKashitsu} />
      )}
      {step.id === "tanzo" && (
        <TanzōStep
          mutedRef={muted}
          onStrikeProgress={setStrikes}
          onAdvance={advanceFromTanzo}
        />
      )}
      {step.id === "yakiire" && (
        <YakiireStep mutedRef={muted} onAdvance={advanceFromYakiire} />
      )}
      {step.id === "togi" && (
        <TogiStep
          mutedRef={muted}
          sori={sori}
          onStrokeProgress={setTogiStrokes}
          onComplete={handleStageComplete}
          finalizing={finalizing}
        />
      )}

      {/* Back button — every step except the first */}
      {stepIdx > 0 && (
        <button
          type="button"
          onClick={goBack}
          disabled={finalizing}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/25 px-3 py-1.5 text-[0.55rem] uppercase tracking-[0.3em] text-washi-50/75 transition hover:bg-washi-50/10 disabled:opacity-30"
        >
          <ArrowLeft size={11} />{" "}
          <span className="font-jp tracking-wider">前へ戻る</span>
        </button>
      )}
    </div>
  );
}

function StepIcon({ id }: { id: StepId }) {
  if (id === "kashitsu") return <Flame size={12} />;
  if (id === "tanzo") return <Hammer size={12} />;
  if (id === "yakiire") return <Droplets size={12} />;
  return <Sparkles size={12} />;
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — 火床 (Kashitsu): long-press to fan the coals, heat the steel
// ─────────────────────────────────────────────────────────────────────

function KashitsuStep({
  mutedRef,
  onAdvance,
}: {
  mutedRef: RefObject<boolean>;
  onAdvance: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heatRef = useRef(0);
  const [heat, setHeat] = useState(0);
  const pressingRef = useRef(false);
  const advancingRef = useRef(false);
  const fireLastPlayedRef = useRef(0);

  // Single rAF loop owns: heat update, ember physics, drawing.
  // Reads pressingRef synchronously so it never goes stale across
  // pointer events.
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

    interface Ember {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      max: number;
      size: number;
    }
    const embers: Ember[] = [];

    let raf = 0;
    let last = performance.now();
    const start = last;
    let lastSet = 0;

    const loop = () => {
      const now = performance.now();
      const dt = Math.min(60, now - last);
      last = now;
      const t = (now - start) / 1000;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // Heat dynamics — pressing pumps air into the bed; releasing
      // lets it cool slowly. Cap at 1.
      if (pressingRef.current) {
        heatRef.current = Math.min(1, heatRef.current + dt * 0.0009);
      } else {
        heatRef.current = Math.max(0, heatRef.current - dt * 0.00018);
      }
      const heatN = heatRef.current;
      if (Math.abs(heatN - lastSet) > 0.01 || (heatN >= HEAT_ADVANCE) !== (lastSet >= HEAT_ADVANCE)) {
        lastSet = heatN;
        setHeat(heatN);
      }

      // Looping ambient fire — re-trigger the synth roughly every
      // 1.6s so it stays continuous while the user holds.
      if (pressingRef.current && now - fireLastPlayedRef.current > 1500) {
        fireLastPlayedRef.current = now;
        playFire({ mutedRef, duration: 2.0 });
      }

      // ── Background: dark forge interior with radial coal glow ──
      ctx.fillStyle = "#0A0604";
      ctx.fillRect(0, 0, w, h);

      const bedY = Math.round(h * 0.62);
      const coalCx = Math.round(w * 0.5);
      const coalCy = Math.round(bedY + (h - bedY) * 0.32);
      const flicker = pressingRef.current ? Math.sin(t * 9) * 0.05 : Math.sin(t * 3) * 0.02;
      const intensity = 0.45 + heatN * 0.45 + (pressingRef.current ? 0.25 : 0) + flicker;
      const hue = 28 - heatN * 18;
      const glow = ctx.createRadialGradient(
        coalCx,
        coalCy,
        4,
        coalCx,
        coalCy,
        Math.min(w, h) * 0.85,
      );
      glow.addColorStop(0, `hsla(${hue}, 100%, ${55 + heatN * 30}%, ${intensity})`);
      glow.addColorStop(0.4, `hsla(${hue + 5}, 90%, 30%, ${intensity * 0.5})`);
      glow.addColorStop(1, "hsla(15, 70%, 12%, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // ── Forge bed (charcoal pile) ──
      ctx.fillStyle = "#0d0805";
      ctx.fillRect(0, bedY, w, h - bedY);
      // Coal lumps — deterministic positions
      let s = 91;
      const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < 18; i++) {
        const cx = Math.round(rng() * w);
        const cy = Math.round(bedY + rng() * (h - bedY) * 0.6);
        const r = 6 + Math.round(rng() * 10);
        const hot = rng() < 0.6;
        ctx.fillStyle = hot
          ? `hsla(${hue + 5}, 85%, ${30 + heatN * 30}%, 0.8)`
          : "rgba(20, 14, 10, 0.85)";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Steel bar across the forge ──
      const steelX = Math.round(w * 0.16);
      const steelY = Math.round(bedY - 10);
      const steelW = Math.round(w * 0.68);
      const steelH = 12;

      const steelColor = heatColor(heatN);
      if (heatN > 0.25) {
        ctx.shadowColor = `hsla(${30 - heatN * 18}, 100%, 60%, ${heatN})`;
        ctx.shadowBlur = 12 + heatN * 28;
      }
      ctx.fillStyle = steelColor;
      ctx.fillRect(steelX, steelY, steelW, steelH);
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255,255,255,${0.05 + heatN * 0.18})`;
      ctx.fillRect(steelX, steelY, steelW, 2);

      // ── Embers ──
      if (pressingRef.current && Math.random() < 0.4 + heatN * 0.45) {
        embers.push({
          x: Math.round(steelX + Math.random() * steelW),
          y: Math.round(steelY),
          vx: (Math.random() - 0.5) * 0.5,
          vy: -0.6 - Math.random() * 0.7,
          life: 0,
          max: 50 + Math.random() * 35,
          size: 0.7 + Math.random() * 1.4,
        });
      }
      // Update + compact (avoid GC churn from filter())
      let widx = 0;
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.life += 1;
        e.x += e.vx;
        e.y += e.vy;
        e.vy += 0.005;
        e.vx *= 0.99;
        if (e.life < e.max && e.y > 0) embers[widx++] = e;
      }
      embers.length = widx;
      for (const e of embers) {
        const a = 1 - e.life / e.max;
        ctx.fillStyle = `hsla(${30 - heatN * 18}, 100%, ${65 + heatN * 22}%, ${a})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [mutedRef]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (advancingRef.current) return;
    pressingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pressingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }
  function onPointerCancel() {
    pressingRef.current = false;
  }

  function advance() {
    if (advancingRef.current) return;
    if (heatRef.current < HEAT_ADVANCE) return;
    advancingRef.current = true;
    pressingRef.current = false;
    playClick({ mutedRef });
    onAdvance();
  }

  const ready = heat >= HEAT_ADVANCE;

  return (
    <>
      <div className="relative h-[min(56vh,28rem)] w-[min(92vw,42rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className="absolute inset-0 h-full w-full cursor-pointer touch-none"
        />
        <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/80 backdrop-blur">
          <span className="font-jp tracking-wider">長押しで送風</span>
        </p>
      </div>

      {/* Heat bar */}
      <div className="relative h-[3px] w-56 overflow-hidden rounded-full bg-washi-50/15">
        <div
          className="h-full transition-[width] duration-100"
          style={{
            width: `${heat * 100}%`,
            background: `linear-gradient(90deg, hsl(${28 - heat * 18}, 100%, ${50 + heat * 30}%), hsl(${28 - heat * 18}, 100%, ${65 + heat * 25}%))`,
          }}
        />
        {/* White-heat threshold marker */}
        <div
          className="pointer-events-none absolute top-0 h-full w-px bg-washi-50/40"
          style={{ left: `${HEAT_ADVANCE * 100}%` }}
        />
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={advance}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        <Hammer size={12} /> <span className="font-jp tracking-wider">鎚へ進む</span>
      </button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — 鍛造 (Tanzō): tap to hammer the heated steel
// ─────────────────────────────────────────────────────────────────────

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

function TanzōStep({
  mutedRef,
  onStrikeProgress,
  onAdvance,
}: {
  mutedRef: RefObject<boolean>;
  onStrikeProgress: (n: number) => void;
  onAdvance: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const heatRef = useRef(0.95);
  const elongRef = useRef(0);
  const hammerImpactRef = useRef(0);
  const sparksRef = useRef<Spark[]>([]);
  const advancingRef = useRef(false);

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
    let last = performance.now();
    const start = last;

    const loop = () => {
      const now = performance.now();
      const dt = Math.min(60, now - last);
      last = now;
      const t = (now - start) / 1000;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // Passive cool: steel loses heat over time even without strikes
      heatRef.current = Math.max(0.08, heatRef.current - dt * 0.00012);
      // Hammer recoil
      if (hammerImpactRef.current > 0)
        hammerImpactRef.current = Math.max(0, hammerImpactRef.current - dt);

      // Background — dark workshop with subtle red glow from forge
      ctx.fillStyle = "#0a0705";
      ctx.fillRect(0, 0, w, h);
      const dim = ctx.createRadialGradient(
        Math.round(w * 0.5),
        Math.round(h * 0.3),
        4,
        Math.round(w * 0.5),
        Math.round(h * 0.55),
        Math.round(w * 0.7),
      );
      dim.addColorStop(0, "rgba(192, 61, 43, 0.18)");
      dim.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dim;
      ctx.fillRect(0, 0, w, h);

      // Anvil
      const anvilCx = Math.round(w * 0.5);
      const anvilTopY = Math.round(h * 0.62);
      const anvilTopW = Math.round(w * 0.55);
      const anvilNeckW = Math.round(w * 0.16);
      const anvilBaseW = Math.round(w * 0.45);
      const anvilH = Math.round(h - anvilTopY);
      drawAnvil(ctx, anvilCx, anvilTopY, anvilTopW, anvilNeckW, anvilBaseW, anvilH);

      // Steel on anvil — elongates with strikes (gets longer + thinner)
      const baseSteelW = Math.round(anvilTopW * 0.62);
      const extra = Math.round(elongRef.current * anvilTopW * 0.32);
      const steelW = baseSteelW + extra;
      const steelH = Math.max(6, Math.round(14 - elongRef.current * 5));
      const steelX = Math.round(anvilCx - steelW / 2);
      const steelY = Math.round(anvilTopY - steelH);

      const heatN = heatRef.current;
      const steelColor = heatColor(heatN);
      if (heatN > 0.2) {
        ctx.shadowColor = `hsla(${30 - heatN * 18}, 100%, 60%, ${heatN})`;
        ctx.shadowBlur = 14 + heatN * 24;
      }
      ctx.fillStyle = steelColor;
      ctx.fillRect(steelX, steelY, steelW, steelH);
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255,255,255,${0.06 + heatN * 0.18})`;
      ctx.fillRect(steelX, steelY, steelW, 2);

      // Hammer — descends on impact, retracts during cooldown
      const recoilN = hammerImpactRef.current / 220;
      const hammerHeadCy = Math.round(steelY - 6 - (1 - recoilN) * 36);
      drawHammer(ctx, anvilCx, hammerHeadCy);

      // Sparks
      const sparks = sparksRef.current;
      let widx = 0;
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        s.life += dt;
        s.x += s.vx * dt * 0.06;
        s.y += s.vy * dt * 0.06;
        s.vy += 0.025;
        if (s.life < s.max) sparks[widx++] = s;
      }
      sparks.length = widx;
      for (const s of sparks) {
        const a = 1 - s.life / s.max;
        ctx.fillStyle = `hsla(${42 + Math.sin(s.life * 0.05) * 8}, 100%, 70%, ${a})`;
        ctx.beginPath();
        ctx.arc(Math.round(s.x), Math.round(s.y), 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  function strike(e: React.PointerEvent<HTMLCanvasElement>) {
    if (advancingRef.current) return;
    if (countRef.current >= 18) return; // upper bound from spec
    countRef.current = countRef.current + 1;
    const n = countRef.current;
    setCount(n);
    onStrikeProgress(n);
    elongRef.current = Math.min(1, elongRef.current + 0.06);
    heatRef.current = Math.max(0.1, heatRef.current - 0.04);
    hammerImpactRef.current = 220;

    // Sparks at impact (anvil top center)
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = rect.width * 0.5;
    const cy = rect.height * 0.6;
    for (let i = 0; i < 22; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
      const v = 1.6 + Math.random() * 2.4;
      sparksRef.current.push({
        x: Math.round(cx + (Math.random() - 0.5) * 36),
        y: Math.round(cy),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        max: 380 + Math.random() * 280,
      });
    }

    playMetalRing({
      mutedRef,
      freq: 1100 + (Math.random() - 0.5) * 90,
      duration: 0.3,
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    strike(e);
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function advance() {
    if (advancingRef.current) return;
    if (countRef.current < TANZO_MIN) return;
    advancingRef.current = true;
    playClick({ mutedRef });
    onAdvance();
  }

  const ready = count >= TANZO_MIN;

  return (
    <>
      <div className="relative h-[min(56vh,28rem)] w-[min(92vw,42rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="absolute inset-0 h-full w-full cursor-pointer touch-none"
        />
        <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/80 backdrop-blur">
          <span className="font-jp tracking-wider">タップで打つ</span>
        </p>
      </div>

      <p className="text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/60">
        <span className="font-jp">鎚打</span> {count} / {TANZO_TARGET}
      </p>

      <button
        type="button"
        disabled={!ready}
        onClick={advance}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        <Droplets size={12} />{" "}
        <span className="font-jp tracking-wider">焼入れへ</span>
      </button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3 — 焼入れ (Yakiire): drag the hot steel into the water trough
// ─────────────────────────────────────────────────────────────────────

interface SteamP {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

function YakiireStep({
  mutedRef,
  onAdvance,
}: {
  mutedRef: RefObject<boolean>;
  onAdvance: (sori: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const steelYRef = useRef(0); // 0 = top, 1 = fully submerged
  const heatRef = useRef(0.85);
  const dragVelocityRef = useRef(0); // px/ms
  const lastMoveYRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const submergedAtRef = useRef<number | null>(null);
  const soriRef = useRef(0);
  const advancingRef = useRef(false);
  const steamRef = useRef<SteamP[]>([]);
  const splashedRef = useRef(false);

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
    let last = performance.now();
    const start = last;

    const loop = () => {
      const now = performance.now();
      const dt = Math.min(60, now - last);
      last = now;
      const t = (now - start) / 1000;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // Background
      ctx.fillStyle = "#0A0604";
      ctx.fillRect(0, 0, w, h);
      // Faint forge glow lingering from previous step
      const lingerGrad = ctx.createLinearGradient(0, 0, 0, Math.round(h * 0.5));
      lingerGrad.addColorStop(0, "rgba(192, 61, 43, 0.1)");
      lingerGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lingerGrad;
      ctx.fillRect(0, 0, w, Math.round(h * 0.5));

      // Water trough
      const waterY = Math.round(h * 0.56);
      const trough = ctx.createLinearGradient(0, waterY, 0, h);
      trough.addColorStop(0, "#1a3a4a");
      trough.addColorStop(1, "#070f18");
      ctx.fillStyle = trough;
      ctx.fillRect(0, waterY, w, h - waterY);

      // Trough rim
      ctx.fillStyle = "#2a1a10";
      ctx.fillRect(0, waterY - 4, w, 4);

      // Surface ripples
      ctx.strokeStyle = "rgba(140, 180, 200, 0.22)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const y =
            waterY + 3 + i * 6 + Math.sin(t * 1.6 + x * 0.04 + i * 0.7) * 1.6;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Compute steel position
      const cx = Math.round(w * 0.5);
      const tongTopY = Math.round(h * 0.04);
      const steelLen = Math.round(h * 0.32);
      const steelW = 12;
      const steelMinY = Math.round(h * 0.18);
      const steelMaxY = Math.round(h - 26 - steelLen);
      const steelTopY = Math.round(
        steelMinY + (steelMaxY - steelMinY) * steelYRef.current,
      );
      const steelBottomY = steelTopY + steelLen;
      const submergeFrac = Math.max(
        0,
        Math.min(1, (steelBottomY - waterY) / steelLen),
      );

      // Cool faster in water
      if (submergeFrac > 0) {
        heatRef.current = Math.max(
          0,
          heatRef.current - dt * 0.0028 * submergeFrac,
        );
      } else {
        // Slight passive cool in air
        heatRef.current = Math.max(0, heatRef.current - dt * 0.0001);
      }
      const heatN = heatRef.current;

      // Tongs (vertical bars from tong handle to steel top)
      ctx.fillStyle = "#2a1e16";
      ctx.fillRect(cx - 22, tongTopY, 44, 14);
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - 6, tongTopY + 14);
      ctx.lineTo(cx - 6, steelTopY);
      ctx.moveTo(cx + 6, tongTopY + 14);
      ctx.lineTo(cx + 6, steelTopY);
      ctx.stroke();

      // Steel rendered as a vertical blade silhouette. Color goes from
      // heatColor → near-black as it cools/quenches.
      const baseColor = heatColor(heatN);
      // Submerged portion blends to black
      drawQuenchBlade(
        ctx,
        Math.round(cx - steelW / 2),
        steelTopY,
        steelW,
        steelLen,
        baseColor,
        heatN,
        waterY,
        soriRef.current,
      );

      // Steam — spawned where steel meets surface while hot
      if (
        submergeFrac > 0 &&
        heatRef.current > 0.05 &&
        Math.random() < 0.7
      ) {
        steamRef.current.push({
          x: Math.round(cx + (Math.random() - 0.5) * steelW * 1.6),
          y: Math.round(waterY - Math.random() * 4),
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.25 - Math.random() * 0.7,
          life: 0,
          max: 1500 + Math.random() * 900,
          size: 4 + Math.random() * 5,
        });
      }
      // Update steam
      const steam = steamRef.current;
      let widx = 0;
      for (let i = 0; i < steam.length; i++) {
        const p = steam[i];
        p.life += dt;
        p.x += p.vx * dt * 0.05;
        p.y += p.vy * dt * 0.05;
        p.vy += 0.0006;
        p.vx += (Math.random() - 0.5) * 0.005;
        if (p.life < p.max) steam[widx++] = p;
      }
      steam.length = widx;
      for (const p of steam) {
        const lifeN = p.life / p.max;
        const a = (1 - lifeN) * 0.45;
        ctx.fillStyle = `rgba(220, 232, 240, ${a})`;
        ctx.beginPath();
        ctx.arc(
          Math.round(p.x),
          Math.round(p.y),
          p.size * (0.6 + lifeN * 0.6),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      // Splash audio + sori lock-in on first contact
      if (submergeFrac > 0 && !splashedRef.current) {
        splashedRef.current = true;
        playWater({ mutedRef, duration: 1.0 });
        playFire({ mutedRef, duration: 0.6, volume: 0.4 });
      }

      // Auto-advance once fully submerged for ~1.3s
      if (submergeFrac >= 0.95) {
        if (submergedAtRef.current === null) {
          submergedAtRef.current = now;
          // Slower drag → more sori (curved blade); faster → straighter.
          const v = Math.min(2, Math.max(0.1, Math.abs(dragVelocityRef.current)));
          const calc = (1.5 - v) * 4 + (Math.random() * 1.5 - 0.4);
          soriRef.current = Math.max(0.4, Math.min(8, calc));
        }
      }
      if (
        submergedAtRef.current !== null &&
        now - submergedAtRef.current > 1300 &&
        !advancingRef.current
      ) {
        advancingRef.current = true;
        playClick({ mutedRef });
        onAdvance(Math.round(soriRef.current * 10) / 10);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [mutedRef, onAdvance]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (advancingRef.current) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = canvasRef.current!.getBoundingClientRect();
    lastMoveYRef.current = e.clientY - rect.top;
    lastMoveTimeRef.current = performance.now();
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!draggingRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const yPx = e.clientY - rect.top;
    const now = performance.now();
    const dt = now - lastMoveTimeRef.current;
    if (dt > 0) {
      const dy = yPx - lastMoveYRef.current;
      dragVelocityRef.current =
        0.7 * dragVelocityRef.current + 0.3 * (dy / dt);
    }
    lastMoveTimeRef.current = now;
    lastMoveYRef.current = yPx;
    // Map pointer y onto normalized 0..1 steel position
    const norm = Math.max(
      0,
      Math.min(1, (yPx - rect.height * 0.18) / (rect.height * 0.65)),
    );
    if (norm > steelYRef.current) {
      steelYRef.current = norm;
    }
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div className="relative h-[min(56vh,28rem)] w-[min(92vw,42rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />
      <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/80 backdrop-blur">
        <span className="font-jp tracking-wider">下へドラッグして焼入れ</span>
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 4 — 研ぎ (Togi): horizontal drag strokes over the whetstone
// ─────────────────────────────────────────────────────────────────────

function TogiStep({
  mutedRef,
  sori,
  onStrokeProgress,
  onComplete,
  finalizing,
}: {
  mutedRef: RefObject<boolean>;
  sori: number;
  onStrokeProgress: (n: number) => void;
  onComplete: (dataUrl: string) => void;
  finalizing: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState(0);
  const strokesRef = useRef(0);
  const lastXRef = useRef<number | null>(null);
  const sweepDirRef = useRef<"left" | "right" | null>(null);
  const sweepDistRef = useRef(0);
  const finalizingLocalRef = useRef(false);
  // Mouse hover position for the polishing-cloth visualization.
  const cursorRef = useRef<{ x: number; y: number } | null>(null);

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
      const t = (performance.now() - start) / 1000;
      drawTogiScene(
        ctx,
        canvas.clientWidth,
        canvas.clientHeight,
        strokesRef.current,
        sori,
        t,
        cursorRef.current,
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [sori]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (finalizingLocalRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = canvasRef.current!.getBoundingClientRect();
    lastXRef.current = e.clientX - rect.left;
    cursorRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    sweepDirRef.current = null;
    sweepDistRef.current = 0;
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    cursorRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    if (lastXRef.current === null) return;
    const x = e.clientX - rect.left;
    const dx = x - lastXRef.current;
    if (Math.abs(dx) > 1) {
      const dir: "left" | "right" = dx > 0 ? "right" : "left";
      if (sweepDirRef.current === null) {
        sweepDirRef.current = dir;
        sweepDistRef.current = Math.abs(dx);
      } else if (dir !== sweepDirRef.current) {
        // direction reversed — count as a stroke if we travelled far enough
        if (
          sweepDistRef.current > 110 &&
          strokesRef.current < TOGI_TARGET
        ) {
          strokesRef.current = strokesRef.current + 1;
          setStrokes(strokesRef.current);
          onStrokeProgress(strokesRef.current);
          playBrush({ mutedRef, duration: 0.5 });
        }
        sweepDirRef.current = dir;
        sweepDistRef.current = 0;
      } else {
        sweepDistRef.current += Math.abs(dx);
      }
    }
    lastXRef.current = x;
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    lastXRef.current = null;
    sweepDirRef.current = null;
    sweepDistRef.current = 0;
  }
  function onPointerLeave() {
    cursorRef.current = null;
    lastXRef.current = null;
    sweepDirRef.current = null;
  }

  function complete() {
    if (finalizingLocalRef.current) return;
    if (!canvasRef.current) return;
    finalizingLocalRef.current = true;
    cursorRef.current = null; // clean export — no cursor in saved image
    // Re-draw a clean final frame before exporting.
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      drawTogiScene(
        ctx,
        canvasRef.current.clientWidth,
        canvasRef.current.clientHeight,
        TOGI_TARGET,
        sori,
        0,
        null,
      );
    }
    onComplete(canvasRef.current.toDataURL("image/png"));
  }

  const ready = strokes >= TOGI_TARGET;

  return (
    <>
      <div className="relative h-[min(56vh,28rem)] w-[min(92vw,42rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          className="absolute inset-0 h-full w-full cursor-ew-resize touch-none"
        />
        <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/80 backdrop-blur">
          <span className="font-jp tracking-wider">左右にドラッグして研ぐ</span>
        </p>
      </div>

      <p className="text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/60">
        <span className="font-jp">研ぎ</span> {strokes} / {TOGI_TARGET}
      </p>

      <button
        type="button"
        disabled={!ready || finalizing}
        onClick={complete}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
      >
        <Check size={12} /> <span className="font-jp tracking-wider">完成</span>
      </button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Drawing helpers — shared across steps. All coordinates are rounded
// at the call site to avoid sub-pixel hydration mismatches in case
// any of these are inlined into SVG markup later.
// ─────────────────────────────────────────────────────────────────────

function heatColor(h: number): string {
  // 0 = cold gray, 0.3 = deep red, 0.45 = orange-red, 0.7 = bright orange,
  // 0.9 = pale yellow, 1.0 = white-hot.
  const stops: { t: number; r: number; g: number; b: number }[] = [
    { t: 0, r: 30, g: 25, b: 22 },
    { t: 0.3, r: 110, g: 35, b: 25 },
    { t: 0.45, r: 195, g: 65, b: 38 },
    { t: 0.7, r: 245, g: 145, b: 60 },
    { t: 0.9, r: 255, g: 230, b: 170 },
    { t: 1.0, r: 255, g: 250, b: 240 },
  ];
  for (let i = 1; i < stops.length; i++) {
    if (h <= stops[i].t) {
      const a = stops[i - 1];
      const b = stops[i];
      const f = (h - a.t) / (b.t - a.t);
      const r = Math.round(a.r + (b.r - a.r) * f);
      const g = Math.round(a.g + (b.g - a.g) * f);
      const bl = Math.round(a.b + (b.b - a.b) * f);
      return `rgb(${r}, ${g}, ${bl})`;
    }
  }
  return "rgb(255, 250, 240)";
}

function drawAnvil(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  topW: number,
  neckW: number,
  baseW: number,
  h: number,
) {
  const topH = Math.round(h * 0.18);
  const neckH = Math.round(h * 0.42);
  const baseH = h - topH - neckH;
  const grad = ctx.createLinearGradient(cx, topY, cx, topY + h);
  grad.addColorStop(0, "#3a3a40");
  grad.addColorStop(1, "#0d0d0a");
  ctx.fillStyle = grad;
  // Top
  ctx.beginPath();
  ctx.moveTo(cx - topW / 2, topY);
  ctx.lineTo(cx + topW / 2, topY);
  ctx.lineTo(cx + topW / 2 - 6, topY + topH);
  ctx.lineTo(cx - topW / 2 + 6, topY + topH);
  ctx.closePath();
  ctx.fill();
  // Neck
  ctx.beginPath();
  ctx.moveTo(cx - topW / 2 + 6, topY + topH);
  ctx.lineTo(cx + topW / 2 - 6, topY + topH);
  ctx.lineTo(cx + neckW / 2, topY + topH + neckH);
  ctx.lineTo(cx - neckW / 2, topY + topH + neckH);
  ctx.closePath();
  ctx.fill();
  // Base
  ctx.fillRect(cx - baseW / 2, topY + topH + neckH, baseW, baseH);

  // Top edge highlight
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(cx - topW / 2, topY, topW, 2);
}

function drawHammer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  headCy: number,
) {
  const headW = 44;
  const headH = 20;
  const handleW = 8;
  const handleH = 90;
  // Handle (wood) — extends upward from head
  ctx.fillStyle = "#3a2418";
  ctx.fillRect(
    Math.round(cx - handleW / 2),
    Math.round(headCy - handleH),
    handleW,
    handleH,
  );
  ctx.fillStyle = "rgba(255, 220, 170, 0.08)";
  ctx.fillRect(
    Math.round(cx - handleW / 2),
    Math.round(headCy - handleH),
    2,
    handleH,
  );
  // Head (steel)
  const grad = ctx.createLinearGradient(0, headCy, 0, headCy + headH);
  grad.addColorStop(0, "#7a7a82");
  grad.addColorStop(1, "#1a1a1c");
  ctx.fillStyle = grad;
  ctx.fillRect(
    Math.round(cx - headW / 2),
    Math.round(headCy),
    headW,
    headH,
  );
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(Math.round(cx - headW / 2), Math.round(headCy), headW, 2);
}

function drawQuenchBlade(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hotColor: string,
  heatN: number,
  waterY: number,
  soriDeg: number,
) {
  // Reach of the curve in pixels — locked-in once Yakiire computes it.
  const soriPx = Math.min(14, soriDeg * 1.5);
  // Heat halo above water
  if (heatN > 0.2 && y < waterY) {
    ctx.shadowColor = `hsla(${30 - heatN * 18}, 100%, 60%, ${heatN})`;
    ctx.shadowBlur = 14 + heatN * 22;
  }

  ctx.fillStyle = hotColor;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.quadraticCurveTo(x + w + soriPx, y + h / 2, x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.quadraticCurveTo(x + soriPx, y + h / 2, x, y);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Submerged section: paint a darker overlay below the waterline
  const subTop = Math.max(y, waterY);
  if (subTop < y + h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 4, subTop, w + 8, y + h - subTop);
    ctx.clip();
    ctx.fillStyle = "rgba(8, 12, 18, 0.78)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.quadraticCurveTo(x + w + soriPx, y + h / 2, x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.quadraticCurveTo(x + soriPx, y + h / 2, x, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Edge highlight on the air side
  if (y < waterY) {
    ctx.fillStyle = `rgba(255,255,255,${0.06 + heatN * 0.18})`;
    ctx.fillRect(x, y, 2, Math.min(h, waterY - y));
  }
}

function drawTogiScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strokes: number,
  sori: number,
  t: number,
  cursor: { x: number; y: number } | null,
) {
  // Background — dark workshop
  ctx.fillStyle = "#0a0807";
  ctx.fillRect(0, 0, w, h);

  // Warm lamp from upper right
  const lamp = ctx.createRadialGradient(
    Math.round(w * 0.85),
    Math.round(h * 0.15),
    4,
    Math.round(w * 0.85),
    Math.round(h * 0.15),
    Math.round(w * 0.7),
  );
  lamp.addColorStop(0, "rgba(201, 162, 39, 0.18)");
  lamp.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, w, h);

  // Sharpening stone block
  const stoneY = Math.round(h * 0.62);
  const stoneH = Math.round(h * 0.18);
  const stoneX = Math.round(w * 0.12);
  const stoneW = Math.round(w * 0.76);
  const stoneGrad = ctx.createLinearGradient(0, stoneY, 0, stoneY + stoneH);
  stoneGrad.addColorStop(0, "#857669");
  stoneGrad.addColorStop(1, "#3e372f");
  ctx.fillStyle = stoneGrad;
  ctx.fillRect(stoneX, stoneY, stoneW, stoneH);
  // Stone grit lines (deterministic)
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 0.6;
  let s = 13;
  const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    const yy = Math.round(stoneY + (i / 40) * stoneH);
    ctx.moveTo(stoneX, yy);
    ctx.lineTo(stoneX + stoneW, Math.round(yy + (rng() - 0.5) * 3));
    ctx.stroke();
  }
  // Wood holder
  ctx.fillStyle = "#2a1a0e";
  ctx.fillRect(stoneX - 18, stoneY + stoneH, stoneW + 36, 12);

  // Blade — horizontal, tip pointing left, tang on the right
  const bladeY = Math.round(h * 0.34);
  const bladeH = 22;
  const bladeX = Math.round(w * 0.12);
  const bladeW = Math.round(w * 0.7);
  const tangW = Math.round(w * 0.13);
  // Spine (top) curves slightly upward in the middle to suggest sori
  const soriArch = Math.min(8, sori * 0.9);

  // Subtle drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;

  // Blade body path
  ctx.beginPath();
  ctx.moveTo(bladeX, bladeY + bladeH / 2); // tip
  ctx.lineTo(bladeX + 16, bladeY); // top edge near tip
  ctx.quadraticCurveTo(
    bladeX + bladeW / 2,
    bladeY - soriArch,
    bladeX + bladeW,
    bladeY,
  );
  ctx.lineTo(bladeX + bladeW + tangW, bladeY + 4); // tang top
  ctx.lineTo(bladeX + bladeW + tangW, bladeY + bladeH - 4); // tang bottom
  ctx.lineTo(bladeX + bladeW, bladeY + bladeH); // bottom right
  ctx.lineTo(bladeX + 16, bladeY + bladeH); // bottom edge near tip
  ctx.closePath();

  const bladeGrad = ctx.createLinearGradient(0, bladeY, 0, bladeY + bladeH);
  bladeGrad.addColorStop(0, "#cfd2d6");
  bladeGrad.addColorStop(0.45, "#8b9197");
  bladeGrad.addColorStop(1, "#3a3e44");
  ctx.fillStyle = bladeGrad;
  ctx.fill();
  ctx.restore();

  // Tang darker
  ctx.fillStyle = "#241a12";
  ctx.beginPath();
  ctx.moveTo(bladeX + bladeW, bladeY);
  ctx.lineTo(bladeX + bladeW + tangW, bladeY + 4);
  ctx.lineTo(bladeX + bladeW + tangW, bladeY + bladeH - 4);
  ctx.lineTo(bladeX + bladeW, bladeY + bladeH);
  ctx.closePath();
  ctx.fill();
  // Tang pin
  ctx.fillStyle = "#c9a227";
  ctx.beginPath();
  ctx.arc(
    Math.round(bladeX + bladeW + tangW * 0.55),
    Math.round(bladeY + bladeH / 2),
    2,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // ── Hamon — wavy line near the cutting edge, opacity grows w/ strokes ──
  const progress = Math.min(1, strokes / TOGI_TARGET);
  if (progress > 0) {
    const hamonY = bladeY + bladeH * 0.62;
    const segs = 50;
    // Two stacked wavy lines — primary brighter, secondary fainter
    const draw = (alpha: number, lineW: number, yOffset: number) => {
      ctx.strokeStyle = `rgba(248, 240, 215, ${alpha})`;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const xN = i / segs;
        const xx = Math.round(
          bladeX + 16 + xN * (bladeW + tangW * 0.3 - 16),
        );
        const wave =
          Math.sin(xN * Math.PI * 5 + i * 0.4) * 2.4 +
          Math.sin(xN * Math.PI * 13 + 0.7) * 1.4 +
          Math.sin(xN * Math.PI * 21) * 0.7;
        const yy = Math.round(hamonY + wave + yOffset);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    };
    draw(0.45 + progress * 0.4, 1.4, 0);
    draw(0.18 + progress * 0.25, 0.7, 3.2);
    // A wash of mist along the hamon for depth
    ctx.save();
    ctx.beginPath();
    ctx.rect(bladeX + 14, bladeY + 2, bladeW, bladeH - 4);
    ctx.clip();
    const haze = ctx.createLinearGradient(0, hamonY - 6, 0, hamonY + 8);
    haze.addColorStop(0, "rgba(255, 255, 245, 0)");
    haze.addColorStop(0.5, `rgba(255, 255, 245, ${progress * 0.18})`);
    haze.addColorStop(1, "rgba(255, 255, 245, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(bladeX + 14, hamonY - 8, bladeW, 16);
    ctx.restore();
  }

  // ── Cutting edge highlight ──
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + progress * 0.7})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bladeX, bladeY + bladeH / 2);
  ctx.lineTo(bladeX + 16, bladeY + bladeH);
  ctx.lineTo(bladeX + bladeW, bladeY + bladeH);
  ctx.stroke();

  // ── Cursor highlight on stone (like a polishing puff) ──
  if (cursor && cursor.y > stoneY - 30 && cursor.y < stoneY + stoneH + 12) {
    const cx = Math.round(Math.max(stoneX + 12, Math.min(stoneX + stoneW - 12, cursor.x)));
    const cy = Math.round(stoneY + stoneH * 0.5);
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 28);
    grad.addColorStop(0, "rgba(255, 250, 240, 0.45)");
    grad.addColorStop(1, "rgba(255, 250, 240, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fill();
    // Faint trail strokes
    ctx.strokeStyle = "rgba(255, 250, 240, 0.18)";
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy + i * 2);
      ctx.lineTo(cx + 22, cy + i * 2 + Math.sin(t * 8 + i) * 0.5);
      ctx.stroke();
    }
  }

  // ── Subtle vignette to lift the blade off the page ──
  const vig = ctx.createRadialGradient(
    Math.round(w * 0.5),
    Math.round(h * 0.5),
    Math.round(w * 0.3),
    Math.round(w * 0.5),
    Math.round(h * 0.5),
    Math.round(w * 0.7),
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}
