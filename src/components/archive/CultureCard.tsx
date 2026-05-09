"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { Culture } from "@/types/content";
import { getPrefecture } from "@/content/prefectures";

export function CultureCard({ culture }: { culture: Culture }) {
  const [c1, c2, c3] = culture.palette;
  // Show the primary prefecture as a top-corner pill. Cultures with no
  // attached prefecture (nationwide festivals or pre-taxonomy entries)
  // show "全国" instead.
  const primaryPref = culture.prefectures?.[0]
    ? getPrefecture(culture.prefectures[0])
    : null;
  return (
    <Link href={`/experience/${culture.id}`} className="group relative block">
      <motion.div
        whileHover={{ y: -6 }}
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

        <span className="absolute left-4 top-4 inline-flex items-center rounded-full border border-washi-50/30 bg-sumi/30 px-3 py-1 text-[0.55rem] uppercase tracking-[0.3em] text-washi-50/85 backdrop-blur">
          <span className="font-jp tracking-wider">
            {primaryPref?.nameJp ?? "全国"}
          </span>
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
          <span className="mt-5 inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] opacity-0 transition group-hover:opacity-100">
            Touch it <ArrowRight size={12} />
          </span>
        </div>
      </motion.div>
    </Link>
  );
}
