"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Check,
  Sparkles,
  Music,
  Drum,
  Users,
} from "lucide-react";
import {
  playBoom,
  playChime,
  playClick,
  playMetalRing,
  playThud,
  playWhistle,
  useMutedRef,
} from "@/lib/craftAudio";

// ─────────────────────────────────────────────────────────────────────
// 阿波踊り — 4-step rhythm experience.
//
// 1. Hayashi (囃子) — listen to the 5-instrument ensemble loop.
// 2. Taiko    (太鼓) — strike the great drum on beat. PERFECT/GOOD/MISS.
// 3. Odori    (踊り) — pick 男 or 女, advance through poses on the beat.
// 4. Ren      (連)   — five dancers move together for the closing tableau.
// ─────────────────────────────────────────────────────────────────────

type Gender = "male" | "female";

const STEP_NAMES = ["囃子", "太鼓", "踊り", "連"] as const;
const TOTAL_STEPS = 4;
const TAIKO_BEATS = 10;
const TAIKO_BPM = 132;
const BEAT_MS = (60 / TAIKO_BPM) * 1000;
const ODORI_TAPS = 8;
const REN_DANCERS = 5;
const REN_DURATION_MS = 4500;

// ─────────────────────────────────────────────────────────────────────
// Parent stage — owns step index + cross-step state, defers rendering
// to one of four sub-components.
// ─────────────────────────────────────────────────────────────────────

