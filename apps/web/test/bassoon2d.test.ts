// The bassoon on the 2D stage (bassoon-draw.ts, vector/bassoon.ts): its plan at the real instrument's
// measures, its keys closing for the chart's fingering (bassoon-fingering.ts, the 3D model's too), its tone
// holes where the notes really leave the folded bore, its wave standing in one half-wave in the first
// octave and two on the same tube in the second; its layout fits a laptop's stage, a phone's and an
// Orchestra cell; and both styles draw, silent and sounding.
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { BASSOON_FINGERING, BASSOON_HI, BASSOON_LO, HALF, L1, L2, L3, R1, R2, R3, W, bassoonFingersFor, bassoonOctave } from '../src/ui/bassoon-fingering.ts';
import { BS_APEX, BS_BORE, BS_H, BS_KEYS, BS_TOUCHES, H_RING, LOBE_R, U_HI, U_L, U_LO, U_W, X_ASC, X_BOCAL, X_DESC, X_U, bassoonBox, bassoonKeysOpen, bassoonLayout, boreHU, bsFirstOpen, bsToBox, bsWaveSpan, drawBassoon, newBassoonState } from '../src/ui/bassoon-draw.ts';
import { drawBassoonV } from '../src/ui/vector/bassoon.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const half = (m: number) => 343 / (2 * et(m));
const openOf = (m: number) => Object.fromEntries(bassoonKeysOpen(m).map((k) => [k.id, k.open]));
const first = (m: number) => bsFirstOpen(bassoonFingersFor(m))?.id ?? 'bell';
const near = (v: number, want: number, tol = 0.03) => expect(Math.abs(v / want - 1), `${v.toFixed(4)} against ${want}`).toBeLessThan(tol);

describe('the 2D bassoon’s plan, at the real instrument’s measures', () => {
  it('1.34 m tall; its bore 2.54 m from the reed’s tip to the bell’s rim, folded at the boot; the bocal 0.30 m; the reed 55 mm', () => {
    near(BS_H, 1.34);
    near(BS_BORE, 2.54);
    near(X_DESC - X_BOCAL, 0.3);
    // the bore runs on without a jump, down the wing and the boot's narrow bore, round the U, up to the bell
    let [h0, u0] = boreHU(0);
    for (let x = 0.002; x <= BS_BORE; x += 0.002) {
      const [h, u] = boreHU(x);
      expect(Math.hypot(h - h0, u - u0), `x ${x.toFixed(3)}`).toBeLessThan(0.0021);
      [h0, u0] = [h, u];
    }
    expect(boreHU(BS_BORE)[0]).toBeCloseTo(BS_H, 6);
    expect(boreHU(BS_BORE)[1]).toBeCloseTo(U_L, 6);
    expect(boreHU(X_DESC + 0.1)[1]).toBeCloseTo(U_W, 6);
    expect(boreHU(X_ASC + 0.1)[1]).toBeCloseTo(U_L, 6);
    // the U-tube under the boot's cap, its bores 36 mm apart; the wing's cap 0.87–0.91 m (the bocal in it)
    expect(Math.min(...[0, 0.25, 0.5, 0.75, 1].map((f) => boreHU(X_U + f * (X_ASC - X_U))[0]))).toBeLessThan(0.02);
    near(U_L - U_W, 0.036);
    expect(boreHU(X_DESC)[0]).toBeGreaterThan(0.86);
    expect(boreHU(X_DESC)[0]).toBeLessThan(0.871);
    // the reed's tip out past the wing, 0.2 m to the left, a little below the hook
    expect(boreHU(0)[1]).toBeLessThan(-0.2);
    expect(boreHU(0)[1]).toBeGreaterThan(U_LO);
    expect(H_RING).toBeCloseTo(0.424, 3);
  });
  it('the finger holes where the photograph has them: L1–L3 on the wing, R1 and R2 on the boot, each drilled down to its place in the bore', () => {
    const k = Object.fromEntries(BS_KEYS.map((k) => [k.id, k]));
    for (const [id, h] of [['l1', 0.642], ['l2', 0.599], ['l3', 0.563], ['r1', 0.352], ['r2', 0.305]] as const) {
      expect(k[id].h, id).toBeCloseTo(h, 3);
      // the wing's holes in the narrow bore within 2 cm of their finger; the boot's (steeper) within 7
      const [hb, ub] = boreHU(k[id].x);
      expect(ub).toBeCloseTo(U_W, 6);
      expect(Math.abs(hb - h), id).toBeLessThan(id.startsWith('l') ? 0.02 : 0.07);
    }
    // the side pads on the long joint (the photograph's buttons at its right edge)
    for (const id of ['eb2', 'cs2', 'c2h']) expect(k[id].u, id).toBeGreaterThan(U_L + 0.023);
  });
});

