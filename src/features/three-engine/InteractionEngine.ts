import type { Handedness } from '../hand-tracking/types';
import type { GestureFrame, GestureType, Vec3 } from '../gestures/types';
import { CursorFilter, handToNdc, type Ndc } from './handMapping';
import { TwoHandTracker } from './twoHand';

/** Everything the interaction logic needs from the 3D scene. Implemented for Three.js; mocked in tests. */
export interface SceneAdapter {
  /** Component under the cursor, or null. */
  pick(ndc: Ndc): string | null;
  /** Point where the cursor ray meets a view-facing plane through `through`. */
  planePoint(ndc: Ndc, through: Vec3): Vec3 | null;
  partWorldPosition(id: string): Vec3 | null;
  setPartWorldPosition(id: string, p: Vec3): void;
  /** Multiplicative change; the adapter clamps the total. */
  scalePart(id: string, factor: number): void;
  /** Drag deltas in radians: x spins the model about the vertical axis, y tilts it. */
  rotateModel(dragX: number, dragY: number): void;
  /** Counter-clockwise (on screen) rotation about the view axis. */
  twistModel(rad: number): void;
  /** ratio > 1 zooms in. */
  zoomCamera(ratio: number): void;
  selectedPart(): string | null;
  select(id: string | null): void;
  hover(id: string | null): void;
  /** Current explosion target, 0..1. */
  getExplode(): number;
  setExplode(v: number): void;
  /** Assemble: restore the original pose (explosion, moved parts, scales, rotation). */
  resetPose(): void;
}

export interface InteractionConfig {
  enabled: boolean;
  gain: number;
  margin: number;
  mirrorX: boolean;
  cursorSmoothing: number;
  /** Radians of model rotation per full-viewport hand sweep unit. */
  rotateSpeed: number;
  /** Viewport width / height, used to keep two-hand angles correct. */
  viewAspect: number;
  /** A point must be held this long (ms) before it selects, so two-hand explosion control can claim it first. */
  pointSelectDelayMs: number;
  /** Explosion change per unit of hand spread (aspect-corrected NDC). */
  explodeGain: number;
}

export const DEFAULT_INTERACTION_CONFIG: InteractionConfig = {
  enabled: true, gain: 1, margin: 0.1, mirrorX: true, cursorSmoothing: 0.4, rotateSpeed: 2, viewAspect: 1.6,
  pointSelectDelayMs: 200, explodeGain: 1,
};

export type InteractionMode = 'idle' | 'inspecting' | 'dragging' | 'rotating' | 'two-hand' | 'exploding';

export interface InteractionOutput {
  cursors: Partial<Record<Handedness, { ndc: Ndc; gesture: GestureType }>>;
  mode: InteractionMode;
  /** Part id for dragging, or the scaled part for two-hand (null = camera zoom). */
  detail: string | null;
}

export const IDLE_OUTPUT: InteractionOutput = { cursors: {}, mode: 'idle', detail: null };

interface HandCtl { mode: 'idle' | 'inspect' | 'drag' | 'rotate' | 'locked'; partId?: string; anchor?: Vec3; offset?: Vec3; last?: Ndc; selectAt?: number }

const HANDS: Handedness[] = ['Left', 'Right'];
const otherOf = (h: Handedness): Handedness => (h === 'Left' ? 'Right' : 'Left');

/**
 * Turns gesture frames into scene manipulation:
 * pinch on a part drags it (grab offset preserved), pinch on empty space rotates the model,
 * point inspects and selects, two pinching hands zoom/scale and twist, two pointing hands set the explosion
 * amount by their spread, fist explodes fully, open palm assembles.
 */
export class InteractionEngine {
  private ctl: Record<Handedness, HandCtl> = { Left: { mode: 'idle' }, Right: { mode: 'idle' } };
  private ndc: Partial<Record<Handedness, Ndc>> = {};
  private pinching = new Set<Handedness>();
  private pointing = new Set<Handedness>();
  private filter = new CursorFilter();
  private two = new TwoHandTracker();
  private twoActive = false;
  private hovering = false;
  private explodeActive = false;
  private explodeStart = { dist: 0, level: 0 };
  private now = 0;

  constructor(private readonly adapter: SceneAdapter, private cfg: InteractionConfig = DEFAULT_INTERACTION_CONFIG) {}

