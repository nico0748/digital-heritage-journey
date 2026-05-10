"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import {
  useLocaleStore,
  detectInitialLocale,
  LOCALES,
} from "@/stores/useLocaleStore";
import { useChromeVisibility } from "@/hooks/useChromeVisibility";

/**
 * Global hamburger that mounts everywhere except the story page (which
 * has its own StorySettingsMenu carrying View Mode). Currently houses
 * the language picker; future global settings (theme, motion, etc.)
 * can land here too.
 *
 * Mirrors StorySettingsMenu's a11y pattern (aria-expanded/controls,
 * role=dialog, inert, Escape) so keyboard / SR users get a consistent
 * experience between the two menus that share the same screen slot.
 */
export function GlobalSettingsMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const userPicked = useLocaleStore((s) => s.userPicked);
  const chromeVisible = useChromeVisibility();
  const showButton = chromeVisible || open;

  // First-visit auto-detect — runs once if the user has never chosen.
  // The store's persisted `userPicked` flag prevents this from ever
  // stomping a deliberate later choice.
  useEffect(() => {
    if (userPicked) return;
    const detected = detectInitialLocale();
    if (detected !== locale) setLocale(detected);
    // Mark that the auto-detect has run by NOT setting userPicked here —
    // we only want userPicked to flip when the user actively clicks.
    // Re-running detect on subsequent mounts is harmless because it's
    // deterministic for the same browser.
  }, [userPicked, locale, setLocale]);

  // Story page has its own menu in the same screen slot — hide ours
  // there so they don't stack.
  const isStoryRoute = pathname?.startsWith("/story") ?? false;

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (isStoryRoute) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close settings menu" : "Open settings menu"}
        aria-expanded={open}
        aria-controls="global-settings-panel"
        className={clsx(
          "fixed right-[4.5rem] top-5 z-[300] grid h-11 w-11 place-items-center rounded-full bg-sumi/80 text-washi-50 shadow-lg backdrop-blur transition-opacity duration-300 hover:bg-sumi",
          showButton ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[290] bg-sumi/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        id="global-settings-panel"
        role="dialog"
        aria-label="Settings panel"
        aria-hidden={!open}
        // `inert` keeps the panel out of the keyboard / focus / hit-test
        // tree when hidden — without this, the language buttons remain
        // tabbable and silently switch locale via keyboard.
        inert={!open}
        className={clsx(
          "fixed right-4 top-20 z-[300] w-72 max-w-[calc(100vw-2rem)] origin-top-right rounded-2xl bg-washi-50 p-5 shadow-2xl ring-1 ring-sumi/10 transition",
          open
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <h2 className="text-[0.65rem] font-medium uppercase tracking-[0.4em] text-sumi/80">
          Settings
        </h2>
        <p className="mb-4 mt-1 text-xs text-sumi/60">Language</p>
        <div className="flex flex-col gap-2">
          {LOCALES.map((opt) => {
            const active = locale === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLocale(opt.value)}
                aria-pressed={active}
                className={clsx(
                  "rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
                  active
                    ? "border-sumi bg-sumi text-washi-50"
                    : "border-sumi/15 bg-white text-sumi hover:border-sumi/40",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
