"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import {
  useStorySettingsStore,
  type StoryViewMode,
} from "@/stores/useStorySettingsStore";
import { useChromeVisibility } from "@/hooks/useChromeVisibility";

const OPTIONS: ReadonlyArray<{
  value: StoryViewMode;
  label: string;
  desc: string;
}> = [
  { value: "auto", label: "自動", desc: "デバイスに合わせて切替" },
  { value: "continuous", label: "横スクロール", desc: "ホイールで右→左に流れる" },
  { value: "paginated", label: "紙芝居", desc: "ボタン・スワイプでめくる" },
];

/**
 * Floating hamburger that opens a settings panel for choosing the story
 * view mode. Persists via the zustand store (localStorage backed).
 */
export function StorySettingsMenu() {
  const [open, setOpen] = useState(false);
  const viewMode = useStorySettingsStore((s) => s.viewMode);
  const setViewMode = useStorySettingsStore((s) => s.setViewMode);
  const chromeVisible = useChromeVisibility();
  // Keep the hamburger visible while the panel is open even if the
  // user has been still long enough to hide other chrome — otherwise
  // they couldn't easily close it.
  const showButton = chromeVisible || open;

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "設定メニューを閉じる" : "設定メニューを開く"}
        aria-expanded={open}
        aria-controls="story-settings-panel"
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
        id="story-settings-panel"
        role="dialog"
        aria-label="表示設定"
        aria-hidden={!open}
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
        <p className="mb-4 mt-1 text-xs text-sumi/60">表示モード</p>
        <div className="flex flex-col gap-2">
          {OPTIONS.map((opt) => {
            const active = viewMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setViewMode(opt.value)}
                aria-pressed={active}
                className={clsx(
                  "rounded-xl border px-4 py-3 text-left transition",
                  active
                    ? "border-sumi bg-sumi text-washi-50"
                    : "border-sumi/15 bg-white text-sumi hover:border-sumi/40",
                )}
              >
                <div className="text-sm font-medium">{opt.label}</div>
                <div
                  className={clsx(
                    "mt-0.5 text-[0.7rem] leading-relaxed",
                    active ? "text-washi-50/70" : "text-sumi/60",
                  )}
                >
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
