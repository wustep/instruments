// The clarinet on the 2D stage (clarinet-draw.ts, vector/clarinet.ts): its keys close for the chart's
// fingering (clarinet-fingering.ts, the 3D model's too), its tone holes sit where the notes really leave
// the bore (a measured Buffet Crampon's holes), its wave stands in one quarter-wave in the chalumeau, three
// in the clarion, five or more in the altissimo; its layout fits a laptop's stage, a phone's and an
// Orchestra cell; and both styles draw, silent and sounding.
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { CLARINET_FINGERING, CLARINET_HI, CLARINET_LO, L1, L2, L3, R1, R2, R3, REG, T, clarinetFingersFor, clarinetRegister } from '../src/ui/clarinet-fingering.ts';
import { CL_KEYS, CL_LEN, CL_REACH, CL_TOUCHES, clFirstOpen, clToBox, clWaveSpan, clarinetBox, clarinetKeysOpen, clarinetLayout, drawClarinet, newClarinetState } from '../src/ui/clarinet-draw.ts';
import { drawClarinetV } from '../src/ui/vector/clarinet.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const openOf = (m: number) => Object.fromEntries(clarinetKeysOpen(m).map((k) => [k.id, k.open]));
const first = (m: number) => clFirstOpen(clarinetFingersFor(m), clarinetRegister(m))?.id ?? 'bell';

describe('the 2D clarinet’s keys follow the fingering chart', () => {
  it('concert F3 (written G3): the thumb and all six holes shut, the little fingers’ pads open', () => {
    const o = openOf(53);
    for (const id of ['thumb', 'l1', 'l2', 'l3', 'r1', 'r2', 'r3', 'gvent', 'bfs']) expect(o[id], id).toBe(false);
    for (const id of ['fs', 'f', 'e']) expect(o[id], id).toBe(true);
    for (const id of ['reg', 'a', 'gs', 'seb', 'cs', 'ab']) expect(o[id], id).toBe(false);
    expect(first(53)).toBe('fs');
  });
  it('the little fingers’ chain: E/B shuts all three pads (the bell sounds), F/C two, F♯/C♯ one; A♭/E♭ opens its own', () => {
    expect(first(50)).toBe('bell');
    expect([openOf(50).fs, openOf(50).f, openOf(50).e]).toEqual([false, false, false]);
    expect(first(51)).toBe('e');
    expect(first(52)).toBe('f');
    expect(first(54)).toBe('ab');
    expect(openOf(54).ab).toBe(true);
  });
  it('the rings’ linkages: B3’s fork shuts the B/F♯ pad with R2’s ring, C4 sounds through it; the thumb or L1 shuts the G vent', () => {
    // written B3 (concert A3, 57): T LH and R2 only, R1's hole the first open
    expect(clarinetFingersFor(57) & (R1 | R2 | R3)).toBe(R2);
    expect(openOf(57).bfs).toBe(false);
    expect(first(57)).toBe('r1');
    expect(first(58)).toBe('bfs');
    // written F♯4 (concert E4, 64): L1 only, the thumb hole open; open G (65) through the thumb hole too
    expect(openOf(64).gvent).toBe(false);
    expect(first(64)).toBe('thumb');
    expect(openOf(65).gvent).toBe(true);
    expect(clarinetFingersFor(65)).toBe(0);
  });
  it('the throat: A and G♯ keys under the left index, B♭4 through the register hole', () => {
    expect(first(66)).toBe('gs');
    expect(first(67)).toBe('a');
    expect(first(68)).toBe('reg');
    expect(openOf(68).a).toBe(true);
  });
  it('a clarion note: concert G5 (written A5) is D4’s fingering with the register key open', () => {
    const f = clarinetFingersFor(79);
    expect(f).toBe(REG | T | L1 | L2);
    const o = openOf(79);
    expect(o.reg).toBe(true);
    expect([o.l1, o.l2, o.l3]).toEqual([false, false, true]);
    expect(first(79)).toBe('l3');
    expect(first(79)).toBe(first(60));
  });
  it('an altissimo note: concert D6 (written E6) vents L1 and the register, its tube ending at the B/F♯ pad', () => {
    const o = openOf(86);
    expect(o.reg).toBe(true);
    expect(o.l1).toBe(true);
    expect([o.l2, o.l3]).toEqual([false, false]);
    expect(first(86)).toBe('bfs');
  });
  it('every finger the chart uses moves something drawn (a ring, a hole, a cup or a touch)', () => {
    let used = 0;
    for (const f of CLARINET_FINGERING) used |= f;
    for (let bit = 1; bit <= used; bit <<= 1) {
      if (!(used & bit)) continue;
      const moved = CL_KEYS.some((k) => k.by & bit) || CL_TOUCHES.some((t) => t.bit === bit);
      expect(moved, `bit ${bit}`).toBe(true);
    }
    // the finger holes: the thumb's, L1 and L2 ringed, L3 plain, R1–R3 ringed
    expect(CL_KEYS.filter((k) => k.style !== 'cup').map((k) => `${k.id}:${k.style}`)).toEqual(['thumb:ring', 'l1:ring', 'l2:ring', 'l3:plain', 'r1:ring', 'r2:ring', 'r3:ring']);
    expect(CL_KEYS.filter((k) => k.style !== 'cup').map((k) => k.by)).toEqual([T, L1, L2, L3, R1, R2, R3]);
  });
});

