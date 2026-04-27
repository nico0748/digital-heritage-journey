"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { StoryScene } from "@/types/content";
import { StoryScenePanel } from "./StoryScenePanel";
import { ScrollHint } from "@/components/ui/ScrollHint";

gsap.registerPlugin(ScrollTrigger);

export function HorizontalStage({ scenes }: { scenes: StoryScene[] }) {
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

    const mm = gsap.matchMedia();

    mm.add("(min-width: 768px)", () => {
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
            scrub: 0.6,
            invalidateOnRefresh: true,
            onRefresh: () => {
              // Force the stage back to its start position on every
              // refresh (resize, font load, etc.) so the first paint
              // always shows scene 1 on the right.
              if (window.scrollY === 0) {
                gsap.set(stage, { x: -scrollDistance() });
              }
            },
          },
        },
      );

      // Per-panel inner reveal. With right-to-left flow, the panel's
      // RIGHT edge is the leading edge (panels slide in from the left
      // side of the viewport). "right 80%" fires while the panel is
      // entering and about to center — earlier and symmetric to the
      // natural "left 70%" used in conventional L→R scroll stages.
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

      // Recalc after fonts finish loading (avoids scrollWidth drift).
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => ScrollTrigger.refresh());
      }

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    });

    // Mobile: stack vertically, no horizontal transform.
    mm.add("(max-width: 767px)", () => {
      gsap.set(stage, { clearProps: "transform" });
    });

    return () => mm.revert();
  }, [scenes]);

  return (
    <div
      ref={wrapperRef}
      className="stage-wrapper relative w-full md:h-screen md:overflow-hidden"
    >
      <div
        ref={stageRef}
        className="stage md:flex-row flex-col md:h-screen"
      >
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
  );
}
