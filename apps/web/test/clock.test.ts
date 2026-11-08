import { describe, expect, it } from 'vitest';
import { audibleTime } from '../src/clock.ts';

describe('audible time (output-timestamp playhead)', () => {
  it('follows the output timestamp: Bluetooth-like latency puts what is heard 0.2 s behind rendering', () => {
    // at performance time 1000 ms, context time 4.8 s was leaving the device; rendering is at 5.0 s
    const ctx = { currentTime: 5.0, getOutputTimestamp: () => ({ contextTime: 4.8, performanceTime: 1000 }) };
    expect(audibleTime(ctx, 1000)).toBeCloseTo(4.8, 6);
    expect(audibleTime(ctx, 1100)).toBeCloseTo(4.9, 6);
    // never ahead of rendering
    expect(audibleTime(ctx, 2000)).toBeCloseTo(5.0, 6);
  });
  it('without a timestamp, uses the reported output latency', () => {
    expect(audibleTime({ currentTime: 3, outputLatency: 0.15 }, 0)).toBeCloseTo(2.85, 6);
    expect(audibleTime({ currentTime: 3, baseLatency: 0.01 }, 0)).toBeCloseTo(2.99, 6);
    expect(audibleTime({ currentTime: 3 }, 0)).toBe(3);
  });
  it('ignores an empty stamp (before the context has run)', () => {
    expect(audibleTime({ currentTime: 0.5, outputLatency: 0.1, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) }, 1234)).toBeCloseTo(0.4, 6);
  });
});
