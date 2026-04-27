"use client";

import { MoveLeft } from "lucide-react";

export function ScrollHint({ label = "Scroll · 右から左へ" }: { label?: string }) {
  return (
    <div className="pointer-events-none absolute bottom-8 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 text-xs uppercase tracking-[0.3em] text-sumi/60">
      <MoveLeft size={16} className="animate-pulse" />
      <span>{label}</span>
    </div>
  );
}
