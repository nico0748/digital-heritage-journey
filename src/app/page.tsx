import Link from "next/link";
import { IntroBackdrop } from "@/components/intro/IntroBackdrop";
import { StartButton } from "@/components/intro/StartButton";

export default function HomePage() {
  return (
    <main className="relative h-screen w-full overflow-hidden bg-washi-100">
      <IntroBackdrop />
      <div className="paper-grain" />

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="mb-6 text-[0.65rem] uppercase tracking-[0.5em] text-sumi/60">
          Digital Heritage Journey
        </p>

        <h1 className="font-jp text-5xl font-medium leading-tight text-sumi md:text-7xl">
          小さくなる日本を
          <br />
          <span className="text-shu">触れられる記憶</span>
          へ。
        </h1>

        <p className="mt-10 max-w-xl font-serif text-lg italic leading-relaxed text-sumi/70 md:text-xl">
          Japan is becoming smaller.
          <br />
          But its memories can still move us.
        </p>

        <Link href="/story" className="mt-14 inline-block">
          <StartButton />
        </Link>

        <p className="mt-8 text-[0.65rem] uppercase tracking-[0.4em] text-sumi/40">
          No words needed — only your hands and ears.
        </p>
      </div>
    </main>
  );
}
