"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Share2, Sparkles, ArrowRight } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import type { Culture } from "@/types/content";

export function EndingView({ culture }: { culture: Culture }) {
  const dataUrl = useAppStore((s) => s.completedWorks[culture.id]);
  const [mounted, setMounted] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [c1, c2, c3] = culture.palette;

  useEffect(() => setMounted(true), []);

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

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.8 }}
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