describe('the 2D bassoon’s keys follow the fingering chart', () => {
  it('B♭1: every low key down, the whole tube to the bell; C2–D2 open the low pads one by one', () => {
    expect(first(34)).toBe('bell');
    const o = openOf(34);
    for (const id of ['l1', 'l2', 'l3p', 'r1', 'r2', 'r3p', 'g2h', 'f2h', 'e2h', 'd2h', 'c2h', 'b1h']) expect(o[id], id).toBe(false);
    expect(first(35)).toBe('b1h');
    expect(first(36)).toBe('c2h');
    expect(first(37)).toBe('cs2');
    expect(first(38)).toBe('d2h');
    expect(first(39)).toBe('eb2');
    expect(first(40)).toBe('e2h');
  });
  it('F2: the whisper key and all six down, the right thumb’s E key up (its pad ends the tube); G2 lifts the little finger’s F', () => {
    const o = openOf(41);
    for (const id of ['l1', 'l2', 'l3', 'l3p', 'r1', 'r2', 'r3p', 'g2h', 'w']) expect(o[id], id).toBe(false);
    expect(o.f2h).toBe(true);
    expect(first(41)).toBe('f2h');
    expect(first(42)).toBe('fs2');
    expect(first(43)).toBe('g2h');
    expect(first(44)).toBe('gs2');
    // the right hand lifting: A2, B♭2 (the thumb's B♭ vent), B2, C3, C♯3 (the C♯ key's vent), D3
    expect([45, 46, 47, 48, 49, 50].map(first)).toEqual(['r3p', 'bb2', 'r2', 'r1', 'tcs', 'l3p']);
    expect([52, 53].map(first)).toEqual(['l2', 'l1']);
  });
  it('G3: L1 rolled half off its hole (the half-hole: a vent), the G2 tube overblown; D4 with the whisper key off', () => {
    const f = bassoonFingersFor(55);
    expect(f & HALF).toBe(HALF);
    expect(f & L1).toBe(0);
    expect(openOf(55).l1).toBe(false);
    expect(first(55)).toBe(first(43));
    expect(bsWaveSpan(f, et(55), 2).n).toBe(2);
    const d4 = bassoonFingersFor(62);
    expect(d4 & W).toBe(0);
    expect(openOf(62).w).toBe(true);
    expect(first(62)).toBe(first(50));
  });
  it('A4: the A flick key and the C♯ key open their vents, three half-waves on the C♯3 tube', () => {
    const o = openOf(69);
    expect(o.fa).toBe(true);
    expect(o.tcs).toBe(true);
    expect([o.fb, o.fd]).toEqual([false, false]);
    expect(first(69)).toBe('tcs');
    expect(bsWaveSpan(bassoonFingersFor(69), et(69), 3).n).toBe(3);
  });
  it('every finger the chart uses moves something drawn (a hole, a ring, a pad or a touch); the finger holes are L1, L2, R1 open, L3 and R2 ringed', () => {
    let used = 0;
    for (const f of BASSOON_FINGERING) used |= f;
    for (let bit = 1; bit <= used; bit <<= 1) {
      if (!(used & bit)) continue;
      const moved = BS_KEYS.some((k) => k.by & bit) || BS_TOUCHES.some((t) => t.bit === bit);
      expect(moved, `bit ${bit}`).toBe(true);
    }
    expect(BS_KEYS.filter((k) => k.style === 'hole' || k.style === 'ring').map((k) => `${k.id}:${k.style}`)).toEqual(['l1:hole', 'l2:hole', 'l3:ring', 'r1:hole', 'r2:ring']);
    expect(BS_KEYS.find((k) => k.id === 'r3p')!.by).toBe(R3);
    expect([L2, L3, R1, R2].every((b) => BS_KEYS.some((k) => k.by === b))).toBe(true);
  });
});

