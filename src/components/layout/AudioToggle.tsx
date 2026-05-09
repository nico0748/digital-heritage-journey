"use client";

import { Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { useAppStore } from "@/stores/useAppStore";
import { useEffect, useState } from "react";
import { useChromeVisibility } from "@/hooks/useChromeVisibility";

export function AudioToggle() {
  const muted = useAppStore((s) => s.muted);
  const toggleMute = useAppStore((s) => s.toggleMute);
  const [mounted, setMounted] = useState(false);
  const visible = useChromeVisibility();

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={toggleMute}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={clsx(
        "fixed top-5 right-5 z-[300] grid h-11 w-11 place-items-center rounded-full border border-sumi/10 bg-washi-50/80 text-sumi backdrop-blur transition-opacity duration-300 hover:bg-washi-100",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}
