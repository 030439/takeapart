import type { Handedness } from '../hand-tracking/types';
import { useGestureSettings, useGestureStore } from '@/stores/gestureStore';
import type { GestureType } from './types';

const LABEL: Record<GestureType, string> = { PINCH: 'Pinch', POINT: 'Point', OPEN_PALM: 'Open palm', FIST: 'Fist', NONE: 'None' };

function HandRow({ hand }: { hand: Handedness }) {
  const st = useGestureStore((s) => s.hands[hand]);
  const active = st && st.gesture !== 'NONE';
  const pending = st && !active && st.candidate !== 'NONE' && st.progress > 0 && st.progress < 1;
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span className="text-mute">{hand} hand</span>
        <span className={active ? 'text-accent2' : ''}>
          {!st ? 'Not detected' : active ? `${LABEL[st.gesture]} ${Math.round(st.confidence * 100)}%` : pending ? `Hold ${LABEL[st.candidate]}…` : 'None'}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded bg-surface" role="presentation">
        <div
          className="h-full bg-accent transition-[width] duration-100"
          style={{ width: `${st ? Math.round((active ? st.confidence : pending ? st.progress : 0) * 100) : 0}%` }}
        />
      </div>
    </div>
  );
}

export function GesturePanel() {
  const last = useGestureStore((s) => s.lastCommand);
  const { sensitivity, minConfidence, set } = useGestureSettings();
  return (
    <section className="rounded-xl border border-white/10 bg-card p-3">
      <h3 className="mb-2 text-sm font-medium">Gestures</h3>
      <div className="flex flex-col gap-2">
        <HandRow hand="Left" />
        <HandRow hand="Right" />
      </div>
      <p className="mt-3 text-xs text-mute">
        Last command: <span className="text-ink">{last ? `${last.type} (${last.hand})` : 'none'}</span>
      </p>
      <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 text-xs">
        <label className="flex items-center justify-between gap-3">
          <span className="text-mute">Sensitivity</span>
          <input type="range" min={0} max={1} step={0.05} value={sensitivity} className="w-28 accent-accent" onChange={(e) => set({ sensitivity: +e.target.value })} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-mute">Min confidence</span>
          <input type="range" min={0.3} max={0.95} step={0.05} value={minConfidence} className="w-28 accent-accent" onChange={(e) => set({ minConfidence: +e.target.value })} />
        </label>
        <p className="text-[11px] text-mute">Pinch to grab, point to inspect, hold an open palm to assemble, hold a fist to explode.</p>
      </div>
    </section>
  );
}
