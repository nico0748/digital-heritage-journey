"use client";

import { useEffect, useState } from "react";

const HIDE_DELAY_MS = 2500;

/**
 * Auto-hide visibility for floating page chrome (audio toggle, settings
 * hamburger, paginated nav buttons). Returns `true` whenever there has
 * been pointer/keyboard activity within the last HIDE_DELAY_MS.
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
    // Pointer-only triggers. Wheel / keydown / focus do NOT count as
    // activity — they're used for scene navigation and would flash the
    // on-screen chevron buttons every time the user advances.
    window.addEventListener("mousemove", show, { passive: true });
    window.addEventListener("touchstart", show, { passive: true });
    window.addEventListener("touchmove", show, { passive: true });
    return () => {
      window.removeEventListener("mousemove", show);
      window.removeEventListener("touchstart", show);
      window.removeEventListener("touchmove", show);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return visible;
}
