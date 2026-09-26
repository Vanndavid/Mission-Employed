import React, { useEffect, useRef } from 'react';

/**
 * A few bars that move with the microphone, so the candidate can see they are
 * being heard. Reads a ref from its own animation loop rather than taking the
 * level as a prop: it changes every frame, and re-rendering the screen at 60fps
 * to move five bars is not worth it.
 */

/** Bars react at different rates so the group reads as a voice, not a gauge. */
const BAR_WEIGHTS = [0.55, 0.9, 1.35, 0.9, 0.55];

export function LevelMeter({ levelRef, active }: { levelRef: React.RefObject<number>; active: boolean }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!active) return;

    let frame = requestAnimationFrame(function draw() {
      const level = levelRef.current;

      barsRef.current.forEach((bar, index) => {
        if (!bar) return;
        const height = 0.18 + Math.min(1, level * BAR_WEIGHTS[index]) * 0.82;
        bar.style.transform = `scaleY(${height.toFixed(3)})`;
      });

      frame = requestAnimationFrame(draw);
    });

    return () => cancelAnimationFrame(frame);
  }, [active, levelRef]);

  return (
    <div aria-hidden="true" className="flex h-10 items-center justify-center gap-1.5">
      {BAR_WEIGHTS.map((_, index) => (
        <span
          key={index}
          ref={node => {
            barsRef.current[index] = node;
          }}
          className="h-10 w-1.5 origin-center rounded-full bg-rose-500 transition-none"
          style={{ transform: 'scaleY(0.18)' }}
        />
      ))}
    </div>
  );
}
