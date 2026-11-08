/** Tiny pub/sub for high-frequency data. Subscribers run outside React, so no re-renders. */
export class FrameBus<T> {
  latest: T;
  private subs = new Set<(v: T) => void>();
  constructor(initial: T) { this.latest = initial; }
  publish(v: T): void {
    this.latest = v;
    this.subs.forEach((fn) => fn(v));
  }
  subscribe(fn: (v: T) => void): () => void {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }
}
