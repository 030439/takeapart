import { useEffect, useRef } from 'react';
import { interactionBus } from './interactionBus';

/** DOM overlay showing where each hand points in the viewport. Updated outside React for zero re-renders. */
export function HandCursors() {
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = { Left: left.current, Right: right.current } as const;
    return interactionBus.subscribe((out) => {
      for (const h of ['Left', 'Right'] as const) {
        const el = els[h];
        const c = out.cursors[h];
        if (!el) continue;
        if (!c) { el.style.display = 'none'; continue; }
        el.style.display = 'block';
        el.style.left = `${(c.ndc.x + 1) * 50}%`;
        el.style.top = `${(1 - c.ndc.y) * 50}%`;
        el.dataset.g = c.gesture;
      }
    });
  }, []);

  const cls =
    'absolute hidden size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70 transition-colors ' +
    'data-[g=PINCH]:border-accent data-[g=PINCH]:bg-accent/50 data-[g=POINT]:border-sky-400 data-[g=POINT]:bg-sky-400/20';
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div ref={left} className={cls} />
      <div ref={right} className={cls} />
    </div>
  );
}