describe('the 2D bassoon’s bore', () => {
  // with the cone's missing apex (0.40 m) and an end correction past each hole, a first-register note's
  // first open hole leaves the bore c/2f from the apex: the wave drawn ends where the tube does
  it('every first-octave note (B♭1–F3) in one half-wave, its tube within 3 % of c/2f', () => {
    for (let m = BASSOON_LO; m <= 53; m++) {
      const s = bsWaveSpan(bassoonFingersFor(m), et(m), 1);
      expect(s.n, `m${m}`).toBe(1);
      expect(Math.abs((s.end + BS_APEX) / half(m) - 1), `m${m}: ${((s.end + BS_APEX) * 1000).toFixed(0)} mm, c/2f ${(half(m) * 1000).toFixed(0)}`).toBeLessThan(0.03);
    }
  });
  it('the second octave (F♯3–F4) in two half-waves on the first octave’s tubes, within 7 %', () => {
    for (let m = 54; m <= 65; m++) {
      const s = bsWaveSpan(bassoonFingersFor(m), et(m), 2);
      expect(s.n, `m${m}`).toBe(2);
      expect(Math.abs((s.end + BS_APEX) / (2 * half(m)) - 1), `m${m}`).toBeLessThan(0.07);
      expect(s.nodes.length).toBe(1);
    }
  });
  it('the third octave (F♯4–E5) in two or more half-waves, cross-fingered (within 15 %)', () => {
    for (let m = 66; m <= BASSOON_HI; m++) {
      const s = bsWaveSpan(bassoonFingersFor(m), et(m), bassoonOctave(m));
      expect(s.n, `m${m}`).toBeGreaterThanOrEqual(2);
      expect(Math.abs((s.end + BS_APEX) / (s.n * half(m)) - 1), `m${m}`).toBeLessThan(0.15);
    }
  });
});

describe('the 2D bassoon’s layout', () => {
  /** the stage under the top band (W×H) with the file player's px at its top: a laptop, a phone, a
   *  Pixel 7; and an Orchestra cell, standing and lying, at 300 px/m */
  const b = bassoonBox();
  const cells: [string, number, number, number][] = [
    ['laptop', 1440, 547, 39],
    ['phone 390×844', 390, 381, 47],
    ['Pixel 7', 412, 439, 47],
    ['Orchestra, standing', Math.round(b.h * 300), Math.round(b.w * 300), 0],
    ['Orchestra, lying', Math.round(b.w * 300), Math.round(b.h * 300), 0],
  ];
  for (const [name, W, H, top] of cells)
    it(`${name} (${W}×${H}, ${top} px of player): ${/phone|Pixel|standing/.test(name) ? 'standing' : 'lying'}, whole in its box under the player, the wave’s envelope too`, () => {
      const L = bassoonLayout(W, H, top);
      const pts = [
        ...[0, BS_H].flatMap((h) => [U_LO, Math.max(U_HI, LOBE_R + L.Hm / L.sc)].map((u) => bsToBox(L, h, u))),
        bsToBox(L, ...(boreHU(0) as [number, number])),
      ];
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(W);
        expect(p.y).toBeGreaterThanOrEqual(top);
        expect(p.y).toBeLessThanOrEqual(H);
      }
      const phone = /phone|Pixel/.test(name);
      expect(L.vertical).toBe(phone || name.endsWith('standing'));
      const len = L.vertical ? H - top : W;
      if (phone) {
        // standing as tall as fits between the player and the keys, the bell up, clear of the player
        expect((BS_H * L.sc) / len).toBeGreaterThan(0.9);
        expect(bsToBox(L, BS_H, U_L).y).toBeGreaterThanOrEqual(top + 8);
        expect(bsToBox(L, 0, 0).y).toBeGreaterThan(bsToBox(L, BS_H, 0).y);
        // the bocal and reed to the left of the wing
        expect(bsToBox(L, ...(boreHU(0) as [number, number])).x).toBeLessThan(bsToBox(L, 0.9, U_W).x);
      } else expect(BS_H * L.sc).toBeCloseTo(0.9 * len, 6);
      if (name.startsWith('Orchestra')) expect(L.sc).toBeCloseTo(300, 0);
    });
});

