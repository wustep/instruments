// What the listener is hearing now, on the AudioContext clock. currentTime is where rendering has
// got to; the speakers lag it by the output latency, which is ~10 ms on a laptop and 150–250 ms
// over Bluetooth. getOutputTimestamp() says which context time was leaving the device at which
// performance.now() moment; from it, the context time being heard at any moment follows.
export interface ClockSource {
  currentTime: number;
  baseLatency?: number;
  outputLatency?: number;
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
}

/** the context time audible at performance time `nowMs` */
export function audibleTime(ctx: ClockSource, nowMs: number): number {
  const ts = ctx.getOutputTimestamp?.();
  if (ts && typeof ts.contextTime === 'number' && typeof ts.performanceTime === 'number' && ts.performanceTime > 0) {
    // never ahead of what has been rendered, never behind by more than a second (a stale stamp)
    const t = ts.contextTime + (nowMs - ts.performanceTime) / 1000;
    return Math.min(ctx.currentTime, Math.max(ctx.currentTime - 1, t));
  }
  return ctx.currentTime - (ctx.outputLatency ?? ctx.baseLatency ?? 0);
}
