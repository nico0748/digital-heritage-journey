"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { useEffect, useState } from "react";

export function AudioToggle() {
  const muted = useAppStore((s) => s.muted);
  const toggleMute = useAppStore((s) => s.toggleMute);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={toggleMute}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      className="fixed top-5 right-5 z-50 grid h-11 w-11 place-items-center rounded-full border border-sumi/10 bg-washi-50/80 text-sumi backdrop-blur transition hover:bg-washi-100"
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}
