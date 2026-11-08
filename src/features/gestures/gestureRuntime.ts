import { FrameBus } from '@/lib/FrameBus';
import { handFrameBus } from '../hand-tracking/HandTrackingController';
import { useGestureSettings, useGestureStore } from '@/stores/gestureStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { GestureEngine } from './GestureEngine';
import type { GestureFrame, InteractionCommand } from './types';

const EMPTY: GestureFrame = { events: [], commands: [], states: {}, positions: {}, timestamp: 0 };

/** Every processed gesture frame. */
export const gestureFrameBus = new FrameBus<GestureFrame>(EMPTY);
/** Commands for the 3D interaction layer (Phase 4). Published only when a frame produced commands. */
export const commandBus = new FrameBus<InteractionCommand[]>([]);

const signature = (f: GestureFrame) =>
  (['Left', 'Right'] as const).map((h) => {
    const s = f.states[h];
    return s ? `${s.gesture}:${s.candidate}:${Math.round(s.confidence * 20)}:${Math.round(s.progress * 10)}` : '-';
  }).join('|');

/** Wires hand frames -> GestureEngine -> buses and the throttled UI store. */
export class GestureRuntime {
  private engine = new GestureEngine(useGestureSettings.getState());
  private offs: Array<() => void> = [];
  private lastSig = '';
  private lastPush = 0;

  start(): void {
    if (this.offs.length) return;
    this.engine.setConfig(useGestureSettings.getState());

    this.offs.push(
      handFrameBus.subscribe((frame) => {
        const now = performance.now();
        this.publish(this.engine.process(frame.hands, frame.aspect, now), now);
      }),
      useGestureSettings.subscribe((s) => this.engine.setConfig(s)),
      useTrackingStore.subscribe((s, prev) => {
        if (prev.tracker === 'ready' && s.tracker !== 'ready') {
          const now = performance.now();
          this.publish(this.engine.flush(now), now);
        }
      }),
    );
  }

  stop(): void {
    this.offs.forEach((off) => off());
    this.offs = [];
    this.publish(this.engine.flush(performance.now()), performance.now());
  }

  private publish(frame: GestureFrame, now: number): void {
    gestureFrameBus.publish(frame);
    if (frame.commands.length) commandBus.publish(frame.commands);

    const sig = signature(frame);
    const discrete = frame.commands.filter((c) => c.type !== 'drag' && c.type !== 'inspect').at(-1);
    if (sig !== this.lastSig || discrete || now - this.lastPush > 100) {
      if (sig !== this.lastSig || now - this.lastPush > 100) {
        this.lastSig = sig;
        this.lastPush = now;
        useGestureStore.getState().patch({ hands: frame.states });
      }
      if (discrete) useGestureStore.getState().patch({ lastCommand: { type: discrete.type, hand: discrete.hand, at: now } });
    }
  }
}

export const gestureRuntime = new GestureRuntime();
