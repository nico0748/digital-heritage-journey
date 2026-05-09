"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Share2,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Building2,
  Landmark,
  HandMetal,
  Sparkle,
  Store,
} from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import type { Culture, RealWorldKind } from "@/types/content";

function RealWorldKindIcon({ kind }: { kind: RealWorldKind }) {
  const map: Record<RealWorldKind, typeof Building2> = {
    association: Building2,
    museum: Landmark,
    experience: HandMetal,
    festival: Sparkle,
    shop: Store,
  };
  const Icon = map[kind];
  return <Icon size={14} />;
}

export function EndingView({ culture }: { culture: Culture }) {
  const dataUrl = useAppStore((s) => s.completedWorks[culture.id]);
  const [mounted, setMounted] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [c1, c2, c3] = culture.palette;

  useEffect(() => setMounted(true), []);

  // Coming-soon: someone hit /ending/{slug} directly (or got redirected
  // here by a Stage that hasn't been fully wired up yet). Same
  // 「準備中」 placeholder shape as ExperienceShell so the journey
  // stays consistent.
  if (culture.comingSoon) {
    return (
      <main
        className="relative min-h-screen w-full overflow-hidden px-6 py-16"
        style={{
          background: `radial-gradient(circle at 80% 10%, ${c3} 0%, ${c2} 45%, ${c1} 100%)`,
        }}
      >
        <div className="paper-grain" />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center text-washi-50">
          <span
            aria-hidden
            className="font-jp text-[14rem] leading-none text-washi-50/20"
          >
            {culture.accentKanji}
          </span>
          <p className="-mt-8 font-jp text-2xl tracking-[0.5em] text-washi-50/85">
            準備中
          </p>
          <p className="mt-3 text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/55">
            Coming Soon · {culture.name} ({culture.jp})
          </p>
          <Link
            href="/archive"
            className="mt-10 inline-flex items-center gap-2 rounded-full border border-washi-50/40 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10 hover:text-washi-50"
          >
            ← Back to Archive
          </Link>
        </div>
      </main>
    );
  }

  const share = async () => {
    const text = `I just preserved ${culture.name} (${culture.jp}) on Digital Heritage Journey.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Digital Heritage Journey", text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 1800);
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden px-6 py-16"
      style={{
        background: `radial-gradient(circle at 80% 10%, ${c3} 0%, ${c2} 45%, ${c1} 100%)`,
      }}
    >
      <div className="paper-grain" />

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center text-washi-50">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.5em] text-washi-50/70"
        >
          <Sparkles size={12} /> A small piece is preserved
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1 }}
          className="mt-6 font-serif text-5xl font-light leading-tight md:text-6xl"
        >
          You carried {culture.name}
          <br />
          one step further.
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.3 }}
          className="relative mt-12 aspect-square w-[min(80vw,22rem)] overflow-hidden rounded-sm border border-washi-50/15 bg-black/30 shadow-2xl shadow-black/40"
        >
          {mounted && dataUrl ? (
            <Image
              src={dataUrl}
              alt={`Your ${culture.name}`}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center font-jp text-7xl text-washi-50/40">
              {culture.accentKanji}
            </div>
          )}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="mt-10 max-w-md text-sm italic leading-relaxed text-washi-50/80"
        >
          {culture.problem}
          <br />
          <span className="text-washi-50">This culture needs successors.</span>
        </motion.p>

        {(() => {
          // Normalise realWorld to a list — single object stays
          // backward-compat for existing entries, arrays are unwrapped.
          const links = Array.isArray(culture.realWorld)
            ? culture.realWorld
            : culture.realWorld
              ? [culture.realWorld]
              : [];
          if (links.length === 0) return null;
          return (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.7 }}
              className="mt-10 flex flex-col items-center gap-3"
            >
              <p className="text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/55">
                Visit the real thing · 本物に触れる
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 rounded-full bg-shu px-6 py-3 text-sm tracking-wider text-washi-50 shadow-lg shadow-shu/20 transition hover:bg-shu/85"
                  >
                    <RealWorldKindIcon kind={link.kind} />
                    <span className="font-jp">{link.labelJp}</span>
                    <ExternalLink size={14} className="opacity-70" />
                  </a>
                ))}
              </div>
              {links.some((l) => l.location) && (
                <p className="text-[0.6rem] uppercase tracking-[0.3em] text-washi-50/45">
                  {links
                    .map((l) => l.location)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </motion.div>
          );
        })()}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.85 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <button
            type="button"
            onClick={share}
            className="inline-flex items-center gap-2 rounded-full border border-washi-50/40 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50 transition hover:bg-washi-50/10"
          >
            <Share2 size={12} />
            {shareState === "copied" ? "Copied" : "Share"}
          </button>
          <Link
            href="/archive"
            className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100"
          >
            See more
            <ArrowRight size={12} />
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
