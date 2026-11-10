// The oboe on the 2D stage (oboe-draw.ts, vector/oboe.ts): its keys close for the chart's fingering
// (oboe-fingering.ts, the 3D model's too), its tone holes sit where the notes really leave the bore, its
// layout fits a laptop's stage, a phone's and an Orchestra cell, and both styles draw, silent and sounding.
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { HALF, L1, L2, L3, LBB, OBOE_FINGERING, OBOE_HI, OBOE_LO, OCT1, OCT2, R1, R2, R3, RCS, oboeFingersFor } from '../src/ui/oboe-fingering.ts';
import { OB_APEX, OB_KEYS, OB_LEN, OB_REACH, OB_TOUCHES, drawOboe, halfOpen, newOboeState, obFirstOpen, obToBox, obWaveSpan, oboeBox, oboeKeysOpen, oboeLayout } from '../src/ui/oboe-draw.ts';
import { drawOboeV } from '../src/ui/vector/oboe.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const openOf = (m: number) => Object.fromEntries(oboeKeysOpen(m).map((k) => [k.id, k.open]));

describe('the 2D oboe’s keys follow the fingering chart', () => {
  it('A4: L1 and L2 down, L3’s ring and every hole below it open, the closed-standing keys shut', () => {
    const o = openOf(69);
    expect([o.l1, o.l2, o.l3]).toEqual([false, false, true]);
    for (const id of ['r1', 'r2', 'r3', 'cs', 'c', 'b', 'bb']) expect(o[id], id).toBe(true);
    for (const id of ['oct1', 'oct2', 'cvent', 'bbvent', 'gs', 'f', 'eb', 'trill-cd', 'trill-bc']) expect(o[id], id).toBe(false);
    expect(obFirstOpen(oboeFingersFor(69))?.id).toBe('l3');
  });
  it('the low notes close down the bell: B♭3 every hole, B3 the B♭ key open, C♯4 the C key open', () => {
    expect(obFirstOpen(oboeFingersFor(58))).toBeNull();
    expect(obFirstOpen(oboeFingersFor(59))?.id).toBe('bb');
    expect(obFirstOpen(oboeFingersFor(60))?.id).toBe('b');
    expect(obFirstOpen(oboeFingersFor(61))?.id).toBe('c');
    expect(openOf(61).cs).toBe(false);
    expect(obFirstOpen(oboeFingersFor(62))?.id).toBe('cs');
  });
  it('the keys a finger opens: E♭, F, G♯, the B♭ and C vents (through R1’s ring), the octave keys', () => {
    expect(obFirstOpen(oboeFingersFor(63))?.id).toBe('eb');
    expect(obFirstOpen(oboeFingersFor(65))?.id).toBe('f');
    expect(obFirstOpen(oboeFingersFor(68))?.id).toBe('gs');
    expect(obFirstOpen(oboeFingersFor(70))?.id).toBe('bbvent');
    expect(obFirstOpen(oboeFingersFor(72))?.id).toBe('cvent');
    // (with L2 down, R1's ring keeps the C vent shut: F♯4 is not raised)
    expect(openOf(66).cvent).toBe(false);
    expect(openOf(76).oct1).toBe(true);
    expect(openOf(81).oct2).toBe(true);
    expect(openOf(81).oct1).toBe(false);
  });
  it('the half-hole: D5 rolls L1 off its perforation, its plate still down; D4 keeps it covered', () => {
    expect(oboeFingersFor(74) & (L1 | HALF)).toBe(L1 | HALF);
    expect(halfOpen(oboeFingersFor(74))).toBe(true);
    expect(openOf(74).l1).toBe(false);
    expect(halfOpen(oboeFingersFor(62))).toBe(false);
  });
  it('every finger the chart uses moves something drawn (a ring, a plate, a cup or a touch)', () => {
    let used = 0;
    for (const f of OBOE_FINGERING) used |= f;
    for (let bit = 1; bit <= used; bit <<= 1) {
      if (!(used & bit)) continue;
      const moved = OB_KEYS.some((k) => k.by & bit) || OB_TOUCHES.some((t) => t.bit === bit) || bit === HALF;
      expect(moved, `bit ${bit}`).toBe(true);
    }
    // and every ring is a finger's: L1–L3, R1–R3
    expect(OB_KEYS.filter((k) => k.style !== 'cup').map((k) => k.by)).toEqual([L1, L2, L3, R1, R2, R3]);
    expect(OCT1 | OCT2 | RCS | LBB).toBeGreaterThan(0);
  });
});

describe('the 2D oboe’s bore', () => {
  // the tone holes are placed acoustically: with the cone's missing apex and a hole's end correction, a
  // first-register note's first open hole leaves the bore c/2f from the apex (the wave drawn ends there)
  it('every first-register note’s first open hole within 5 % of c/2f, in one half-wave', () => {
    for (let m = OBOE_LO; m <= 72; m++) {
      const s = obWaveSpan(oboeFingersFor(m), et(m));
      const want = 343 / (2 * et(m));
      expect(s.n, `m${m}`).toBe(1);
      expect(Math.abs((s.end + OB_APEX) / want - 1), `m${m}: ${((s.end + OB_APEX) * 1000).toFixed(0)} mm, c/2f ${(want * 1000).toFixed(0)}`).toBeLessThan(0.05);
    }
  });
  it('the second register (half-hole, octave keys) in two half-waves on the lower note’s tube, the third in two or more', () => {
    for (let m = 73; m <= 84; m++) {
      const s = obWaveSpan(oboeFingersFor(m), et(m));
      expect(s.n, `m${m}`).toBe(2);
      expect(Math.abs((s.end + OB_APEX) / (343 / et(m)) - 1), `m${m}`).toBeLessThan(0.08);
      // its node inside the tube, near the middle of the cone (where the register vents are)
      expect(s.nodes[0]).toBeGreaterThan(0.02);
      expect(s.nodes[0]).toBeLessThan(s.end);
    }
    for (let m = 85; m <= OBOE_HI; m++) expect(obWaveSpan(oboeFingersFor(m), et(m)).n, `m${m}`).toBeGreaterThanOrEqual(2);
  });
});

