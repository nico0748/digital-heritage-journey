"use client";

import { useEffect, useState } from "react";
import {
  resolveViewMode,
  useStorySettingsStore,
} from "@/stores/useStorySettingsStore";
import type { StoryScene } from "@/types/content";
import { HorizontalStage } from "./HorizontalStage";
import { PaginatedStage } from "./PaginatedStage";

/**
 * Picks between continuous (GSAP horizontal pin) and paginated (kamishibai)
 * based on the user's stored preference. `auto` resolves to paginated for
 * coarse pointers / narrow viewports, continuous otherwise.
 *
 * Defers rendering until after hydration so the resolved mode reflects the
 * real client environment (matchMedia is unavailable on the server).
 */
export function StoryStage({ scenes }: { scenes: StoryScene[] }) {
  const viewMode = useStorySettingsStore((s) => s.viewMode);
  const [resolved, setResolved] = useState<"continuous" | "paginated" | null>(
    null,
  );

  useEffect(() => {
    const update = () => setResolved(resolveViewMode(viewMode));
    update();

    if (viewMode !== "auto") return;
    const mqlPointer = window.matchMedia("(pointer: coarse)");
    const mqlWidth = window.matchMedia("(max-width: 1023px)");
    mqlPointer.addEventListener("change", update);
    mqlWidth.addEventListener("change", update);
    return () => {
      mqlPointer.removeEventListener("change", update);
      mqlWidth.removeEventListener("change", update);
    };
  }, [viewMode]);

  if (resolved === null) {
    // Pre-hydration placeholder — same height as the stages it replaces so
    // the layout doesn't shift once the real component mounts.
    return <div aria-hidden className="h-screen w-full bg-washi-100" />;
  }

  return resolved === "continuous" ? (
    <HorizontalStage scenes={scenes} />
  ) : (
    <PaginatedStage scenes={scenes} />
  );
}