/** a sounding frame: its wave a half-sine from the reed to the open end, the reed beating shut once a cycle */
function sounding(midi: number, t: number): VisualFrame {
  const shape = new Float32Array(160);
  for (let i = 0; i < shape.length; i++) shape[i] = Math.sin(Math.PI * (0.1 + 0.9 * (i / (shape.length - 1)))) * Math.cos(t);
  const rate = 48000;
  const P = rate / et(midi);
  const trace = new Float32Array(Math.round(4 * P));
  // (the opening: shut for a third of each cycle, open to 1.2 between)
  for (let i = 0; i < trace.length; i++) trace[i] = Math.max(0, 1.2 * Math.sin((2 * Math.PI * i) / P) + 0.4);
  return {
    instrument: 'bassoon', load: 0, voices: 1, sympathetic: 0, maxVoices: 1, sustain: 0, soft: 0, gainReduction: 1, strike: null, modes: new Float32Array(16),
    focus: { midi, nStrings: 1, shapes: [shape], hammerAt: 0.01, prepAt: -1, lengthM: half(midi) - 0.12, f1: et(midi), B: 0, damper: 0 },
    excite: { title: 'Reed', unit: '', rate, trace, trace2: trace, trace2Label: '', caption: '', meta: 'γ 0.60 · register 1' },
    breath: { pressure: 0.9, vib: 0 },
    reed: { open: 0.5, gamma: 0.6 },
  } as unknown as VisualFrame;
}

describe('the 2D bassoon draws, both styles', () => {
  for (const [name, draw] of [['classic', drawBassoon], ['vector', drawBassoonV]] as const)
    it(`${name}: silent, then sounding (the keys going down for the note, the reed following the engine’s), a second- and a third-octave note, a phone and an Orchestra cell`, async () => {
      const st = newBassoonState();
      const { ctx } = recorder();
      draw(ctx, 1440, 547, null, st, 39);
      expect(st.drawn?.fingers).toBe(0);
      expect(st.drawn?.vertical).toBe(false);
      expect(st.src!.x).toBeGreaterThan(1300);
      for (let k = 0; k < 12; k++) {
        draw(ctx, 1440, 547, sounding(41, k), st, 39);
        await new Promise((r) => setTimeout(r, 8));
      }
      expect(st.drawn?.fingers).toBe(bassoonFingersFor(41));
      // the reed's cycle, read off the trace: shut at its narrowest, open past its rest at its widest
      const cyc = st.reed!.cyc;
      expect(Math.min(...cyc)).toBeLessThan(0.15);
      expect(Math.max(...cyc)).toBeGreaterThan(1);
      // the keys sprung towards the fingering: L1's and R2's holes shut, the E pad open, the whisper pad down
      const pos = st.keys!.pos;
      const at = (id: string) => pos[BS_KEYS.findIndex((k) => k.id === id)];
      expect(at('l1')).toBeLessThan(0.5);
      expect(at('r2')).toBeLessThan(0.5);
      expect(at('f2h')).toBeGreaterThan(0.5);
      expect(at('w')).toBeLessThan(0.5);
      // D4, then A4: the whisper pad lifts, then the A flick's vent opens
      for (let k = 0; k < 10; k++) {
        draw(ctx, 1440, 547, sounding(62, k), st, 39);
        await new Promise((r) => setTimeout(r, 8));
      }
      expect(st.drawn?.fingers).toBe(bassoonFingersFor(62));
      expect(at('w')).toBeGreaterThan(0.5);
      for (let k = 0; k < 10; k++) {
        draw(ctx, 1440, 547, sounding(69, k), st, 39);
        await new Promise((r) => setTimeout(r, 8));
      }
      expect(at('fa')).toBeGreaterThan(0.5);
      // a phone's box and an Orchestra cell draw as well
      draw(ctx, 390, 381, sounding(69, 0), st, 47);
      expect(st.drawn?.vertical).toBe(true);
      draw(ctx, 117, 447, sounding(55, 0), st, 0);
      expect(st.drawn?.vertical).toBe(true);
    });
});
