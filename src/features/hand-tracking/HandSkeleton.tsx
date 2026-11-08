import { useEffect, useRef } from 'react';
import { FINGERTIPS, HAND_CONNECTIONS, WRIST, type HandFrame } from './types';
import { handFrameBus } from './HandTrackingController';

const COLORS = { Left: '#34d399', Right: '#38bdf8' } as const;

/** Canvas overlay. Draws straight from the frame bus, so tracking never triggers React renders. */
export function HandSkeleton({ mirrored, visible }: { mirrored: boolean; visible: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const draw = ({ hands }: HandFrame) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!visible) return;
      const px = (x: number) => (mirrored ? 1 - x : x) * w;
      const py = (y: number) => y * h;

      for (const hand of hands) {
        const color = COLORS[hand.handedness];
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.moveTo(px(hand.landmarks[a].x), py(hand.landmarks[a].y));
          ctx.lineTo(px(hand.landmarks[b].x), py(hand.landmarks[b].y));
        }
        ctx.stroke();

        hand.landmarks.forEach((p, i) => {
          const tip = (FINGERTIPS as readonly number[]).includes(i);
          ctx.fillStyle = i === WRIST ? '#f8fafc' : color;
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), tip ? 4.5 : i === WRIST ? 5 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        });

        const wr = hand.landmarks[WRIST];
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`${hand.handedness} ${Math.round(hand.score * 100)}%`, px(wr.x) - 24, py(wr.y) + 18);
      }
    };

    draw(handFrameBus.latest);
    return handFrameBus.subscribe(draw);
  }, [mirrored, visible]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 size-full" />;
}
