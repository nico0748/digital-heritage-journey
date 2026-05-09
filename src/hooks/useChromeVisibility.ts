"use client";

import { useEffect, useState } from "react";

const HIDE_DELAY_MS = 2500;

/**
 * Auto-hide visibility for floating page chrome (audio toggle, settings
 * hamburger, paginated nav buttons). Returns `true` whenever there has
 * been pointer activity, OR keyboard focus has entered the document,
 * within the last HIDE_DELAY_MS.
 *
 * Wheel and arrow keys are intentionally NOT triggers — they're used
 * for scene navigation and would flash the on-screen chevron buttons
 * every advance. focusin (Tab navigation) IS a trigger so keyboard / AT
 * users can surface the chrome by tabbing; otherwise the buttons are
 * effectively unreachable for them after the inactivity timeout.
 *
 * Each consumer keeps its own timer, but all timers see the same global
 * events, so the controls fade in and out together.
 */
export function useChromeVisibility() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = () => {
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    };
    // Visible briefly on mount so the user can locate the controls,
    // then we let the inactivity timer fade them out.
    show();
    window.addEventListener("mousemove", show, { passive: true });
    window.addEventListener("touchstart", show, { passive: true });
    window.addEventListener("touchmove", show, { passive: true });
    // focusin bubbles through the DOM tree (Element → Document) but is
    // NOT a Window-level event per spec — listen on document.
    document.addEventListener("focusin", show);
    return () => {
      window.removeEventListener("mousemove", show);
      window.removeEventListener("touchstart", show);
      window.removeEventListener("touchmove", show);
      document.removeEventListener("focusin", show);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return visible;
}
