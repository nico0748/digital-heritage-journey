"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { cultures } from "@/content/cultures";
import { prefectures, getPrefecture } from "@/content/prefectures";
import { CultureCard } from "@/components/archive/CultureCard";
import { useTranslations } from "@/lib/i18n";
import type { PrefectureId } from "@/types/content";

/**
 * Client wrapper that renders the entire Archive page UI. The server
 * component upstream resolves `searchParams` and hands us the active
 * prefecture id so we keep URL-based filtering, while still being able
 * to use the locale-aware `useTranslations()` hook for every label.
 */
export function ArchiveView({ activeId }: { activeId: PrefectureId | null }) {
  const t = useTranslations();
  const activePref = activeId ? getPrefecture(activeId) : null;
  const filtered = activeId
    ? cultures.filter((c) => c.prefectures?.includes(activeId) ?? false)
    : cultures;

  return (
    <main className="relative min-h-screen w-full bg-washi-50 px-6 py-16 md:px-16 md:py-24">
      <div className="paper-grain" />

      <header className="relative z-10 mx-auto mb-12 max-w-5xl">
        <Link
          href="/story"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-sumi/60 transition hover:text-sumi"
        >
          <ArrowLeft size={14} /> {t("common.back")}
        </Link>
        <p className="mt-10 text-[0.65rem] uppercase tracking-[0.5em] text-sumi/60">
          {activePref ? (
            <>
              Archive · <span className="font-jp">{activePref.nameJp}</span>
            </>
          ) : (
            "Archive"
          )}
        </p>
        <h1 className="mt-4 font-serif text-5xl font-light leading-tight text-sumi md:text-6xl">
          {t("archive.title")}
        </h1>
        <p className="mt-4 max-w-xl text-sumi/60 italic">
          {activePref
            ? t("archive.subtitlePrefecture", { prefecture: activePref.nameJp })
            : t("archive.subtitleAll")}
        </p>
      </header>

      <nav
        aria-label={t("archive.filterAria")}
        className="relative z-10 mx-auto mb-12 max-w-5xl"
      >
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href="/archive"
              className={clsx(
                "inline-block rounded-full border px-4 py-1.5 text-xs transition",
                !activeId
                  ? "border-sumi bg-sumi text-washi-50"
                  : "border-sumi/15 bg-white text-sumi/70 hover:border-sumi/40 hover:text-sumi",
              )}
            >
              {t("archive.filterAll")}
            </Link>
          </li>
          {prefectures.map((p) => (
            <li key={p.id}>
              <Link
                href={`/archive?prefecture=${p.id}`}
                className={clsx(
                  "inline-block rounded-full border px-4 py-1.5 text-xs transition",
                  activeId === p.id
                    ? "border-sumi bg-sumi text-washi-50"
                    : "border-sumi/15 bg-white text-sumi/70 hover:border-sumi/40 hover:text-sumi",
                )}
              >
                <span className="font-jp">{p.nameJp}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {filtered.length > 0 ? (
        <section className="relative z-10 mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
          {filtered.map((c) => (
            <CultureCard key={c.id} culture={c} />
          ))}
        </section>
      ) : (
        <section className="relative z-10 mx-auto max-w-3xl rounded-lg border border-sumi/10 bg-white p-10 text-center">
          <p className="text-sm text-sumi/60">
            {t("archive.comingSoonHeading", {
              prefecture: activePref?.nameJp ?? "",
            })}
          </p>
          {activePref && activePref.highlights.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-sumi/45">
              <span>{t("archive.highlightsLabel")}: </span>
              <span className="font-jp">
                {activePref.highlights.join(" · ")}
              </span>
            </p>
          )}
          <Link
            href="/archive"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-sumi/20 px-4 py-2 text-xs text-sumi/70 transition hover:border-sumi/60 hover:text-sumi"
          >
            {t("archive.browseAll")}
          </Link>
        </section>
      )}
    </main>
  );
}
