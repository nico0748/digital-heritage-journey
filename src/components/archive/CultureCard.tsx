"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { Culture } from "@/types/content";

export function CultureCard({ culture }: { culture: Culture }) {
  const [c1, c2, c3] = culture.palette;
  const inner = (
    <motion.div
      whileHover={culture.comingSoon ? undefined : { y: -6 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="relative aspect-[3/4] overflow-hidden rounded-sm border border-sumi/5 shadow-lg shadow-sumi/5"
      style={{
        background: `linear-gradient(160deg, ${c1} 0%, ${c2} 60%, ${c3} 100%)`,
      }}
    >
      <span
        aria-hidden
        className="absolute -right-2 -top-6 font-jp text-[14rem] leading-none text-washi-50/20"
      >
        {culture.accentKanji}
      </span>

      <div className="absolute inset-0 flex flex-col justify-end p-6 text-washi-50">
        <p className="text-[0.6rem] uppercase tracking-[0.4em] text-washi-50/70">
          {culture.region} · {culture.era}
        </p>
        <h3 className="mt-2 font-serif text-3xl font-light">{culture.name}</h3>
        <p className="font-jp text-sm text-washi-50/70">{culture.jp}</p>
        <p className="mt-3 text-xs italic text-washi-50/70">
          {culture.description}
        </p>
        {!culture.comingSoon && (
          <span className="mt-5 inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] opacity-0 transition group-hover:opacity-100">
            Touch it <ArrowRight size={12} />
          </span>
        )}
      </div>

      {/* Coming-soon overlay — keeps the culture's accent kanji + name
          visible behind a softened tint so the card still reads as
          "this culture exists, just not yet playable". */}
      {culture.comingSoon && (
        <div className="absolute inset-0 flex items-center justify-center bg-sumi/55 backdrop-blur-[2px]">
          <span className="rounded-full border border-washi-50/40 bg-sumi/60 px-5 py-2 font-jp text-sm tracking-[0.4em] text-washi-50/95">
            準備中
          </span>
        </div>
      )}
    </motion.div>
  );

  if (culture.comingSoon) {
    return (
      <div
        aria-label={`${culture.name} (準備中, coming soon)`}
        className="group relative block cursor-not-allowed"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link href={`/experience/${culture.id}`} className="group relative block">
      {inner}
    </Link>
  );
}
