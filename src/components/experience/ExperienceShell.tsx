"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Culture } from "@/types/content";
import { useAppStore } from "@/stores/useAppStore";
import { WashiCanvas } from "./WashiCanvas";
import { HanabiStage } from "./HanabiStage";

// Heavy: Three.js + R3F + drei. Load only when Kiriko is actually requested.
const KirikoCanvas = dynamic(
  () => import("./KirikoCanvas").then((m) => m.KirikoCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[32rem] w-[min(90vw,34rem)] place-items-center text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/60">
        Preparing the glass…
      </div>
    ),
  },
);

export function ExperienceShell({ culture }: { culture: Culture }) {
  const router = useRouter();
  const saveWork = useAppStore((s) => s.saveWork);
  const [c1, c2, c3] = culture.palette;

  const handleComplete = (dataUrl: string) => {
    saveWork(culture.id, dataUrl);
    router.push(`/ending/${culture.id}`);
  };

  // Coming-soon early return — keeps the cinematic dark backdrop and
  // header consistent with playable cultures, but renders a 「準備中」
  // placeholder instead of mounting an unfinished Stage.
  if (culture.comingSoon) {
    return (
      <main
        className="relative min-h-screen w-full overflow-hidden"
        style={{
          background: `radial-gradient(circle at 20% 10%, ${c3} 0%, ${c2} 55%, ${c1} 100%)`,
        }}
      >
        <div className="paper-grain" />
        <header className="relative z-20 flex items-center justify-between px-6 py-6 md:px-10">
          <Link
            href="/archive"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-washi-50/80 transition hover:text-washi-50"
          >
            <ArrowLeft size={14} /> Archive
          </Link>
          <div className="text-right">
            <p className="text-[0.6rem] uppercase tracking-[0.5em] text-washi-50/70">
              {culture.region} · {culture.era}
            </p>
            <h1 className="font-serif text-2xl font-light text-washi-50">
              {culture.name}
              <span className="ml-3 font-jp text-base text-washi-50/70">
                {culture.jp}
              </span>
            </h1>
          </div>
        </header>
        <section className="relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl flex-col items-center justify-center px-6 pb-20 text-center text-washi-50">
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
            Coming Soon
          </p>
          <p className="mt-8 max-w-md text-sm italic leading-relaxed text-washi-50/70">
            この体験は丁寧に仕立てている最中です。
            <br />
            また会いに来てください。
          </p>
          <Link
            href="/archive"
            className="mt-10 inline-flex items-center gap-2 rounded-full border border-washi-50/40 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10 hover:text-washi-50"
          >
            <ArrowLeft size={12} />
            Back to Archive
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden"
      style={{
        background: `radial-gradient(circle at 20% 10%, ${c3} 0%, ${c2} 55%, ${c1} 100%)`,
      }}
    >
      <div className="paper-grain" />

      <header className="relative z-20 flex items-center justify-between px-6 py-6 md:px-10">
        <Link
          href="/archive"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-washi-50/80 transition hover:text-washi-50"
        >
          <ArrowLeft size={14} /> Archive
        </Link>

        <div className="text-right">
          <p className="text-[0.6rem] uppercase tracking-[0.5em] text-washi-50/70">
            {culture.region} · {culture.era}
          </p>
          <h1 className="font-serif text-2xl font-light text-washi-50">
            {culture.name}
            <span className="ml-3 font-jp text-base text-washi-50/70">
              {culture.jp}
            </span>
          </h1>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl flex-col items-center justify-center px-6 pb-20">
        {culture.experience === "kiriko-cut" && (
          <KirikoCanvas onComplete={handleComplete} palette={culture.palette} />
        )}
        {culture.experience === "washi-scoop" && (
          <WashiCanvas onComplete={handleComplete} palette={culture.palette} />
        )}
        {culture.experience === "hanabi-launch" && (
          <HanabiStage onComplete={handleComplete} palette={culture.palette} />
        )}
      </section>
    </main>
  );
}
