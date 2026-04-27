"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AppState {
  muted: boolean;
  toggleMute: () => void;
  completedWorks: Record<string, string>;
  saveWork: (id: string, dataUrl: string) => void;
  clearWork: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      muted: true,
      toggleMute: () => set((s) => ({ muted: !s.muted })),
      completedWorks: {},
      saveWork: (id, dataUrl) =>
        set((s) => ({ completedWorks: { ...s.completedWorks, [id]: dataUrl } })),
      clearWork: (id) =>
        set((s) => {
          const next = { ...s.completedWorks };
          delete next[id];
          return { completedWorks: next };
        }),
    }),
    {
      name: "dhj-app-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
