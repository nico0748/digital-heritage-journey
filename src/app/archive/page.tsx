import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cultures } from "@/content/cultures";
import { CultureCard } from "@/components/archive/CultureCard";

export default function ArchivePage() {
  return (
    <main className="relative min-h-screen w-full bg-washi-50 px-6 py-16 md:px-16 md:py-24">
      <div className="paper-grain" />

      <header className="relative z-10 mx-auto mb-16 max-w-5xl">
        <Link
          href="/story"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-sumi/60 transition hover:text-sumi"
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <p className="mt-10 text-[0.65rem] uppercase tracking-[0.5em] text-sumi/60">
          Archive
        </p>
        <h1 className="mt-4 font-serif text-5xl font-light leading-tight text-sumi md:text-6xl">
          Choose a culture to carry.
        </h1>
        <p className="mt-4 max-w-xl text-sumi/60 italic">
          Each one is disappearing a little faster than the last.
        </p>
      </header>

      <section className="relative z-10 mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
        {cultures.map((c) => (
          <CultureCard key={c.id} culture={c} />
        ))}
      </section>
    </main>
  );
}