describe('the 2D clarinet’s bore', () => {
  // the holes are a measured Buffet's: with an 18 mm end correction (the register hole's 54) a
  // chalumeau note's first open hole leaves the bore within 5 % of c/4f from the reed's tip
  it('every chalumeau and throat note in one quarter-wave, within 5 % of c/4f', () => {
    for (let m = CLARINET_LO; m <= 68; m++) {
      const s = clWaveSpan(clarinetFingersFor(m), et(m), 1);
      const want = 343 / (4 * et(m));
      expect(s.n, `m${m}`).toBe(1);
      expect(Math.abs(s.end / want - 1), `m${m}: ${(s.end * 1000).toFixed(0)} mm, c/4f ${(want * 1000).toFixed(0)}`).toBeLessThan(0.05);
    }
  });
  it('the clarion in three quarter-waves on the chalumeau’s tube a twelfth down (the register key a vent near its first node)', () => {
    for (let m = 69; m <= 82; m++) {
      const f = clarinetFingersFor(m);
      expect(f & REG, `m${m}`).toBe(REG);
      const s = clWaveSpan(f, et(m), 2);
      expect(s.n, `m${m}`).toBe(3);
      expect(Math.abs(s.end / ((3 * 343) / (4 * et(m))) - 1), `m${m}`).toBeLessThan(0.05);
      // the same tube as the note a twelfth (19 semitones) down
      expect(s.end).toBeCloseTo(clWaveSpan(clarinetFingersFor(m - 19), et(m - 19), 1).end, 6);
      // the register hole (152.7 mm) near the first node: the makers' compromise, a little above it for
      // the lowest clarion notes, below it for the highest (Debut et al. 2005)
      expect(0.1527 / s.nodes[0], `m${m}`).toBeGreaterThan(0.75);
      expect(0.1527 / s.nodes[0], `m${m}`).toBeLessThan(1.75);
    }
  });
  it('the altissimo in five quarter-waves or more (odd), the lower altissimo’s within 3 %', () => {
    for (let m = 83; m <= CLARINET_HI; m++) {
      const s = clWaveSpan(clarinetFingersFor(m), et(m), 3);
      expect(s.n % 2, `m${m}`).toBe(1);
      expect(s.n, `m${m}`).toBeGreaterThanOrEqual(5);
      if (m <= 89 && m !== 85) expect(Math.abs(s.end / ((s.n * 343) / (4 * et(m))) - 1), `m${m}`).toBeLessThan(0.03);
    }
  });
});

describe('the 2D clarinet’s layout', () => {
  /** the stage under the top band (W×H) with the file player's px at its top: a laptop, a phone, a
   *  Pixel 7; and an Orchestra cell, standing and lying, at 300 px/m */
  const cells: [string, number, number, number][] = [
    ['laptop', 1440, 547, 39],
    ['phone 390×844', 390, 381, 47],
    ['Pixel 7', 412, 439, 47],
    ['Orchestra, standing', Math.round(clarinetBox().h * 300), Math.round(clarinetBox().w * 300), 0],
    ['Orchestra, lying', Math.round(clarinetBox().w * 300), Math.round(clarinetBox().h * 300), 0],
  ];
  for (const [name, W, H, top] of cells)
    it(`${name} (${W}×${H}, ${top} px of player): ${/phone|Pixel|standing/.test(name) ? 'standing' : 'lying'}, whole in its box under the player, the wave’s envelope too`, () => {
      const L = clarinetLayout(W, H, top);
      const pts = [0, CL_LEN].flatMap((x) => [-1, 1].map((s) => clToBox(L, W, x, s * (CL_REACH + L.Hm / L.sc))));
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
        // standing as tall as fits between the player and the keys, the mouthpiece up, clear of the player
        expect((CL_LEN * L.sc) / len).toBeGreaterThan(0.88);
        expect(clToBox(L, W, 0, 0).y).toBeGreaterThanOrEqual(top + 20);
        expect(clToBox(L, W, CL_LEN, 0).y).toBeGreaterThan(clToBox(L, W, 0, 0).y);
      } else expect(CL_LEN * L.sc).toBeCloseTo(0.9 * len, 6);
      if (name.startsWith('Orchestra')) expect(L.sc).toBeCloseTo(300, 0);
    });
});

