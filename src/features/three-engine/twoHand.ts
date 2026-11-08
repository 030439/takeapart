import type { Ndc } from './handMapping';

const wrap = (a: number) => {
  let d = a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/** Per-frame change in the line between two hands: distance ratio and twist angle. */
export class TwoHandTracker {
  private prevDist = 0;
  private prevAngle = 0;

  start(a: Ndc, b: Ndc, aspect: number): void {
    this.prevDist = Math.hypot((b.x - a.x) * aspect, b.y - a.y);
    this.prevAngle = Math.atan2(b.y - a.y, (b.x - a.x) * aspect);
  }

  /** `scale` > 1 when the hands move apart. `twist` > 0 is counter-clockwise on screen. */
  update(a: Ndc, b: Ndc, aspect: number): { scale: number; twist: number } {
    const dist = Math.hypot((b.x - a.x) * aspect, b.y - a.y);
    const angle = Math.atan2(b.y - a.y, (b.x - a.x) * aspect);
    const scale = this.prevDist > 1e-3 && dist > 1e-3 ? Math.min(2, Math.max(0.5, dist / this.prevDist)) : 1;
    const twist = wrap(angle - this.prevAngle);
    this.prevDist = dist;
    this.prevAngle = angle;
    return { scale, twist };
  }
}
