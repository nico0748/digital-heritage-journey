"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import type { StoryScene } from "@/types/content";

const sceneArt: Record<string, React.ComponentType> = {
  landscape: LandscapeArt,
  craft: CraftArt,
  artisan: ArtisanArt,
  problem: ProblemArt,
  future: FutureArt,
};

export function StoryScenePanel({
  scene,
  isLast,
  index,
  total,
}: {
  scene: StoryScene;
  isLast: boolean;
  index: number;
  total: number;
}) {
  const Art = sceneArt[scene.id];
  const dark = scene.tone === "mono" || scene.tone === "dark";

  return (
    <section
      className={clsx(
        "story-panel relative flex w-screen flex-shrink-0 items-center justify-center px-10",
        dark ? "text-washi-50" : "text-sumi",
      )}
      style={{ background: scene.background }}
    >
      {Art ? <Art /> : null}
      <div className="paper-grain" aria-hidden />

      <div className="relative z-10 flex max-w-xl flex-col items-start">
        <span
          data-reveal
          className={clsx(
            "mb-6 text-[0.6rem] uppercase tracking-[0.5em]",
            dark ? "text-washi-50/60" : "text-sumi/60",
          )}
        >
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>

        {scene.accentKanji && (
          <span
            data-reveal
            aria-hidden
            className={clsx(
              "font-jp text-[12rem] leading-none opacity-10",
              dark ? "text-washi-50" : "text-sumi",
            )}
            style={{ position: "absolute", right: "-1rem", top: "-3rem" }}
          >
            {scene.accentKanji}
          </span>
        )}

        <h2
          data-reveal
          className="font-serif text-4xl font-light leading-tight md:text-6xl"
        >
          {scene.title}
        </h2>

        {scene.caption && (
          <p
            data-reveal
            className={clsx(
              "mt-6 max-w-md text-lg italic leading-relaxed",
              dark ? "text-washi-50/80" : "text-sumi/70",
            )}
          >
            {scene.caption}
          </p>
        )}

        {scene.subCaption && (
          <p
            data-reveal
            className={clsx(
              "mt-4 text-sm uppercase tracking-[0.3em]",
              dark ? "text-washi-50/60" : "text-sumi/60",
            )}
          >
            {scene.subCaption}
          </p>
        )}

        {isLast && (
          <Link
            data-reveal
            href="/archive"
            className="mt-10 inline-flex items-center gap-3 rounded-full bg-sumi px-6 py-3 text-sm uppercase tracking-[0.3em] text-washi-50 transition hover:bg-sumi/80"
          >
            Your turn
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
    </section>
  );
}

function LandscapeArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 600"
      className="absolute inset-0 h-full w-full opacity-60"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F5EFE6" />
          <stop offset="1" stopColor="#D9C9A8" />
        </linearGradient>
      </defs>
      <rect width="800" height="600" fill="url(#sky)" />
      <path
        d="M0 420 Q200 340 400 400 T800 380 L800 600 L0 600 Z"
        fill="#A3926F"
        opacity="0.35"
      />
      <path
        d="M0 480 Q180 420 380 460 T800 440 L800 600 L0 600 Z"
        fill="#2A2118"
        opacity="0.25"
      />
      <circle cx="640" cy="140" r="60" fill="#C03D2B" opacity="0.55" />
    </svg>
  );
}

function CraftArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 600"
      className="absolute inset-0 h-full w-full opacity-80"
      preserveAspectRatio="xMidYMid slice"
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x={100 + i * 110}
          y={200 + (i % 2) * 40}
          width="80"
          height="200"
          fill={i % 2 === 0 ? "#2B4A6F" : "#C9A227"}
          opacity={0.12 + (i % 3) * 0.08}
          transform={`rotate(${i * 3} ${140 + i * 110} 300)`}
        />
      ))}
      <circle cx="650" cy="140" r="40" fill="#C03D2B" opacity="0.3" />
    </svg>
  );
}

function ArtisanArt() {
  return (
    <div aria-hidden className="absolute inset-0 flex items-center justify-end pr-10 opacity-80">
      <div className="relative h-[60vh] w-[40vw]">
        <div className="absolute inset-0 rounded-[50%_20%_60%_30%] bg-sumi/10 blur-2xl" />
        <div className="absolute left-1/2 top-1/2 h-2 w-72 -translate-x-1/2 -translate-y-1/2 rotate-12 rounded-full bg-kin/70" />
        <div className="absolute left-1/3 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-gradient-to-br from-ai to-sumi shadow-2xl shadow-ai/40" />
      </div>
    </div>
  );
}

function ProblemArt() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {Array.from({ length: 30 }).map((_, i) => {
        const left = (i * 37) % 100;
        const top = (i * 53) % 100;
        const dur = 6 + ((i * 3) % 8);
        const delay = (i % 7) * 0.6;
        return (
          <span
            key={i}
            className="absolute font-jp text-xl text-washi-50/25 animate-float"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
            }}
          >
            {i % 3 === 0 ? "−1" : i % 3 === 1 ? "0" : "消"}
          </span>
        );
      })}
    </div>
  );
}

function FutureArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 600"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="sun" cx="70%" cy="30%" r="50%">
          <stop offset="0" stopColor="#F9D976" />
          <stop offset="1" stopColor="#FBF7F0" />
        </radialGradient>
      </defs>
      <rect width="800" height="600" fill="url(#sun)" />
      <circle cx="560" cy="180" r="80" fill="#C03D2B" opacity="0.35" />
      <path
        d="M0 480 Q200 420 420 460 T800 440 L800 600 L0 600 Z"
        fill="#A3926F"
        opacity="0.3"
      />
    </svg>
  );
}