  setConfig(patch: Partial<InteractionConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  process(frame: GestureFrame): InteractionOutput {
    if (!this.cfg.enabled) {
      this.cancelAll();
      return IDLE_OUTPUT;
    }
    const a = this.adapter;
    this.now = frame.timestamp;
    const cursors: InteractionOutput['cursors'] = {};
    this.ndc = {};
    for (const h of HANDS) {
      const p = frame.positions[h];
      const st = frame.states[h];
      if (!p || !st) { this.filter.reset(h); continue; }
      const n = this.filter.smooth(h, handToNdc(p, this.cfg), this.cfg.cursorSmoothing);
      this.ndc[h] = n;
      cursors[h] = { ndc: n, gesture: st.gesture };
    }

    for (const e of frame.events) {
      if (e.gesture === 'PINCH') {
        if (e.phase === 'start') this.pinchStart(e.hand);
        else if (e.phase === 'end') this.pinchEnd(e.hand);
      } else if (e.gesture === 'POINT') {
        if (e.phase === 'start') this.pointStart(e.hand);
        else if (e.phase === 'end') this.pointEnd(e.hand);
      }
    }
    for (const c of frame.commands) {
      if (c.type === 'assemble') a.resetPose();
      else if (c.type === 'explode') a.setExplode(1);
    }

    if (this.twoActive) {
      const l = this.ndc.Left, r = this.ndc.Right;
      if (l && r) {
        const { scale, twist } = this.two.update(l, r, this.cfg.viewAspect);
        const sel = a.selectedPart();
        if (Math.abs(scale - 1) > 1e-6) {
          if (sel) a.scalePart(sel, scale);
          else a.zoomCamera(scale);
        }
        if (Math.abs(twist) > 1e-6) a.twistModel(twist);
      }
    } else if (this.explodeActive) {
      const l = this.ndc.Left, r = this.ndc.Right;
      if (l && r) {
        const level = this.explodeStart.level + (this.spread(l, r) - this.explodeStart.dist) * this.cfg.explodeGain;
        a.setExplode(Math.min(1, Math.max(0, level)));
      }
    } else {
      for (const h of HANDS) {
        const c = this.ctl[h];
        const p = this.ndc[h];
        if (!p) continue;
        if (c.mode === 'drag' && c.partId && c.anchor && c.offset) {
          const q = a.planePoint(p, c.anchor);
          if (q) a.setPartWorldPosition(c.partId, { x: q.x + c.offset.x, y: q.y + c.offset.y, z: q.z + c.offset.z });
        } else if (c.mode === 'rotate' && c.last) {
          const dx = p.x - c.last.x, dy = p.y - c.last.y;
          if (dx !== 0 || dy !== 0) a.rotateModel(dx * this.cfg.rotateSpeed, dy * this.cfg.rotateSpeed);
          c.last = p;
        } else if (c.mode === 'inspect') {
          const id = a.pick(p);
          a.hover(id);
          this.hovering = true;
          if (c.selectAt !== undefined && this.now >= c.selectAt) {
            if (id) a.select(id);
            c.selectAt = undefined;
          }
        }
      }
    }
    return { cursors, ...this.summary() };
  }

  /** Drops every in-progress interaction (camera stopped, hand control disabled, model changed). */
  cancelAll(): void {
    this.ctl = { Left: { mode: 'idle' }, Right: { mode: 'idle' } };
    this.pinching.clear();
    this.pointing.clear();
    this.twoActive = false;
    this.explodeActive = false;
    this.filter.reset();
    if (this.hovering) { this.adapter.hover(null); this.hovering = false; }
  }

  private pinchStart(h: Handedness): void {
    const o = otherOf(h);
    this.pinching.add(h);
    const l = this.ndc.Left, r = this.ndc.Right;
    if (this.pinching.has(o) && l && r) {
      // Second pinch: switch to two-hand control. The first hand's drag or rotation just stops.
      this.ctl[h] = { mode: 'locked' };
      this.ctl[o] = { mode: 'locked' };
      this.two.start(l, r, this.cfg.viewAspect);
      this.twoActive = true;
      return;
    }
    const p = this.ndc[h];
    if (!p) { this.ctl[h] = { mode: 'locked' }; return; }
    const id = this.adapter.pick(p);
    if (id) {
      this.adapter.select(id);
      const w = this.adapter.partWorldPosition(id);
      const q = w && this.adapter.planePoint(p, w);
      if (w && q) {
        this.ctl[h] = { mode: 'drag', partId: id, anchor: w, offset: { x: w.x - q.x, y: w.y - q.y, z: w.z - q.z } };
        return;
      }
    }
    this.ctl[h] = { mode: 'rotate', last: p };
  }

  private pinchEnd(h: Handedness): void {
    this.pinching.delete(h);
    if (this.twoActive) {
      this.twoActive = false;
      const o = otherOf(h);
      // The remaining hand must release and pinch again before it can drag, so nothing jumps.
      if (this.pinching.has(o)) this.ctl[o] = { mode: 'locked' };
    }
    this.ctl[h] = { mode: 'idle' };
  }

  private spread(l: Ndc, r: Ndc): number {
    return Math.hypot((r.x - l.x) * this.cfg.viewAspect, r.y - l.y);
  }

  private pointStart(h: Handedness): void {
    const o = otherOf(h);
    this.pointing.add(h);
    const l = this.ndc.Left, r = this.ndc.Right;
    if (this.pointing.has(o) && l && r && !this.twoActive) {
      // Both hands pointing: explosion control. Neither hand selects anything.
      this.ctl[h] = { mode: 'locked' };
      this.ctl[o] = { mode: 'locked' };
      if (this.hovering) { this.adapter.hover(null); this.hovering = false; }
      this.explodeStart = { dist: this.spread(l, r), level: this.adapter.getExplode() };
      this.explodeActive = true;
      return;
    }
    this.ctl[h] = { mode: 'inspect', selectAt: this.now + this.cfg.pointSelectDelayMs };
  }

  private pointEnd(h: Handedness): void {
    this.pointing.delete(h);
    if (this.explodeActive) {
      this.explodeActive = false;
      const o = otherOf(h);
      if (this.pointing.has(o)) this.ctl[o] = { mode: 'locked' };
    }
    this.ctl[h] = { mode: 'idle' };
    if (this.pointing.size === 0 && this.hovering) { this.adapter.hover(null); this.hovering = false; }
  }

  private summary(): { mode: InteractionMode; detail: string | null } {
    if (this.twoActive) return { mode: 'two-hand', detail: this.adapter.selectedPart() };
    if (this.explodeActive) return { mode: 'exploding', detail: null };
    for (const h of HANDS) if (this.ctl[h].mode === 'drag') return { mode: 'dragging', detail: this.ctl[h].partId ?? null };
    for (const h of HANDS) if (this.ctl[h].mode === 'rotate') return { mode: 'rotating', detail: null };
    for (const h of HANDS) if (this.ctl[h].mode === 'inspect') return { mode: 'inspecting', detail: null };
    return { mode: 'idle', detail: null };
  }
}
