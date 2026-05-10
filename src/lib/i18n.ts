"use client";

import { useCallback } from "react";
import { useLocaleStore, type Locale } from "@/stores/useLocaleStore";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import zh from "@/messages/zh.json";
import ko from "@/messages/ko.json";
import fr from "@/messages/fr.json";

// All 5 message catalogues are bundled — no async chunks to wait on,
// no FOUC. Total ~25 KB gzipped which is fine for a project of this
// size. If we add Stage hints later and the bundle balloons we can
// switch to dynamic imports per-locale.
type Messages = typeof en;

const CATALOGUE: Record<Locale, Messages> = { en, ja, zh, ko, fr };

/**
 * Returns a `t()` function bound to the user's current locale.
 * Keys are dot-paths into the JSON catalogue, e.g. `"archive.title"` or
 * `"cultures.kiriko.description"`. Falls back to the English catalogue
 * when a key is missing in the current locale, then to the key itself.
 *
 * Supports simple `{name}` interpolation:
 *   t("experience.carriedHeader", { name: "Hanabi" })
 */
export function useTranslations() {
  const locale = useLocaleStore((s) => s.locale);
  return useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const found = lookup(CATALOGUE[locale], key) ?? lookup(en, key) ?? key;
      if (!vars) return found;
      return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        found,
      );
    },
    [locale],
  );
}

function lookup(dict: unknown, key: string): string | null {
  let current: unknown = dict;
  for (const segment of key.split(".")) {
    if (current && typeof current === "object" && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return null;
    }
  }
  return typeof current === "string" ? current : null;
}
