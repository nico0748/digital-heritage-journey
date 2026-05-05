"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import clsx from "clsx";
import type { StoryScene } from "@/types/content";
import { StoryScenePanel } from "./StoryScenePanel";
import { useChromeVisibility } from "@/hooks/useChromeVisibility";

const SWIPE_THRESHOLD_PX = 80;
const VELOCITY_THRESHOLD = 400;

/**
 * Kamishibai-style paginated stage.
 *
 * Direction matches the HorizontalStage (Japanese right-to-left flow):
 * scene 1 is the starting card, and the story progresses by exiting to
 * the RIGHT. Future cards are stacked behind the current one peeking to
 * the down-LEFT, so the deck visually grows leftward as you read forward.
 *
 * When the user advances, the current card slides RIGHT and keeps sliding
 * until it is fully off the viewport — like a kamishibai card being
 * yanked off the butai. It does NOT settle at a peek slot; it disappears
 * past the right edge in one decisive motion.
 *
 * Going back: the most-recently-pulled card slides back IN from the right
 * edge to retake center.
 *
 * No cycling — once a card is past, it stays past for that session.
 * Exception: on the LAST scene, advancing wraps back to scene 0 so the
 * user can replay the show in one gesture without dragging through every
 * scene.
 *
 * Direction:
 * - Drag/swipe RIGHT → next (current yanked off to the right)
 * - Drag/swipe LEFT  → prev (the previous card slides back from the right)
 */
