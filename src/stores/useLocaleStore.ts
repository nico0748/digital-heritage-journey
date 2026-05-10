"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Locale = "ja" | "en" | "zh" | "ko";

export const LOCALES: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: "ja", label: "Japanese" },
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese" },
  { value: "ko", label: "Korean" },
];

interface LocaleState {
  locale: Locale;
  // Whether the user has explicitly chosen — distinct from the default,
  // so the auto-detect step can only run once on first visit and never
  // overrides a deliberate pick later.
  userPicked: boolean;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "en",
      userPicked: false,
      setLocale: (locale) => set({ locale, userPicked: true }),
    }),
    {
      name: "dhj-locale",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * Best-effort browser-language → supported locale mapping. Only consulted
 * once on the first mount before the user has made an explicit pick.
 */
export function detectInitialLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("ko")) return "ko";
  return "en";
}
