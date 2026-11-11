// A core run at twice the host's sample rate, its output brought down by a half-band low-pass.
//
// The flute at 22.05 kHz (a headset's rate): its top notes have periods of 11–20 samples, and its jet,
// whose delay is a fraction of a period, and its bore, a delay line of one round trip, cannot speak them
// there: 9 of its 74 notes from C♯6 up sounded another mode, 5–7 semitones high, and its voicing table did not
// converge (audio audit, rounds 1 and 2). Run at 44.1 kHz, where it was fitted and tuned, and decimated, it
// plays them as it does there. Everything the host asks of the core goes to the inner one; only the frames
// (×2 in, ÷2 out) and the audio are converted. The decimator is a windowed-sinc half-band FIR (Blackman, 95
// taps: flat to 0.4 of the host's Nyquist rate, −74 dB from its Nyquist rate on), so nothing above the host's
// band folds back; its delay is 47 inner samples (1.1 ms at 22.05 kHz).

import type { InstrumentCore } from './instrument.ts';

/** taps of the half-band low-pass (odd; the centre's neighbours at even distance are zero) */
const TAPS = 95;
/** the host frames rendered per pass (larger calls are taken in pieces: nothing allocated in process) */
const CHUNK = 512;

function halfband(): Float64Array {
  const h = new Float64Array(TAPS);
  const c = (TAPS - 1) / 2;
  let sum = 0;
  for (let i = 0; i < TAPS; i++) {
    const k = i - c;
    const sinc = k === 0 ? 0.5 : Math.sin((Math.PI * k) / 2) / (Math.PI * k);
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (TAPS - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (TAPS - 1));
    h[i] = sinc * w;
    sum += h[i];
  }
  for (let i = 0; i < TAPS; i++) h[i] /= sum;
  return h;
}

type Core = InstrumentCore & { process: (L: Float32Array, R: Float32Array, n: number) => void };

/** `make(rate)` builds the core at that rate; the result is used at `fs`, the inner core running at 2·fs */
export function oversampled<T extends Core>(make: (rate: number) => T, fs: number): T {
  const inner = make(2 * fs);
  const h = halfband();
  // the last TAPS inner samples of each channel, twice over (a ring read without wrapping)
  const hL = new Float64Array(2 * TAPS);
  const hR = new Float64Array(2 * TAPS);
  let pos = 0;
  const bL = new Float32Array(2 * CHUNK);
  const bR = new Float32Array(2 * CHUNK);
  const push = (x: number, y: number) => {
    hL[pos] = hL[pos + TAPS] = x;
    hR[pos] = hR[pos + TAPS] = y;
    pos = pos + 1 === TAPS ? 0 : pos + 1;
  };
  const process = (L: Float32Array | Float64Array, R: Float32Array | Float64Array, n: number): void => {
    for (let done = 0; done < n; ) {
      const m = Math.min(CHUNK, n - done);
      inner.process(bL, bR, 2 * m);
      for (let j = 0; j < m; j++) {
        push(bL[2 * j], bR[2 * j]);
        push(bL[2 * j + 1], bR[2 * j + 1]);
        // (the newest sample at pos − 1: the ring from pos holds the TAPS last, oldest first)
        let l = 0;
        let r = 0;
        for (let k = 0; k < TAPS; k++) {
          const c = h[k];
          if (c === 0) continue;
          l += c * hL[pos + k];
          r += c * hR[pos + k];
        }
        L[done + j] = l;
        R[done + j] = r;
      }
      done += m;
    }
  };
  return new Proxy(inner, {
    get(t, key) {
      switch (key) {
        case 'fs':
          return fs;
        case 'frame':
          return t.frame / 2;
        case 'outputFrame': {
          const o = (t as { outputFrame?: number }).outputFrame;
          return (o ?? t.frame) / 2;
        }
        case 'process':
          return process;
        case 'schedule':
          return (ev: unknown, frame?: number) => t.schedule(ev, frame === undefined ? undefined : 2 * frame);
        default: {
          // (getters run on the inner core itself: its own frames)
          const v = Reflect.get(t, key, t);
          return typeof v === 'function' ? v.bind(t) : v;
        }
      }
    },
    set(t, key, value) {
      if (key === 'frame') {
        t.frame = 2 * (value as number);
        return true;
      }
      return Reflect.set(t, key, value, t);
    },
  });
}