describe('the 2D oboe’s layout', () => {
  /** the stage under the top band (W×H) with the file player's px at its top: a laptop, a phone, a
   *  Pixel 7; and an Orchestra cell, standing and lying, at one px/m */
  const cells: [string, number, number, number][] = [
    ['laptop', 1440, 547, 39],
    ['phone 390×844', 390, 381, 47],
    ['Pixel 7', 412, 439, 47],
    ['Orchestra, standing', Math.round(oboeBox().h * 300), Math.round(oboeBox().w * 300), 0],
    ['Orchestra, lying', Math.round(oboeBox().w * 300), Math.round(oboeBox().h * 300), 0],
  ];
  for (const [name, W, H, top] of cells)
    it(`${name} (${W}×${H}, ${top} px of player): ${/phone|Pixel|standing/.test(name) ? 'standing' : 'lying'}, whole in its box under the player, the wave’s envelope too`, () => {
      const L = oboeLayout(W, H, top);
      const pts = [0, OB_LEN].flatMap((x) => [-1, 1].map((s) => obToBox(L, W, x, s * (OB_REACH + L.Hm / L.sc))));
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(W);
        expect(p.y).toBeGreaterThanOrEqual(top);
        expect(p.y).toBeLessThanOrEqual(H);
      }
      // a phone held upright: standing, as tall as fits between the player and the keys, the reed's tip
      // clear of the player by the breath's handle; a laptop lying, an Orchestra cell its own way, both
      // filling 90 % of the box's length (a cell at the group's px/m)
      const phone = /phone|Pixel/.test(name);
      expect(L.vertical).toBe(phone || name.endsWith('standing'));
      const len = L.vertical ? H - top : W;
      if (phone) {
        expect((OB_LEN * L.sc) / len).toBeGreaterThan(0.88);
        expect(obToBox(L, W, 0, 0).y).toBeGreaterThanOrEqual(top + 20);
      } else expect(OB_LEN * L.sc).toBeCloseTo(0.9 * len, 6);
      if (name.startsWith('Orchestra')) expect(L.sc).toBeCloseTo(300, 0);
    });
});

/** a sounding frame: A4, its wave a half-sine along the bore, the reed shutting once a cycle */
function sounding(midi: number, t: number): VisualFrame {
  const shape = new Float32Array(192);
  for (let i = 0; i < shape.length; i++) shape[i] = Math.sin(Math.PI * (0.1 + (0.9 * i) / (shape.length - 1))) * Math.cos(t);
  const rate = 48000;
  const P = rate / et(midi);
  const trace = new Float32Array(Math.round(4 * P));
  // (the opening: shut for a third of each cycle, open to 1.2 between)
  for (let i = 0; i < trace.length; i++) trace[i] = Math.max(0, 1.2 * Math.sin((2 * Math.PI * i) / P) + 0.4);
  return {
    instrument: 'oboe', load: 0, voices: 1, sympathetic: 0, maxVoices: 1, sustain: 0, soft: 0, gainReduction: 1, strike: null, modes: new Float32Array(16),
    focus: { midi, nStrings: 1, shapes: [shape], hammerAt: 0.01, prepAt: -1, lengthM: 0.35, f1: et(midi), B: 0, damper: 0 },
    excite: { title: 'Reed', unit: '', rate, trace, trace2: trace, trace2Label: '', caption: '', meta: 'γ 0.74 · register 1' },
    breath: { pressure: 0.9, vib: 0 },
    reed: { open: 0.5, gamma: 0.74 },
  } as unknown as VisualFrame;
}

describe('the 2D oboe draws, both styles', () => {
  for (const [name, draw] of [['classic', drawOboe], ['vector', drawOboeV]] as const)
    it(`${name}: silent, then sounding (the keys going down for the note, the reed following the engine’s), then quiet again`, async () => {
      const st = newOboeState();
      const { ctx } = recorder();
      draw(ctx, 1440, 547, null, st, 39);
      expect(st.drawn?.fingers).toBe(0);
      expect(st.src!.x).toBeGreaterThan(1300);
      for (let k = 0; k < 12; k++) {
        draw(ctx, 1440, 547, sounding(74, k), st, 39);
        await new Promise((r) => setTimeout(r, 8));
      }
      expect(st.drawn?.fingers).toBe(oboeFingersFor(74));
      // the reed's cycle, read off the trace: shut at its narrowest, open past its rest at its widest
      const cyc = st.reed!.cyc;
      expect(Math.min(...cyc)).toBeLessThan(0.15);
      expect(Math.max(...cyc)).toBeGreaterThan(1);
      // the keys sprung towards the fingering: L1's plate and R3's ring down, the C♯ key still open
      const pos = st.keys!.pos;
      const at = (id: string) => pos[OB_KEYS.findIndex((k) => k.id === id)];
      expect(at('l1')).toBeLessThan(0.5);
      expect(at('r3')).toBeLessThan(0.5);
      expect(at('cs')).toBeGreaterThan(0.5);
      // a phone's box and an Orchestra cell draw as well
      draw(ctx, 390, 381, sounding(81, 0), st, 47);
      draw(ctx, 48, 218, sounding(81, 0), st, 0);
      expect(st.drawn?.vertical).toBe(true);
    });
});
