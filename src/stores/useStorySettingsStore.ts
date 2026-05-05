"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type StoryViewMode = "auto" | "continuous" | "paginated";

interface StorySettingsState {
  viewMode: StoryViewMode;
  setViewMode: (mode: StoryViewMode) => void;
}

export const useStorySettingsStore = create<StorySettingsState>()(
  persist(
    (set) => ({
      viewMode: "auto",
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: "dhj-story-settings",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * Resolve "auto" to a concrete mode based on the runtime environment.
 * - Coarse pointer (touch) OR narrow viewport → paginated (kamishibai)
 * - Otherwise (desktop with fine pointer) → continuous (scroll-pinned horizontal)
 *
 * Returns null on the server (no `window`) so callers can defer rendering
 * the resolved stage until after hydration.
 */
export function resolveViewMode(
  mode: StoryViewMode,
): "continuous" | "paginated" | null {
  if (mode !== "auto") return mode;
  if (typeof window === "undefined") return null;
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;
  const isNarrow = window.matchMedia("(max-width: 1023px)").matches;
  return isCoarse || isNarrow ? "paginated" : "continuous";
}
