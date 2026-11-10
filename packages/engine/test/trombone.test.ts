// The trombone (core/trombone.ts): the slide chart for its three sizes (the F valve for what the slide alone
// plays in sixth or seventh position, pedal notes below), the bore's resonances (a closed cylinder's odd
// series turned by the bell and the mouthpiece into nearly 2, 3, 4 … × a pedal that is not itself a
// resonance, the first far below it), concert pitch across each size's compass, every note on its own
// partial at pp, mf and ff (pedals too), the slide moving at a player's speed (a soft legato tongue while it
// travels; a glissando when asked), louder and brighter with velocity, the size changed in place, a second
// player its own (blocksize.test covers the host's block size).
import { describe, expect, it } from 'vitest';
import { renderInstrument, TromboneCore, TROMBONE_SIZES, tromboneFingering, tromboneSlideOut, tromboneTubeLength } from '../src/core/index.ts';
import { regime } from '../../../scripts/trombone-regimes.ts';
import { measureCents } from '../../../scripts/tune-trombone.ts';

const FS = 48000;
const render = (m: number, vel: number, dur = 1.2, params: object = {}, player?: number) =>
  renderInstrument({ sampleRate: FS, instrument: 'trombone', dry: true, params: { vibrato: 0, ...params } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: vel } }] as never, duration: dur, player }).left;
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  const i0 = Math.round(a * FS);
  const i1 = Math.round(b * FS);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-20);
};
/** the spectral centroid of 0.7–1.1 s (Hz), over the note's first 24 harmonics */
const centroid = (x: Float32Array, m: number) => {
  const f = 440 * 2 ** ((m - 69) / 12);
  const W = Math.round(0.4 * FS);
  const s0 = Math.round(0.7 * FS);
  let num = 0;
  let den = 0;
  for (let k = 1; k <= 24 && k * f < 0.45 * FS; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < W; i++) {
      const hw = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
      re += x[s0 + i] * hw * Math.cos((2 * Math.PI * k * f * i) / FS);
      im += x[s0 + i] * hw * Math.sin((2 * Math.PI * k * f * i) / FS);
    }
    const p = re * re + im * im;
    num += k * f * p;
    den += p;
  }
  return num / den;
};

