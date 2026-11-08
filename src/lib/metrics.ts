/** Rolling frames-per-second from tick timestamps (ms). */
export class FpsMeter {
  private times: number[] = [];
  constructor(private readonly window = 30) {}
  tick(nowMs: number): void {
    this.times.push(nowMs);
    if (this.times.length > this.window + 1) this.times.shift();
  }
  get fps(): number {
    const n = this.times.length;
    if (n < 2) return 0;
    const span = this.times[n - 1] - this.times[0];
    return span > 0 ? ((n - 1) * 1000) / span : 0;
  }
  reset(): void { this.times = []; }
}

export class RollingAverage {
  private values: number[] = [];
  constructor(private readonly window = 30) {}
  push(v: number): void {
    this.values.push(v);
    if (this.values.length > this.window) this.values.shift();
  }
  get value(): number {
    return this.values.length ? this.values.reduce((a, b) => a + b, 0) / this.values.length : 0;
  }
  reset(): void { this.values = []; }
}