export function PaginatedStage({ scenes }: { scenes: StoryScene[] }) {
  const [index, setIndex] = useState(0);
  const total = scenes.length;
  const canPrev = index > 0;
  const canNext = index < total - 1;
  // Indicator dots only show briefly while the user is moving between
  // scenes. Re-armed on every index change.
  const [showIndicator, setShowIndicator] = useState(false);
  useEffect(() => {
    setShowIndicator(true);
    const t = setTimeout(() => setShowIndicator(false), 1500);
    return () => clearTimeout(t);
  }, [index]);
  const chromeVisible = useChromeVisibility();

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, total - 1)),
    [total],
  );
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  // "Wrap to start" — only intended for the special case of being on the
  // last scene and wanting to restart, not for general cycling.
  const jumpToStart = useCallback(() => setIndex(0), []);
  const isLastScene = index === total - 1;

  // Keyboard nav.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      // RTL kamishibai flow: story advances LEFTWARD, so the left arrow
      // moves forward and the right arrow goes back. Mirrors the on-
      // screen buttons (left=next, right=prev) and the indicator dot
      // motion (active dot drifts leftward as you advance).
      if (e.key === "ArrowLeft" || e.key === " ") {
        e.preventDefault();
        if (canNext) next();
        else if (isLastScene) jumpToStart();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, jumpToStart, canNext, isLastScene]);

  // Real touch hardware (iPad / iPhone).
  const touchStartXRef = useRef<number | null>(null);
  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStartXRef.current;
    touchStartXRef.current = null;
    if (start === null) return;
    const delta = (e.changedTouches[0]?.clientX ?? start) - start;
    // Swipe right → next (current card flies off right, matching the
    // horizontal-scroll RTL flow). At the last scene a right swipe wraps
    // back to scene 0. Swipe left → prev.
    if (delta > SWIPE_THRESHOLD_PX) {
      if (canNext) next();
      else if (isLastScene) jumpToStart();
    } else if (delta < -SWIPE_THRESHOLD_PX && canPrev) {
      prev();
    }
  };

  // Trackpad two-finger horizontal swipe (fires `wheel` events, not touch).
  // Accumulate deltaX with a short cooldown so a single fling doesn't blow
  // through multiple scenes.
  const wheelLockRef = useRef(false);
  const wheelAccumRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, []);
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    if (wheelLockRef.current) return;
    wheelAccumRef.current += e.deltaX;
    // macOS natural-scroll trackpad: a physical LEFT-swipe registers as
    // POSITIVE deltaX. We want left-swipe → next, so positive accumulation
    // advances and negative goes back.
    // macOS natural-scroll trackpad: a physical RIGHT-swipe registers as
    // NEGATIVE deltaX. Right swipe is now "next", so negative accumulation
    // advances and positive goes back.
    if (wheelAccumRef.current < -SWIPE_THRESHOLD_PX) {
      if (canNext) {
        wheelLockRef.current = true;
        wheelAccumRef.current = 0;
        next();
      } else if (isLastScene) {
        wheelLockRef.current = true;
        wheelAccumRef.current = 0;
        jumpToStart();
      }
    } else if (wheelAccumRef.current > SWIPE_THRESHOLD_PX && canPrev) {
      wheelLockRef.current = true;
      wheelAccumRef.current = 0;
      prev();
    }
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(() => {
      wheelLockRef.current = false;
      wheelAccumRef.current = 0;
    }, 350);
  };

  const handleDragEnd = (
    _e: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    // Drag right → next; on the last scene a right drag wraps to scene 0.
    // Drag left → prev. Defer state update so framer's drag teardown
    // commits first.
    const wantsNext =
      offset > SWIPE_THRESHOLD_PX || velocity > VELOCITY_THRESHOLD;
    const wantsPrev =
      offset < -SWIPE_THRESHOLD_PX || velocity < -VELOCITY_THRESHOLD;
    if (wantsNext) {
      if (canNext) requestAnimationFrame(() => next());
      else if (isLastScene) requestAnimationFrame(() => jumpToStart());
    } else if (wantsPrev && canPrev) {
      requestAnimationFrame(() => prev());
    }
  };

  return (
    <div
      className="relative h-screen w-full overflow-hidden bg-washi-200"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Render in reverse story order — same as HorizontalStage's DOM:
          [scene 5, 4, 3, 2, 1] → DOM-leftmost is the deepest peek and the
          rightmost is the current card. Visual layout is unchanged
          (cards are absolutely positioned), but the DOM order now mirrors
          the horizontal-scroll panel order. */}
      {[...scenes].reverse().map((scene) => {
        const i = scenes.indexOf(scene);
        const distance = i - index;
        const isPast = distance < 0;
        const isCurrent = distance === 0;
        const isFuture = distance > 0;
        return (
          <motion.div
            key={scene.id}
            className={clsx(
              "absolute inset-0 flex origin-center will-change-transform",
              isCurrent
                ? "cursor-grab active:cursor-grabbing"
                : "pointer-events-none",
            )}
            initial={false}
            animate={{
              // Symmetric carousel positions:
              //   past   →  off-screen RIGHT (+115%, +4° tilt)
              //   current → centered (0, 0°)
              //   future  → off-screen LEFT (-115%, -4° tilt)
              // y/scale are pinned to the defaults explicitly so framer
              // doesn't carry over stale peek values (the previous
              // implementation animated them).
              x: isPast ? "115%" : isFuture ? "-115%" : 0,
              y: 0,
              scale: 1,
              rotate: isPast ? 4 : isFuture ? -4 : 0,
            }}
            // Stiff spring → snappy "all the way to the edge" feel rather
            // than a soft float.
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            style={{
              // Past cards are off-screen so z doesn't matter; below all
              // visible cards just in case. Current on top, futures below.
              zIndex: isPast ? 0 : 100 - distance,
              boxShadow: isCurrent
                ? "0 30px 70px -22px rgba(26,22,19,0.45), 0 10px 28px -10px rgba(26,22,19,0.22)"
                : "0 16px 36px -18px rgba(26,22,19,0.3)",
            }}
            drag={isCurrent ? "x" : false}
            dragMomentum={false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={isCurrent ? handleDragEnd : undefined}
            aria-hidden={!isCurrent}
          >
            <StoryScenePanel
              scene={scene}
              isLast={i === total - 1}
              index={i}
              total={total}
            />
          </motion.div>
        );
      })}

      {/* RTL nav: in the right-to-left story flow, "next" advances toward
          the LEFT and "prev" goes back toward the RIGHT. The arrow on
          each button points in the direction it sends the deck. */}
      <button
        type="button"
        onClick={isLastScene ? jumpToStart : next}
        // On the last scene the button repurposes itself as
        // "back to first" so the user can restart in one click without
        // dragging through every scene.
        aria-label={isLastScene ? "最初のシーンへ戻る" : "次のシーンへ"}
        className={clsx(
          "absolute left-4 top-1/2 z-[200] grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-sumi/70 text-washi-50 shadow-lg backdrop-blur transition-opacity duration-300 hover:bg-sumi sm:left-6 sm:h-14 sm:w-14",
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {isLastScene ? <RotateCcw size={20} /> : <ChevronLeft size={22} />}
      </button>

      <button
        type="button"
        onClick={prev}
        disabled={!canPrev}
        aria-label="前のシーンへ"
        className={clsx(
          "absolute right-4 top-1/2 z-[200] grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-sumi/70 text-washi-50 shadow-lg backdrop-blur transition-opacity duration-300 hover:bg-sumi disabled:cursor-not-allowed disabled:opacity-20 sm:right-6 sm:h-14 sm:w-14",
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronRight size={22} />
      </button>

      <div
        aria-hidden
        className={clsx(
          "pointer-events-none absolute bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-2 transition-opacity duration-300",
          // Visible only while the user is moving between scenes; idles
          // out after the index settles for ~1.5s.
          showIndicator ? "opacity-100" : "opacity-0",
        )}
      >
        {/* Indicator dots in reverse story order: 05, 04, 03, 02, 01
            from left to right. Scene 1 (the starting card) sits on the
            RIGHT, matching the RTL story flow — story progress moves the
            active dot leftward as the user advances. */}
        {[...scenes].reverse().map((s) => {
          const i = scenes.indexOf(s);
          return (
            <span
              key={s.id}
              className={clsx(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-8 bg-sumi" : "w-1.5 bg-sumi/30",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
