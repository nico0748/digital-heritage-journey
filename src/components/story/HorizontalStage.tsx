"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { StoryScene } from "@/types/content";
import { StoryScenePanel } from "./StoryScenePanel";
import { ScrollHint } from "@/components/ui/ScrollHint";

gsap.registerPlugin(ScrollTrigger);

/**
 * Continuous horizontal scroll stage. Vertical wheel/scroll is mapped to
 * horizontal panel travel via a pinned ScrollTrigger.
 *
 * Mode-gating (which devices see this vs. PaginatedStage) lives in
 * StoryStage — this component just runs the horizontal animation whenever
 * it is mounted.
 */
export function HorizontalStage({ scenes }: { scenes: StoryScene[] }) {
  // The outer wrapping div in the JSX below is a React-owned "fence" that
  // is never pinned. GSAP's `pin: true` wraps the pinned element in a
  // "pinSpacer" div, which moves the pinned node into the spacer at
  // runtime. If React's reconciler then tries to remove that node from
  // what it *thinks* is the parent, it hits
  //   `NotFoundError: The object can not be found here`.
  // Keeping the pin target one level inside the fence means React only
  // ever removes the fence, whose DOM parent never changes.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Japanese picture book order: scene 1 is read first, on the right.
  // Render DOM in reverse so scene 1 sits at the rightmost position
  // while the flex container stays in default (row) direction — this
  // keeps `scrollWidth` and transform math unambiguous across browsers.
  const domOrder = [...scenes]
    .map((scene, storyIndex) => ({ scene, storyIndex }))
    .reverse();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const stage = stageRef.current;
    if (!wrapper || !stage) return;

    let ctaObserver: IntersectionObserver | null = null;

    const ctx = gsap.context(() => {
      const panels = gsap.utils.toArray<HTMLElement>(".story-panel", stage);
      const scrollDistance = () => stage.scrollWidth - window.innerWidth;

      // Initial position: shifted fully left so the rightmost panel
      // (scene 1) is what the viewer first sees.
      gsap.set(stage, { x: () => -scrollDistance() });

      const tween = gsap.fromTo(
        stage,
        { x: () => -scrollDistance() },
        {
          x: 0,
          ease: "none",
          immediateRender: true,
          scrollTrigger: {
            trigger: wrapper,
            pin: true,
            start: "top top",
            end: () => `+=${scrollDistance()}`,
            // Slightly higher scrub damps trackpad jitter without making
            // mouse-wheel travel feel laggy.
            scrub: 1,
            invalidateOnRefresh: true,
            onRefresh: () => {
              if (window.scrollY === 0) {
                gsap.set(stage, { x: -scrollDistance() });
              }
            },
          },
        },
      );

      // Per-panel inner reveal. With right-to-left flow, the panel's
      // RIGHT edge is the leading edge.
      panels.forEach((panel) => {
        const inners = panel.querySelectorAll<HTMLElement>("[data-reveal]");
        if (inners.length === 0) return;
        gsap.from(inners, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: panel,
            containerAnimation: tween,
            start: "right 80%",
            end: "left 20%",
            toggleActions: "play reverse play reverse",
          },
        });
      });

      // CTA on the leftmost panel (scene 5) is unreliable to fade in via
      // a panel-level ScrollTrigger because the pin-spacer + reversed DOM
      // make trigger position math edge-case-prone. IntersectionObserver
      // on the panel itself bypasses all that — it just reports when the
      // panel is more than half in the viewport, which is the cue we
      // actually want.
      const cta = stage.querySelector<HTMLElement>("[data-cta]");
      const ctaPanel = cta?.closest<HTMLElement>(".story-panel");
      if (cta && ctaPanel) {
        gsap.set(cta, { opacity: 0, y: 30 });
        let isVisible = false;
        ctaObserver = new IntersectionObserver(
          ([entry]) => {
            if (!entry) return;
            // Only show once the panel almost entirely fills the
            // viewport — the user is essentially "on" scene 5 by then.
            const shouldShow = entry.intersectionRatio > 0.85;
            if (shouldShow === isVisible) return;
            isVisible = shouldShow;
            gsap.to(cta, {
              opacity: shouldShow ? 1 : 0,
              y: shouldShow ? 0 : 30,
              duration: shouldShow ? 0.7 : 0.3,
              ease: shouldShow ? "power3.out" : "power2.in",
              overwrite: true,
            });
          },
          { threshold: [0, 0.85, 1] },
        );
        ctaObserver.observe(ctaPanel);
      }

      if (document.fonts?.ready) {
        document.fonts.ready.then(() => ScrollTrigger.refresh());
      }
    }, wrapper);

    return () => {
      ctaObserver?.disconnect();
      ctx.revert();
    };
  }, [scenes]);

  return (
    <div className="relative w-full">
      <div
        ref={wrapperRef}
        className="stage-wrapper relative h-screen w-full overflow-hidden"
      >
        <div ref={stageRef} className="stage flex h-screen flex-row">
          {domOrder.map(({ scene, storyIndex }) => (
            <StoryScenePanel
              key={scene.id}
              scene={scene}
              isLast={storyIndex === scenes.length - 1}
              index={storyIndex}
              total={scenes.length}
            />
          ))}
        </div>
        <ScrollHint />
      </div>
    </div>
  );
}