describe('trombone', () => {
  it('the slide chart: the F valve for the long positions, pedals below, each size its own', () => {
    const f = (m: number, size: 'alto' | 'tenor' | 'bass' = 'tenor') => {
      const x = tromboneFingering(m, size);
      return `${x.side === 'Bb' || x.side === 'Eb' ? '' : x.side}${x.position}/${x.partial}`;
    };
    // tenor: E2 T2, F2 T1, B♭2 1, B2 T2, C3 T1, F3 1, G3 4, B♭3 1, B3 4, D4 1, E♭4 3, F4 1, G4 4, B♭4 1, C5 1,
    // D5 1, F5 1; the pedal B♭1 in first, E1 on the F side in second; low B past the seventh on the F side
    expect([40, 41, 46, 47, 48, 53, 55, 58, 59, 62, 63, 65, 67, 70, 72, 74, 77].map((m) => f(m))).toEqual(['F2/2', 'F1/2', '1/2', 'F2/3', 'F1/3', '1/3', '4/4', '1/4', '4/5', '1/5', '3/6', '1/6', '4/8', '1/8', '1/9', '1/10', '1/12']);
    expect([34, 33, 29, 28, 35].map((m) => f(m))).toEqual(['1/1', '2/1', 'F1/1', 'F2/1', 'F7/2']);
    // bass: its pedal B♭ in first, B1–D2 on both valves (D), C1 the D side's pedal in third
    expect([34, 35, 36, 38, 24, 26].map((m) => f(m, 'bass'))).toEqual(['1/1', 'D4/2', 'D3/2', 'D1/2', 'D3/1', 'D1/1']);
    // alto in E♭: no valve, the seventh position its low A
    expect([45, 51, 58, 63, 79].map((m) => f(m, 'alto'))).toEqual(['7/2', '1/2', '1/3', '1/4', '1/10']);
    // every note of every compass has a fingering, and it is that note
    for (const size of ['alto', 'tenor', 'bass'] as const) {
      const B = TROMBONE_SIZES[size];
      for (let m = B.lo; m <= B.hi; m++) {
        const x = tromboneFingering(m, size);
        expect(B.pedal - x.sideLower - x.lower + Math.round(12 * Math.log2(x.partial)), `${size} ${m}`).toBe(m);
      }
    }
    // the tube: 2.74 m in first position, the F valve a fourth longer; the slide's seventh position 0.57 m out
    expect(tromboneTubeLength(tromboneFingering(58))).toBeCloseTo(2.74, 2);
    expect(tromboneTubeLength(tromboneFingering(48))).toBeCloseTo(2.74 * 2 ** (5 / 12), 2);
    expect(tromboneSlideOut({ side: 'Bb', valves: [], position: 7, sideLower: 0, lower: 6, partial: 2 })).toBeCloseTo(0.567, 2);
  });

  it('the bore: the bell and the mouthpiece turn a cylinder’s odd series into nearly 2, 3, 4 … × the pedal', () => {
    for (const [size, m] of [['tenor', 58], ['bass', 46], ['alto', 63]] as const) {
      const c = new TromboneCore({ sampleRate: 44100, dry: true, params: { size } });
      c.schedule({ type: 'noteOn', midi: m, velocity: 70 }, 0);
      c.process(new Float32Array(128), new Float32Array(128), 128);
      const fb = (440 * 2 ** ((m - 69) / 12)) / tromboneFingering(m, size).partial;
      const r = c.resonances(8).map((f) => f / fb);
      // the first resonance far under the pedal (a closed cylinder's would be a third of the second's)
      expect(r[0], `${size} first`).toBeGreaterThan(0.6);
      expect(r[0], `${size} first`).toBeLessThan(0.8);
      // the 2nd … 8th within 3 % of 2 … 8 (a closed cylinder's: 3, 5, 7 … × its first)
      for (let n = 2; n <= 8; n++) expect(Math.abs(r[n - 1] / n - 1), `${size} ${n}`).toBeLessThan(0.03);
    }
  });

  it('plays at concert pitch in each size’s compass (within 6 ¢ at 44.1 and 48 kHz), pedals included', () => {
    for (const fs of [44100, 48000])
      for (const [size, notes] of [['tenor', [28, 34, 40, 46, 53, 58, 65, 70, 77]], ['bass', [24, 34, 41, 52]], ['alto', [45, 58, 70, 77]]] as const)
        for (const m of notes) expect(Math.abs(measureCents(fs, m, size)), `${size} ${m} @${fs}`).toBeLessThan(6);
  });

  it('every note on its own partial at pp, mf and ff (not the neighbour a tone away; the pedals too)', () => {
    for (const [size, notes] of [['tenor', [29, 34, 40, 47, 52, 58, 63, 67, 70]], ['bass', [26, 31, 35, 43, 55]], ['alto', [45, 56, 66, 73]]] as const)
      for (const m of notes) for (const vel of [30, 70, 112]) expect(regime(m, vel, 44100, size, undefined, 1.2), `${size} ${m} v${vel}`).toBe('1');
  });

  it('a slur: the slide travels at a player’s speed under a soft tongue; asked to glide, a glissando', () => {
    const slur = (gliss: number) => {
      const c = new TromboneCore({ sampleRate: FS, dry: true, params: { vibrato: 0, gliss } });
      const L = new Float32Array(128);
      const R = new Float32Array(128);
      // B♭3 in first, then G3 in fourth, slurred (the B♭ held into the G)
      c.schedule({ type: 'noteOn', midi: 58, velocity: 80 }, 0);
      c.schedule({ type: 'noteOn', midi: 55, velocity: 80 }, Math.round(0.6 * FS));
      c.schedule({ type: 'noteOff', midi: 58 }, Math.round(0.6 * FS) + 1);
      const slide: number[] = [];
      const level: number[] = [];
      for (let b = 0; b < Math.round((1.2 * FS) / 128); b++) {
        c.process(L, R, 128);
        let s = 0;
        for (let i = 0; i < 128; i++) s += L[i] * L[i];
        level.push(s / 128);
        slide.push((c.getVisual() as { trombone: { slide: number } }).trombone.slide);
      }
      const at = (t: number) => Math.round((t * FS) / 128);
      return { slide, level, at };
    };
    const t = slur(0);
    // first position, then fourth: 0.26 m out, reached in about 0.1 s (a slide's 3–4 m/s), not at once
    expect(Math.abs(t.slide[t.at(0.55)])).toBeLessThan(0.02);
    expect(t.slide[t.at(0.6) + 2]).toBeLessThan(0.2);
    expect(t.slide[t.at(0.8)]).toBeGreaterThan(0.23);
    expect(t.slide[t.at(0.8)]).toBeLessThan(0.29);
    // the legato tongue: the sound dips while the slide moves, and is back after
    const mean = (xs: number[], a: number, b: number) => xs.slice(a, b).reduce((p, q) => p + q, 0) / (b - a);
    const dip = mean(t.level, t.at(0.62), t.at(0.66));
    expect(10 * Math.log10(dip / mean(t.level, t.at(0.4), t.at(0.55)))).toBeLessThan(-3);
    expect(10 * Math.log10(mean(t.level, t.at(0.95), t.at(1.15)) / mean(t.level, t.at(0.4), t.at(0.55)))).toBeGreaterThan(-6);
    // gliding, no dip
    const g = slur(1);
    expect(10 * Math.log10(mean(g.level, g.at(0.62), g.at(0.66)) / mean(g.level, g.at(0.4), g.at(0.55)))).toBeGreaterThan(-3);
  });

  it('louder and brighter with velocity (the lips close harder; the wave steepens down the slide)', () => {
    for (const m of [46, 58, 65]) {
      const pp = render(m, 30);
      const ff = render(m, 112);
      expect(rmsDb(ff, 0.7, 1.1) - rmsDb(pp, 0.7, 1.1), `m${m} level`).toBeGreaterThan(10);
      // (brighter: B♭2 ×1.28, the recording ×2.1 — the model's pp/ff contrast is narrower than a player's: NOTES)
      expect(centroid(ff, m) / centroid(pp, m), `m${m} centroid`).toBeGreaterThan(1.2);
    }
  });

  it('the size changes in place (a note outside its compass moves by octaves into it); a second player is its own', () => {
    const c = new TromboneCore({ sampleRate: FS, dry: true, params: { vibrato: 0 } });
    c.setParams({ size: 'alto' });
    c.schedule({ type: 'noteOn', midi: 40, velocity: 80 }, 0);
    c.process(new Float32Array(128), new Float32Array(128), 128);
    const v = c.getVisual() as { trombone: { size: string }; focus: { midi: number } };
    expect(v.trombone.size).toBe('alto');
    expect(v.focus.midi).toBe(52);
    c.setParams({ size: 2 });
    expect((c.getVisual() as { trombone: { size: string } }).trombone.size).toBe('bass');
    const a = render(58, 80, 0.8, {}, 0);
    const b = render(58, 80, 0.8, {}, 1);
    let d = 0;
    for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
    expect(d).toBeGreaterThan(0);
  });
});