/** a sounding frame: its wave a quarter-sine from the reed (antinode) to the open end (node), the reed
 *  beating shut once a cycle */
function sounding(midi: number, t: number): VisualFrame {
  const shape = new Float32Array(160);
  for (let i = 0; i < shape.length; i++) shape[i] = Math.cos((Math.PI / 2) * (i / (shape.length - 1))) * Math.cos(t);
  const rate = 48000;
  const P = rate / et(midi);
  const trace = new Float32Array(Math.round(4 * P));
  // (the opening: shut for a third of each cycle, open to 1.2 between)
  for (let i = 0; i < trace.length; i++) trace[i] = Math.max(0, 1.2 * Math.sin((2 * Math.PI * i) / P) + 0.4);
  return {
    instrument: 'clarinet', load: 0, voices: 1, sympathetic: 0, maxVoices: 1, sustain: 0, soft: 0, gainReduction: 1, strike: null, modes: new Float32Array(16),
    focus: { midi, nStrings: 1, shapes: [shape], hammerAt: 0.01, prepAt: -1, lengthM: 343 / (4 * et(midi)), f1: et(midi), B: 0, damper: 0 },
    excite: { title: 'Reed', unit: '', rate, trace, trace2: trace, trace2Label: '', caption: '', meta: 'γ 0.60 · chalumeau' },
    breath: { pressure: 0.9, vib: 0 },
    reed: { open: 0.5, gamma: 0.6 },
  } as unknown as VisualFrame;
}

describe('the 2D clarinet draws, both styles', () => {
  for (const [name, draw] of [['classic', drawClarinet], ['vector', drawClarinetV]] as const)
    it(`${name}: silent, then sounding (the keys going down for the note, the reed following the engine’s), a clarion and an altissimo note, a phone and an Orchestra cell`, async () => {
      const st = newClarinetState();
      const { ctx } = recorder();
      draw(ctx, 1440, 547, null, st, 39);
      expect(st.drawn?.fingers).toBe(0);
      expect(st.src!.x).toBeGreaterThan(1300);
      for (let k = 0; k < 12; k++) {
        draw(ctx, 1440, 547, sounding(53, k), st, 39);
        await new Promise((r) => setTimeout(r, 8));
      }
      expect(st.drawn?.fingers).toBe(clarinetFingersFor(53));
      // the reed's cycle, read off the trace: shut at its narrowest, open past its rest at its widest
      const cyc = st.reed!.cyc;
      expect(Math.min(...cyc)).toBeLessThan(0.15);
      expect(Math.max(...cyc)).toBeGreaterThan(1);
      // the keys sprung towards the fingering: L1's and R3's rings down (their holes shut), the E pad open
      const pos = st.keys!.pos;
      const at = (id: string) => pos[CL_KEYS.findIndex((k) => k.id === id)];
      expect(at('l1')).toBeLessThan(0.5);
      expect(at('r3')).toBeLessThan(0.5);
      expect(at('e')).toBeGreaterThan(0.5);
      // a clarion note, then an altissimo one: the register key goes up
      for (let k = 0; k < 10; k++) {
        draw(ctx, 1440, 547, sounding(79, k), st, 39);
        await new Promise((r) => setTimeout(r, 8));
      }
      expect(st.drawn?.fingers).toBe(clarinetFingersFor(79));
      expect(at('reg')).toBeGreaterThan(0.5);
      draw(ctx, 1440, 547, sounding(86, 0), st, 39);
      // a phone's box and an Orchestra cell draw as well
      draw(ctx, 390, 381, sounding(86, 0), st, 47);
      expect(st.drawn?.vertical).toBe(true);
      draw(ctx, 51, 221, sounding(81, 0), st, 0);
      expect(st.drawn?.vertical).toBe(true);
    });
});
