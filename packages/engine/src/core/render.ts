// Offline rendering with the pure DSP core (Node, tests, calibration, demos).

import { type CoreOptions, PianoCore, type PianoEvent } from './piano-core.ts';

export interface TimedEvent {
  /** seconds from the start of the render */
  time: number;
  event: PianoEvent;
}

export interface RenderResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  core: PianoCore;
  /** wall-clock milliseconds spent in process() */
  cpuMs: number;
}

export function renderCore(
  opts: CoreOptions & { events: TimedEvent[]; duration: number; quantum?: number; core?: PianoCore },
): RenderResult {
  const core = opts.core ?? new PianoCore(opts);
  const fs = core.fs;
  const n = Math.ceil(opts.duration * fs);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const base = core.frame;
  for (const e of opts.events) core.schedule(e.event, base + Math.round(e.time * fs));
  const q = opts.quantum ?? 128;
  const bl = new Float32Array(q);
  const br = new Float32Array(q);
  const t0 = performance.now();
  for (let i = 0; i < n; i += q) {
    const len = Math.min(q, n - i);
    core.process(bl, br, len);
    left.set(len === q ? bl : bl.subarray(0, len), i);
    right.set(len === q ? br : br.subarray(0, len), i);
  }
  const cpuMs = performance.now() - t0;
  return { left, right, sampleRate: fs, core, cpuMs };
}

/** Convenience: one note, optionally released. */
export function renderNote(
  midi: number,
  velocity: number,
  duration: number,
  opts: Partial<CoreOptions> & { release?: number; sustain?: number } = {},
): RenderResult {
  const events: TimedEvent[] = [];
  if (opts.sustain !== undefined) events.push({ time: 0, event: { type: 'sustain', value: opts.sustain } });
  events.push({ time: 0.01, event: { type: 'noteOn', midi, velocity } });
  if (opts.release !== undefined) events.push({ time: opts.release, event: { type: 'noteOff', midi } });
  return renderCore({ sampleRate: 48000, ...opts, events, duration });
}