export function AwaOdoriStage({
  onComplete,
  palette: _palette,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const mutedRef = useMutedRef();
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState<Gender | null>(null);
  const [taikoStats, setTaikoStats] = useState({
    perfect: 0,
    good: 0,
    miss: 0,
  });

  const finalizingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleFinish = useCallback(
    (dataUrl: string) => {
      if (finalizingRef.current) return;
      finalizingRef.current = true;
      playChime({ mutedRef, freq: 660 });
      onComplete(dataUrl);
    },
    [onComplete, mutedRef],
  );

  return (
    <div className="flex w-full flex-col items-center gap-5 text-washi-50">
      <StepIndicator step={step} />

      {step === 0 && (
        <HayashiStep
          mutedRef={mutedRef}
          onAdvance={() => setStep(1)}
        />
      )}
      {step === 1 && (
        <TaikoStep
          mutedRef={mutedRef}
          onBack={() => setStep(0)}
          onAdvance={(stats) => {
            setTaikoStats(stats);
            setStep(2);
          }}
        />
      )}
      {step === 2 && (
        <OdoriStep
          mutedRef={mutedRef}
          gender={gender}
          onPickGender={setGender}
          onBack={() => setStep(1)}
          onAdvance={() => setStep(3)}
        />
      )}
      {step === 3 && gender && (
        <RenStep
          mutedRef={mutedRef}
          gender={gender}
          taikoStats={taikoStats}
          onBack={() => setStep(2)}
          onFinish={handleFinish}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step indicator + recipe badge
// ─────────────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  return (
    <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/80">
      <Sparkles size={14} />
      Step {step + 1} / {TOTAL_STEPS} ·{" "}
      <span className="font-jp tracking-[0.2em]">{STEP_NAMES[step]}</span>
    </p>
  );
}

function RecipeBadge({
  gender,
  dancers,
}: {
  gender: Gender | null;
  dancers: number;
}) {
  const label =
    gender === "male" ? "男踊り" : gender === "female" ? "女踊り" : "踊り";
  return (
    <div className="rounded-full border border-amber-300/40 bg-black/40 px-4 py-1.5 text-[0.55rem] uppercase tracking-[0.4em] text-amber-200/85 backdrop-blur">
      <span className="font-jp tracking-[0.2em]">
        阿波踊り · {label} · 連 {dancers}人 · ヨイヨイ
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — Hayashi (囃子)
// Five instruments take turns on a 2-beat loop. User taps to advance.
// ─────────────────────────────────────────────────────────────────────

interface InstrumentSpec {
  id: string;
  jp: string;
  romaji: string;
  hint: string;
  play: (mutedRef: ReturnType<typeof useMutedRef>) => void;
}

const INSTRUMENTS: InstrumentSpec[] = [
  {
    id: "shamisen",
    jp: "三味線",
    romaji: "shamisen",
    hint: "2拍子の旋律",
    play: (m) => playClick({ mutedRef: m, freq: 440, duration: 0.12 }),
  },
  {
    id: "odaiko",
    jp: "大太鼓",
    romaji: "ōdaiko",
    hint: "腹に響く低音",
    play: (m) =>
      playThud({ mutedRef: m, freqStart: 180, freqEnd: 80, duration: 0.32 }),
  },
  {
    id: "shimedaiko",
    jp: "締太鼓",
    romaji: "shime-daiko",
    hint: "粒立つ高音",
    play: (m) =>
      playThud({ mutedRef: m, freqStart: 360, freqEnd: 220, duration: 0.14 }),
  },
  {
    id: "kane",
    jp: "鉦",
    romaji: "kane",
    hint: "チンチキの金属音",
    play: (m) => playMetalRing({ mutedRef: m, freq: 1320, duration: 0.22 }),
  },
  {
    id: "fue",
    jp: "笛",
    romaji: "fue",
    hint: "高く伸びる旋律",
    play: (m) =>
      playWhistle({
        mutedRef: m,
        startFreq: 880,
        endFreq: 1180,
        duration: 0.45,
      }),
  },
];

function HayashiStep({
  mutedRef,
  onAdvance,
}: {
  mutedRef: ReturnType<typeof useMutedRef>;
  onAdvance: () => void;
}) {
  const [activeIdx, setActiveIdx] = useState(-1);
  const [beat, setBeat] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    // Loop the ensemble on a 2-beat groove. Each tick rotates to the
    // next instrument and pulses its silhouette while playing the synth.
    intervalRef.current = setInterval(() => {
      const i = idxRef.current % INSTRUMENTS.length;
      setActiveIdx(i);
      INSTRUMENTS[i].play(mutedRef);
      setBeat((b) => (b + 1) % 8);
      idxRef.current += 1;
    }, 380);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [mutedRef]);

  return (
    <>
      <div className="relative flex h-[min(56vh,28rem)] w-[min(92vw,42rem)] flex-col items-center justify-center overflow-hidden rounded-sm border border-washi-50/10 bg-gradient-to-b from-[#1a0f0a] via-[#0e0604] to-[#080302] shadow-2xl shadow-black/60">
        {/* Lantern halos */}
        <LanternBackdrop />

        {/* Instrument row */}
        <div className="relative z-10 flex items-end justify-center gap-3 pb-6 pt-2 sm:gap-6">
          {INSTRUMENTS.map((inst, i) => (
            <InstrumentTile
              key={inst.id}
              instrument={inst}
              active={i === activeIdx}
            />
          ))}
        </div>

        {/* Beat dots */}
        <div className="relative z-10 mb-2 flex items-center gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-150 ${
                i === beat ? "bg-amber-300" : "bg-washi-50/20"
              }`}
            />
          ))}
        </div>

        <p className="relative z-10 px-6 pb-4 text-center font-jp text-[0.7rem] leading-relaxed text-washi-50/70">
          ぞめき囃子は2拍子。三味・太鼓・鉦・笛が400年続けてきたグルーヴ。
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          playClick({ mutedRef, freq: 700 });
          onAdvance();
        }}
        className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100"
      >
        <Music size={12} /> 太鼓へ
      </button>
    </>
  );
}

function InstrumentTile({
  instrument,
  active,
}: {
  instrument: InstrumentSpec;
  active: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`grid h-16 w-16 place-items-center rounded-full border transition-all duration-200 sm:h-20 sm:w-20 ${
          active
            ? "scale-110 border-amber-300/80 bg-amber-300/15 shadow-[0_0_24px_rgba(201,162,39,0.5)]"
            : "border-washi-50/15 bg-black/30"
        }`}
      >
        <InstrumentGlyph id={instrument.id} active={active} />
      </div>
      <p
        className={`font-jp text-[0.65rem] tracking-[0.15em] transition-colors ${
          active ? "text-amber-200" : "text-washi-50/55"
        }`}
      >
        {instrument.jp}
      </p>
      <p className="text-[0.5rem] uppercase tracking-[0.3em] text-washi-50/35">
        {instrument.romaji}
      </p>
    </div>
  );
}

// Stylised silhouettes of each ensemble instrument. All path commands
// use integer literals so SSR/CSR markup matches verbatim.
function InstrumentGlyph({ id, active }: { id: string; active: boolean }) {
  const stroke = active ? "#f5e6b3" : "#a89b78";
  const fill = active ? "rgba(245,230,179,0.22)" : "rgba(168,155,120,0.1)";
  switch (id) {
    case "shamisen":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9">
          <rect
            x={6}
            y={22}
            width={14}
            height={14}
            rx={2}
            stroke={stroke}
            strokeWidth={1.4}
            fill={fill}
          />
          <line
            x1={20}
            y1={28}
            x2={36}
            y2={6}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <circle cx={36} cy={6} r={1.6} fill={stroke} />
          <line
            x1={10}
            y1={26}
            x2={20}
            y2={36}
            stroke={stroke}
            strokeWidth={0.6}
            opacity={0.6}
          />
        </svg>
      );
    case "odaiko":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9">
          <ellipse
            cx={20}
            cy={20}
            rx={13}
            ry={11}
            stroke={stroke}
            strokeWidth={1.4}
            fill={fill}
          />
          <ellipse
            cx={20}
            cy={20}
            rx={13}
            ry={3}
            stroke={stroke}
            strokeWidth={1}
            fill="none"
            opacity={0.6}
          />
          <circle
            cx={20}
            cy={20}
            r={2}
            fill={stroke}
            opacity={active ? 0.9 : 0.4}
          />
        </svg>
      );
    case "shimedaiko":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9">
          <ellipse
            cx={20}
            cy={20}
            rx={9}
            ry={7}
            stroke={stroke}
            strokeWidth={1.3}
            fill={fill}
          />
          <line
            x1={11}
            y1={20}
            x2={29}
            y2={20}
            stroke={stroke}
            strokeWidth={0.6}
            opacity={0.6}
          />
        </svg>
      );
    case "kane":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9">
          <path
            d="M10 14 L30 14 L26 28 L14 28 Z"
            stroke={stroke}
            strokeWidth={1.4}
            fill={fill}
          />
          <line
            x1={20}
            y1={6}
            x2={20}
            y2={14}
            stroke={stroke}
            strokeWidth={1}
          />
          <circle cx={20} cy={5} r={1.4} fill={stroke} />
        </svg>
      );
    case "fue":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9">
          <rect
            x={4}
            y={18}
            width={32}
            height={4}
            rx={2}
            stroke={stroke}
            strokeWidth={1.3}
            fill={fill}
          />
          {[12, 18, 24, 30].map((cx) => (
            <circle
              key={cx}
              cx={cx}
              cy={20}
              r={1}
              fill={stroke}
              opacity={0.7}
            />
          ))}
        </svg>
      );
    default:
      return null;
  }
}

// Soft red lanterns floating behind every step's stage. Positions are
// fixed integers — deterministic across renders.
function LanternBackdrop() {
  const lanterns: Array<{ x: number; y: number; r: number; o: number }> = [
    { x: 8, y: 14, r: 26, o: 0.35 },
    { x: 28, y: 8, r: 18, o: 0.25 },
    { x: 60, y: 18, r: 22, o: 0.3 },
    { x: 80, y: 10, r: 16, o: 0.2 },
    { x: 92, y: 28, r: 24, o: 0.28 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0">
      {lanterns.map((l, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${l.x}%`,
            top: `${l.y}%`,
            width: `${l.r * 2}px`,
            height: `${l.r * 2}px`,
            background: `radial-gradient(circle, rgba(192,61,43,${l.o}) 0%, rgba(192,61,43,0) 70%)`,
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — Taiko (太鼓)
// Beats arrive on a steady BPM. Tap when the shrinking ring matches
// the target. ±100ms = PERFECT, ±200ms = GOOD, else MISS.
// ─────────────────────────────────────────────────────────────────────

interface BeatTime {
  index: number;
  scheduled: number;
}

type Hit = "perfect" | "good" | "miss";

function TaikoStep({
  mutedRef,
  onBack,
  onAdvance,
}: {
  mutedRef: ReturnType<typeof useMutedRef>;
  onBack: () => void;
  onAdvance: (stats: { perfect: number; good: number; miss: number }) => void;
}) {
  const [stats, setStats] = useState({ perfect: 0, good: 0, miss: 0 });
  const [hits, setHits] = useState<Hit[]>([]);
  const [lastJudgement, setLastJudgement] = useState<Hit | null>(null);
  const [progress, setProgress] = useState(0); // 0..1 toward the next beat
  const [done, setDone] = useState(false);
  const [ripples, setRipples] = useState<
    Array<{ id: number; tone: Hit }>
  >([]);

  const beatsRef = useRef<BeatTime[]>([]);
  const nextBeatRef = useRef(0);
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);
  const rippleIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Schedule beats relative to a fixed start, then drive a rAF loop
    // that auto-marks any beat whose window has fully elapsed as a miss.
    const start = performance.now() + 1100;
    startedAtRef.current = start;
    beatsRef.current = Array.from({ length: TAIKO_BEATS }, (_, i) => ({
      index: i,
      scheduled: start + i * BEAT_MS,
    }));

    const loop = () => {
      const now = performance.now();
      const next = beatsRef.current[nextBeatRef.current];
      if (next) {
        const dt = now - next.scheduled;
        if (dt > 200) {
          // Window closed without a tap — record miss and advance.
          recordHit("miss");
          nextBeatRef.current += 1;
        } else {
          // Map the remaining time to a 0..1 fill so the ring shrinks
          // cleanly into the target on the beat.
          const fill = Math.max(
            0,
            Math.min(1, 1 - (next.scheduled - now) / BEAT_MS),
          );
          setProgress(fill);
        }
      } else if (!done) {
        setDone(true);
      }
      if (!done && mountedRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordHit = useCallback((tone: Hit) => {
    setStats((s) => ({
      perfect: s.perfect + (tone === "perfect" ? 1 : 0),
      good: s.good + (tone === "good" ? 1 : 0),
      miss: s.miss + (tone === "miss" ? 1 : 0),
    }));
    setHits((h) => [...h, tone]);
    setLastJudgement(tone);
    if (tone !== "miss") {
      const id = rippleIdRef.current++;
      setRipples((r) => [...r, { id, tone }]);
      setTimeout(() => {
        setRipples((r) => r.filter((x) => x.id !== id));
      }, 600);
    }
  }, []);

  const onTap = (e: React.PointerEvent) => {
    if (done) return;
    const next = beatsRef.current[nextBeatRef.current];
    if (!next) return;
    const now = performance.now();
    const diff = Math.abs(now - next.scheduled);
    let tone: Hit;
    if (diff <= 100) tone = "perfect";
    else if (diff <= 200) tone = "good";
    else if (now < next.scheduled - 200) {
      // Premature tap — treat as a missed swing (no advance).
      tone = "miss";
      // Still register a ripple so the user gets feedback.
      const id = rippleIdRef.current++;
      setRipples((r) => [...r, { id, tone: "miss" }]);
      setLastJudgement("miss");
      setStats((s) => ({ ...s, miss: s.miss + 1 }));
      setHits((h) => [...h, "miss"]);
      setTimeout(() => {
        setRipples((r) => r.filter((x) => x.id !== id));
      }, 600);
      playBoom({ mutedRef, freq: 90, duration: 0.25 });
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    } else {
      tone = "miss";
    }
    if (tone !== "miss") {
      recordHit(tone);
      nextBeatRef.current += 1;
    } else {
      recordHit(tone);
      nextBeatRef.current += 1;
    }
    playBoom({
      mutedRef,
      freq: tone === "perfect" ? 60 : tone === "good" ? 70 : 95,
      duration: 0.5,
    });
  };

  return (
    <>
      <div
        onPointerDown={onTap}
        className="relative flex h-[min(56vh,28rem)] w-[min(92vw,42rem)] cursor-pointer touch-none select-none flex-col items-center justify-center overflow-hidden rounded-sm border border-washi-50/10 bg-gradient-to-b from-[#1a0f0a] via-[#0e0604] to-[#080302] shadow-2xl shadow-black/60"
      >
        <LanternBackdrop />

        {/* Drum + ring */}
        <div className="relative z-10 flex h-56 w-56 items-center justify-center">
          {/* Drum body */}
          <svg viewBox="0 0 200 200" className="absolute inset-0">
            <ellipse
              cx={100}
              cy={100}
              rx={86}
              ry={70}
              fill="#1a0a08"
              stroke="#7a3018"
              strokeWidth={3}
            />
            <ellipse
              cx={100}
              cy={100}
              rx={86}
              ry={14}
              fill="none"
              stroke="#c03d2b"
              strokeWidth={1.5}
              opacity={0.5}
            />
            <circle
              cx={100}
              cy={100}
              r={3}
              fill="#c9a227"
              opacity={lastJudgement === "perfect" ? 1 : 0.4}
            />
          </svg>

          {/* Approach ring — shrinks to match center on the beat */}
          {!done && (
            <svg viewBox="0 0 200 200" className="absolute inset-0">
              <circle
                cx={100}
                cy={100}
                r={Math.round(20 + (1 - progress) * 60)}
                fill="none"
                stroke="#f5e6b3"
                strokeWidth={2}
                opacity={0.65}
              />
            </svg>
          )}

          {/* Hit ripples */}
          {ripples.map((r) => (
            <span
              key={r.id}
              className="pointer-events-none absolute inset-0 rounded-full border-2"
              style={{
                borderColor:
                  r.tone === "perfect"
                    ? "#f5e6b3"
                    : r.tone === "good"
                      ? "#c9a227"
                      : "#c03d2b",
                animation: "awa-ripple 0.6s ease-out forwards",
              }}
            />
          ))}
        </div>

        {/* Judgement readout */}
        {lastJudgement && (
          <p
            className={`relative z-10 mt-4 text-sm font-bold uppercase tracking-[0.4em] ${
              lastJudgement === "perfect"
                ? "text-amber-200"
                : lastJudgement === "good"
                  ? "text-amber-400/80"
                  : "text-rose-400/80"
            }`}
          >
            {lastJudgement}
          </p>
        )}

        {/* Hit history bar */}
        <div className="relative z-10 mt-3 flex items-center gap-1.5">
          {Array.from({ length: TAIKO_BEATS }).map((_, i) => {
            const tone = hits[i];
            return (
              <span
                key={i}
                className={`h-1.5 w-4 rounded-full transition-colors ${
                  tone === "perfect"
                    ? "bg-amber-200"
                    : tone === "good"
                      ? "bg-amber-400/70"
                      : tone === "miss"
                        ? "bg-rose-400/60"
                        : "bg-washi-50/15"
                }`}
              />
            );
          })}
        </div>

        <p className="relative z-10 mt-3 px-6 text-center font-jp text-[0.7rem] leading-relaxed text-washi-50/70">
          太鼓のリズムが連を引っ張る。一拍一拍に魂を入れる。
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            playClick({ mutedRef, freq: 500 });
            onBack();
          }}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
        <button
          type="button"
          onClick={() => {
            playClick({ mutedRef, freq: 700 });
            onAdvance(stats);
          }}
          disabled={!done}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Drum size={12} /> 踊りへ ({stats.perfect}P · {stats.good}G ·{" "}
          {stats.miss}M)
        </button>
      </div>

      <style jsx>{`
        @keyframes awa-ripple {
          0% {
            transform: scale(0.8);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3 — Odori (踊り)
// Pick male/female; then tap to advance through 4 cycling poses
// (8 taps total). Silhouettes are SVGs — a separate pose for each step.
// ─────────────────────────────────────────────────────────────────────

function OdoriStep({
  mutedRef,
  gender,
  onPickGender,
  onBack,
  onAdvance,
}: {
  mutedRef: ReturnType<typeof useMutedRef>;
  gender: Gender | null;
  onPickGender: (g: Gender) => void;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const [taps, setTaps] = useState(0);
  const [beat, setBeat] = useState(0);

  // Pulse the beat indicator at the same BPM as Step 2 so muscle
  // memory carries over.
  useEffect(() => {
    const id = setInterval(() => {
      setBeat((b) => (b + 1) % 4);
    }, BEAT_MS);
    return () => clearInterval(id);
  }, []);

  const poseIdx = taps % 4;
  const done = taps >= ODORI_TAPS;

  const onTap = () => {
    if (!gender || done) return;
    setTaps((t) => t + 1);
    playClick({ mutedRef, freq: 800, duration: 0.08 });
  };

  return (
    <>
      <div className="relative flex h-[min(56vh,28rem)] w-[min(92vw,42rem)] flex-col items-center justify-center overflow-hidden rounded-sm border border-washi-50/10 bg-gradient-to-b from-[#1a0f0a] via-[#0e0604] to-[#080302] shadow-2xl shadow-black/60">
        <LanternBackdrop />

        {!gender ? (
          <div className="relative z-10 flex flex-col items-center gap-4">
            <p className="font-jp text-sm tracking-[0.2em] text-washi-50/85">
              踊りを選ぶ
            </p>
            <div className="flex gap-3">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    playClick({ mutedRef, freq: 660 });
                    onPickGender(g);
                  }}
                  className="flex w-32 flex-col items-center gap-2 rounded-md border border-washi-50/20 bg-black/40 px-4 py-5 transition hover:border-amber-300/60 hover:bg-amber-300/10"
                >
                  <DancerSilhouette gender={g} pose={0} size={64} />
                  <span className="font-jp text-sm tracking-[0.15em] text-amber-200/85">
                    {g === "male" ? "男踊り" : "女踊り"}
                  </span>
                  <span className="text-[0.55rem] uppercase tracking-[0.3em] text-washi-50/55">
                    {g === "male" ? "otoko" : "onna"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="relative z-10 flex flex-1 cursor-pointer touch-none select-none flex-col items-center justify-center"
            onPointerDown={onTap}
            style={{ width: "100%" }}
          >
            <DancerSilhouette
              gender={gender}
              pose={poseIdx}
              size={180}
              glow={beat === 0}
            />
            {/* Beat dots */}
            <div className="mt-4 flex items-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === beat ? "bg-amber-300" : "bg-washi-50/20"
                  }`}
                />
              ))}
            </div>
            {/* Tap progress */}
            <div className="mt-3 flex items-center gap-1">
              {Array.from({ length: ODORI_TAPS }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1 w-3 rounded-full ${
                    i < taps ? "bg-amber-300" : "bg-washi-50/15"
                  }`}
                />
              ))}
            </div>
            <p className="mt-3 px-8 text-center font-jp text-[0.7rem] leading-relaxed text-washi-50/70">
              {gender === "male"
                ? "男踊りは力強く、腰の落とし方で「連」の格が決まる。"
                : "女踊りは優美に、爪先と編み笠で揃えるのが鍵。"}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            playClick({ mutedRef, freq: 500 });
            onBack();
          }}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
        <button
          type="button"
          onClick={() => {
            playClick({ mutedRef, freq: 700 });
            onAdvance();
          }}
          disabled={!done}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Users size={12} /> 連へ
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Dancer silhouette — 4 poses per gender, drawn as SVG paths so we
// can scale into both the picker and the canvas-driven Ren scene.
// ─────────────────────────────────────────────────────────────────────

function DancerSilhouette({
  gender,
  pose,
  size,
  glow = false,
}: {
  gender: Gender;
  pose: number;
  size: number;
  glow?: boolean;
}) {
  // Each pose = head/body/limbs offsets. Integer literals keep markup
  // identical between SSR and CSR.
  const accent = gender === "male" ? "#c03d2b" : "#c9a227";
  const stroke = glow ? "#f5e6b3" : "#d8cfaa";
  return (
    <svg
      viewBox="0 0 100 200"
      width={size}
      height={Math.round(size * 2)}
      style={{
        filter: glow
          ? "drop-shadow(0 0 12px rgba(245,230,179,0.6))"
          : undefined,
      }}
    >
      {gender === "male" ? (
        <MalePose pose={pose} stroke={stroke} accent={accent} />
      ) : (
        <FemalePose pose={pose} stroke={stroke} accent={accent} />
      )}
    </svg>
  );
}

function MalePose({
  pose,
  stroke,
  accent,
}: {
  pose: number;
  stroke: string;
  accent: string;
}) {
  // Common head / hachimaki
  const head = (
    <>
      <circle cx={50} cy={28} r={10} fill={stroke} />
      <rect x={38} y={24} width={24} height={4} fill={accent} />
    </>
  );
  // Each pose draws torso + arms + legs slightly differently. Coordinates
  // are integer literals — easy to read and SSR-stable.
  switch (pose) {
    case 0: // 腰落とし — low squat
      return (
        <>
          {head}
          <path
            d="M40 40 L60 40 L62 78 L38 78 Z"
            fill={accent}
            opacity={0.85}
          />
          <line x1={40} y1={50} x2={26} y2={70} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={60} y1={50} x2={74} y2={70} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={42} y1={78} x2={28} y2={120} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={58} y1={78} x2={72} y2={120} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={28} y1={120} x2={20} y2={150} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={72} y1={120} x2={80} y2={150} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
        </>
      );
    case 1: // 手上げ — one arm raised
      return (
        <>
          {head}
          <path
            d="M40 40 L60 40 L62 84 L38 84 Z"
            fill={accent}
            opacity={0.85}
          />
          <line x1={60} y1={48} x2={84} y2={14} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={40} y1={48} x2={28} y2={78} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={42} y1={84} x2={36} y2={132} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={58} y1={84} x2={64} y2={132} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={36} y1={132} x2={28} y2={158} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={64} y1={132} x2={72} y2={158} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
        </>
      );
    case 2: // 半身 — twisted half-body
      return (
        <>
          {head}
          <path
            d="M44 40 L62 42 L58 86 L40 84 Z"
            fill={accent}
            opacity={0.85}
          />
          <line x1={62} y1={50} x2={86} y2={56} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={44} y1={52} x2={32} y2={86} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={46} y1={86} x2={42} y2={130} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={58} y1={86} x2={66} y2={130} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={42} y1={130} x2={36} y2={158} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={66} y1={130} x2={74} y2={158} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
        </>
      );
    default: // 戻る — neutral
      return (
        <>
          {head}
          <path
            d="M40 40 L60 40 L60 88 L40 88 Z"
            fill={accent}
            opacity={0.85}
          />
          <line x1={40} y1={48} x2={28} y2={86} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={60} y1={48} x2={72} y2={86} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={42} y1={88} x2={42} y2={140} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={58} y1={88} x2={58} y2={140} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={42} y1={140} x2={38} y2={166} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
          <line x1={58} y1={140} x2={62} y2={166} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
        </>
      );
  }
}

function FemalePose({
  pose,
  stroke,
  accent,
}: {
  pose: number;
  stroke: string;
  accent: string;
}) {
  // 編み笠 — wide woven hat that defines the female silhouette.
  const hat = (tilt: number) => (
    <>
      <ellipse
        cx={50}
        cy={Math.round(20 - tilt)}
        rx={26}
        ry={6}
        fill={accent}
        opacity={0.9}
      />
      <ellipse cx={50} cy={28} rx={8} ry={9} fill={stroke} />
    </>
  );
  switch (pose) {
    case 0: // 爪先立ち — on toes, slim profile
      return (
        <>
          {hat(0)}
          <path
            d="M44 40 L56 40 L57 92 L43 92 Z"
            fill={accent}
            opacity={0.85}
          />
          <line x1={44} y1={48} x2={36} y2={86} stroke={stroke} strokeWidth={5} strokeLinecap="round" />
          <line x1={56} y1={48} x2={64} y2={86} stroke={stroke} strokeWidth={5} strokeLinecap="round" />
          <line x1={45} y1={92} x2={45} y2={150} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={55} y1={92} x2={55} y2={150} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={45} y1={150} x2={45} y2={170} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={55} y1={150} x2={55} y2={170} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
        </>
      );
    case 1: // 編み笠を傾ける — tilted hat
      return (
        <>
          {hat(2)}
          <path
            d="M44 40 L58 38 L58 92 L42 90 Z"
            fill={accent}
            opacity={0.85}
          />
          <line x1={44} y1={48} x2={28} y2={70} stroke={stroke} strokeWidth={5} strokeLinecap="round" />
          <line x1={58} y1={48} x2={70} y2={84} stroke={stroke} strokeWidth={5} strokeLinecap="round" />
          <line x1={44} y1={92} x2={42} y2={148} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={56} y1={92} x2={58} y2={148} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={42} y1={148} x2={40} y2={168} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={58} y1={148} x2={60} y2={168} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
        </>
      );
    case 2: // 両手広げ — arms wide
      return (
        <>
          {hat(0)}
          <path
            d="M44 40 L56 40 L56 92 L44 92 Z"
            fill={accent}
            opacity={0.85}
          />
          <line x1={44} y1={48} x2={20} y2={42} stroke={stroke} strokeWidth={5} strokeLinecap="round" />
          <line x1={56} y1={48} x2={80} y2={42} stroke={stroke} strokeWidth={5} strokeLinecap="round" />
          <line x1={20} y1={42} x2={12} y2={56} stroke={stroke} strokeWidth={5} strokeLinecap="round" />
          <line x1={80} y1={42} x2={88} y2={56} stroke={stroke} strokeWidth={5} strokeLinecap="round" />
          <line x1={45} y1={92} x2={45} y2={150} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={55} y1={92} x2={55} y2={150} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={45} y1={150} x2={42} y2={170} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={55} y1={150} x2={58} y2={170} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
        </>
      );
    default: // 戻る — neutral
      return (
        <>
          {hat(0)}
          <path
            d="M44 40 L56 40 L56 92 L44 92 Z"
            fill={accent}
            opacity={0.85}
          />
          <line x1={44} y1={48} x2={34} y2={84} stroke={stroke} strokeWidth={5} strokeLinecap="round" />
          <line x1={56} y1={48} x2={66} y2={84} stroke={stroke} strokeWidth={5} strokeLinecap="round" />
          <line x1={45} y1={92} x2={45} y2={150} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={55} y1={92} x2={55} y2={150} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={45} y1={150} x2={45} y2={168} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <line x1={55} y1={150} x2={55} y2={168} stroke={stroke} strokeWidth={6} strokeLinecap="round" />
        </>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Step 4 — Ren (連)
// 5 dancers move synchronously over a lantern-lit street. Canvas-based
// so we can capture a freeze-frame data URL for the ending.
// ─────────────────────────────────────────────────────────────────────

function RenStep({
  mutedRef,
  gender,
  taikoStats,
  onBack,
  onFinish,
}: {
  mutedRef: ReturnType<typeof useMutedRef>;
  gender: Gender;
  taikoStats: { perfect: number; good: number; miss: number };
  onBack: () => void;
  onFinish: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const finalizedRef = useRef(false);
  const mountedRef = useRef(true);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
  }, []);

  const startRen = useCallback(() => {
    if (running || frozen) return;
    setRunning(true);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const start = performance.now();

    // Schedule the synchronised ensemble. Drum on every beat, kane on
    // off-beats, fue and shamisen lower density. Cancel on unmount.
    const beats = Math.ceil(REN_DURATION_MS / BEAT_MS);
    for (let b = 0; b < beats; b++) {
      const at = b * BEAT_MS;
      timersRef.current.push(
        setTimeout(() => {
          if (!mountedRef.current) return;
          playBoom({ mutedRef, freq: 60, duration: 0.45 });
        }, at),
      );
      timersRef.current.push(
        setTimeout(() => {
          if (!mountedRef.current) return;
          playMetalRing({ mutedRef, freq: 1320, duration: 0.18 });
        }, at + Math.round(BEAT_MS / 2)),
      );
      if (b % 2 === 0) {
        timersRef.current.push(
          setTimeout(() => {
            if (!mountedRef.current) return;
            playClick({ mutedRef, freq: 440, duration: 0.12 });
          }, at + Math.round(BEAT_MS / 4)),
        );
      }
      if (b % 4 === 0) {
        timersRef.current.push(
          setTimeout(() => {
            if (!mountedRef.current) return;
            playWhistle({
              mutedRef,
              startFreq: 880,
              endFreq: 1180,
              duration: 0.4,
            });
          }, at + Math.round(BEAT_MS / 3)),
        );
      }
    }

    let raf = 0;
    const loop = () => {
      if (!mountedRef.current) return;
      const t = performance.now() - start;
      drawRen(ctx, canvas.clientWidth, canvas.clientHeight, t, gender);
      if (t < REN_DURATION_MS) {
        raf = requestAnimationFrame(loop);
      } else {
        // Freeze on the final pose so the captured PNG is a clean
        // tableau, not a mid-step blur.
        drawRen(
          ctx,
          canvas.clientWidth,
          canvas.clientHeight,
          REN_DURATION_MS,
          gender,
        );
        setRunning(false);
        setFrozen(true);
        if (!finalizedRef.current) {
          finalizedRef.current = true;
          const url = canvas.toDataURL("image/png");
          // Defer onFinish a tick so the final draw lands on screen
          // before we navigate.
          timersRef.current.push(
            setTimeout(() => {
              if (mountedRef.current) onFinish(url);
            }, 600),
          );
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [gender, mutedRef, onFinish, running, frozen]);

  // Auto-start once the canvas is ready (give layout one tick).
  useEffect(() => {
    const id = setTimeout(() => {
      if (mountedRef.current && !running && !frozen) startRen();
    }, 160);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="relative h-[min(56vh,28rem)] w-[min(92vw,42rem)] overflow-hidden rounded-sm border border-washi-50/10 shadow-2xl shadow-black/60">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {frozen && (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
            <RecipeBadge gender={gender} dancers={REN_DANCERS} />
          </div>
        )}
        {!frozen && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 px-6 text-center font-jp text-[0.7rem] leading-relaxed text-washi-50/75">
            連で揃って踊る。阿波踊りは観客と踊り手が一体になる祭。
          </p>
        )}
      </div>

      <div className="text-[0.55rem] uppercase tracking-[0.4em] text-washi-50/55">
        {taikoStats.perfect}P · {taikoStats.good}G · {taikoStats.miss}M
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            playClick({ mutedRef, freq: 500 });
            onBack();
          }}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10"
        >
          <ArrowLeft size={12} /> 前へ戻る
        </button>
        <button
          type="button"
          disabled={!frozen}
          onClick={() => {
            const c = canvasRef.current;
            if (!c) return;
            onFinish(c.toDataURL("image/png"));
          }}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> 完成
        </button>
      </div>
    </>
  );
}

// Draws the ren (group) of dancers at time `t` ms into the loop.
// Pure canvas — no DOM, so it composites cleanly into the captured PNG.
function drawRen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  gender: Gender,
) {
  // Sky gradient (lantern-warmed night)
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0a0604");
  sky.addColorStop(0.55, "#1c0a06");
  sky.addColorStop(1, "#2a120a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Subtle motion-blur to soften prior frames
  ctx.fillStyle = "rgba(10,6,4,0.18)";
  ctx.fillRect(0, 0, w, h);

  // Lanterns (chōchin)
  const lanterns = [
    { x: 0.1, y: 0.18, r: 14 },
    { x: 0.28, y: 0.12, r: 11 },
    { x: 0.5, y: 0.16, r: 16 },
    { x: 0.72, y: 0.1, r: 12 },
    { x: 0.9, y: 0.2, r: 14 },
  ];
  for (const l of lanterns) {
    const cx = Math.round(l.x * w);
    const cy = Math.round(l.y * h);
    // Halo
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, l.r * 4);
    halo.addColorStop(0, "rgba(245,180,120,0.35)");
    halo.addColorStop(1, "rgba(245,180,120,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, l.r * 4, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = "#c03d2b";
    ctx.beginPath();
    ctx.ellipse(cx, cy, l.r, Math.round(l.r * 1.2), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      const yy = cy + Math.round((k * l.r) / 3);
      ctx.beginPath();
      ctx.moveTo(cx - l.r + 1, yy);
      ctx.lineTo(cx + l.r - 1, yy);
      ctx.stroke();
    }
    // Hanging cord
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, cy - Math.round(l.r * 1.2));
    ctx.stroke();
  }

  // Street baseline (washi street stones)
  const baseline = Math.round(h * 0.86);
  ctx.fillStyle = "#070302";
  ctx.fillRect(0, baseline, w, h - baseline);
  ctx.strokeStyle = "rgba(201,162,39,0.18)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, baseline + 6);
    ctx.lineTo(x + 16, baseline + 6);
    ctx.stroke();
  }

  // Dancers — synchronised on the same beat. Slight phase offset gives
  // the line a visible wave so it doesn't read as one stamped pose.
  const beatProgress = (t / BEAT_MS) % 4;
  const poseBase = Math.floor(beatProgress);
  const dancers = REN_DANCERS;
  for (let i = 0; i < dancers; i++) {
    const x = Math.round(((i + 1) / (dancers + 1)) * w);
    const y = Math.round(baseline - 6);
    const phase = (poseBase + i) % 4;
    drawDancerCanvas(ctx, x, y, phase, gender, t + i * 40);
  }

  // Ground glow under each dancer
  for (let i = 0; i < dancers; i++) {
    const x = Math.round(((i + 1) / (dancers + 1)) * w);
    const grd = ctx.createRadialGradient(x, baseline, 0, x, baseline, 60);
    grd.addColorStop(0, "rgba(201,162,39,0.25)");
    grd.addColorStop(1, "rgba(201,162,39,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(x, baseline + 4, 60, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Canvas equivalent of DancerSilhouette. Coordinates mirror the SVG
// viewBox 100×200, scaled to ~110px tall.
function drawDancerCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baselineY: number,
  pose: number,
  gender: Gender,
  t: number,
) {
  const scale = 0.55;
  const ox = cx - Math.round(50 * scale);
  const oy = baselineY - Math.round(170 * scale);
  const stroke = "#e6dcb0";
  const accent = gender === "male" ? "#c03d2b" : "#c9a227";
  const sway = Math.round(Math.sin(t * 0.012) * 2);

  // Head
  ctx.fillStyle = stroke;
  ctx.beginPath();
  ctx.arc(
    ox + Math.round(50 * scale) + sway,
    oy + Math.round(28 * scale),
    Math.round(10 * scale),
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Hat / hachimaki
  if (gender === "female") {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(
      ox + Math.round(50 * scale) + sway,
      oy + Math.round(20 * scale),
      Math.round(26 * scale),
      Math.round(6 * scale),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(
      ox + Math.round(38 * scale) + sway,
      oy + Math.round(24 * scale),
      Math.round(24 * scale),
      Math.round(4 * scale),
    );
  }

  // Torso
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.85;
  const torsoHeight = pose === 0 ? 78 : pose === 1 ? 84 : 88;
  ctx.beginPath();
  ctx.moveTo(ox + Math.round(40 * scale), oy + Math.round(40 * scale));
  ctx.lineTo(ox + Math.round(60 * scale), oy + Math.round(40 * scale));
  ctx.lineTo(ox + Math.round(60 * scale), oy + Math.round(torsoHeight * scale));
  ctx.lineTo(ox + Math.round(40 * scale), oy + Math.round(torsoHeight * scale));
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Limbs — pose-driven offsets
  ctx.strokeStyle = stroke;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.round(7 * scale);

  const armOffsets: Array<[number, number, number, number]> =
    pose === 0
      ? [
          [40, 50, 26, 70],
          [60, 50, 74, 70],
        ]
      : pose === 1
        ? [
            [60, 48, 84, 14],
            [40, 48, 28, 78],
          ]
        : pose === 2
          ? [
              [44, 50, 80, 44],
              [56, 50, 20, 44],
            ]
          : [
              [40, 48, 28, 86],
              [60, 48, 72, 86],
            ];
  for (const [x1, y1, x2, y2] of armOffsets) {
    ctx.beginPath();
    ctx.moveTo(
      ox + Math.round(x1 * scale) + sway,
      oy + Math.round(y1 * scale),
    );
    ctx.lineTo(
      ox + Math.round(x2 * scale) + sway,
      oy + Math.round(y2 * scale),
    );
    ctx.stroke();
  }

  // Legs
  const legOffsets: Array<[number, number, number, number]> =
    pose === 0
      ? [
          [42, 78, 28, 120],
          [58, 78, 72, 120],
          [28, 120, 20, 150],
          [72, 120, 80, 150],
        ]
      : [
          [42, 88, 42, 140],
          [58, 88, 58, 140],
          [42, 140, 38, 168],
          [58, 140, 62, 168],
        ];
  ctx.lineWidth = Math.round(8 * scale);
  for (const [x1, y1, x2, y2] of legOffsets) {
    ctx.beginPath();
    ctx.moveTo(ox + Math.round(x1 * scale), oy + Math.round(y1 * scale));
    ctx.lineTo(ox + Math.round(x2 * scale), oy + Math.round(y2 * scale));
    ctx.stroke();
  }
}

