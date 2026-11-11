// Orchestra mode's seats (orchestra/seats.ts): where each instrument sits is where the 3D stage draws
// it, the row the 2D stage keeps it in, and where its sound comes from (the room's seat in the engine).
// A few players sit on one arc; five or more as an orchestra: the strings in front (first violins at the
// audience's left, the cellos at the right, the basses behind them), the woodwinds behind in two rows, the
// brass behind those, the timpani at the back's left, each row behind the strings a riser higher.
import { describe, expect, it } from 'vitest';
import { VOICE_INFO, type Voice } from '../src/orchestra/assign.ts';
import { RISE, isOrchestral, orchestraPlan, seatKinds, seatPlaces, seatRisers, soundSeats, TALL, type Place } from '../src/orchestra/seats.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';

const seats = (vs: Voice[]) => soundSeats(vs.map((v) => VOICE_INFO[v]));
const kinds = (vs: Voice[]) => seatKinds(vs.map((v) => VOICE_INFO[v]));
const places = (vs: Voice[], aspect = 2) => seatPlaces(kinds(vs), aspect);
/** Beethoven's Fifth as its preset seats it (test/presets.ts SYMPHONY), and with three trombones */
const B5: Voice[] = ['flute', 'flute', 'oboe', 'oboe', 'clarinet', 'clarinet', 'bassoon', 'bassoon', 'horn', 'horn', 'trumpet', 'trumpet', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass'];
const B5_TB: Voice[] = [...B5.slice(0, 12), 'trombone', 'trombone', 'trombone', ...B5.slice(12)];
const at = (vs: Voice[], v: Voice) => vs.flatMap((x, i) => (x === v ? [i] : []));
const lo = (ps: Place[], is: number[], k: 'x' | 'z' | 'y') => Math.min(...is.map((i) => ps[i][k]));
const hi = (ps: Place[], is: number[], k: 'x' | 'z' | 'y') => Math.max(...is.map((i) => ps[i][k]));
/** each seat's distance from the podium (the rows are arcs round it: a row behind is further from it) */
const radii = (vs: Voice[], aspect: number): number[] => {
  const zc = seatRisers(kinds(vs), aspect)[0].zc;
  return places(vs, aspect).map((p, i) => Math.hypot(p.x, p.z - (vs[i] === 'timpani' ? 0.3 : 0) - zc));
};
const rLo = (rs: number[], is: number[]) => Math.min(...is.map((i) => rs[i]));
const rHi = (rs: number[], is: number[]) => Math.max(...is.map((i) => rs[i]));

describe('orchestra: a few players', () => {
  it('a quartet: first violin on the audience’s left, the cello on the right, in a symmetric arc', () => {
    const s = seats(['violin', 'violin', 'viola', 'cello']);
    const xs = s.map((p) => p[0]);
    expect(xs[0]).toBeLessThan(-0.9);
    expect(xs[3]).toBeGreaterThan(0.9);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[0]).toBeCloseTo(-xs[3], 9);
    // the arc's ends come towards the audience
    expect(s[0][1]).toBeLessThan(s[1][1]);
  });

  it('a piano behind the players, a soloist beside it on the right', () => {
    const five = seats(['flute', 'violin', 'viola', 'cello', 'grand']);
    expect(five[4][1]).toBeGreaterThan(1);
    for (let i = 0; i < 4; i++) expect(five[i][1]).toBeLessThan(0);
    const duo = seats(['trumpet', 'grand']);
    expect(duo[0][0]).toBeGreaterThan(1.5);
    expect(duo[1][0]).toBe(0);
  });

  it('two of a kind sit apart (two cellos, two grands)', () => {
    const s = seats(['cello', 'cello', 'grand', 'grand']);
    expect(Math.abs(s[0][0] - s[1][0])).toBeGreaterThan(0.5);
    expect(Math.abs(s[2][0] - s[3][0])).toBeCloseTo(2.5, 9);
  });

  it('four players (and the timpani, and the pianos) are not an orchestra; five are', () => {
    expect(isOrchestral(kinds(['violin', 'violin', 'viola', 'cello', 'timpani', 'grand']))).toBe(false);
    expect(isOrchestral(kinds(['violin', 'violin', 'viola', 'cello', 'bass']))).toBe(true);
    expect(seatRisers(kinds(['violin', 'viola', 'cello', 'flute']))).toEqual([]);
    for (const p of places(['violin', 'viola', 'cello', 'flute', 'timpani'])) expect(p.y).toBe(0);
  });
});

describe('orchestra: an orchestra’s seating', () => {
  for (const [name, L] of [['Beethoven’s Fifth (18 seats)', B5], ['with three trombones (21)', B5_TB]] as [string, Voice[]][])
    for (const aspect of [2.6, 0.85])
      it(`${name}, ${aspect < TALL ? 'a phone held upright' : 'a computer'}: strings in front, woodwinds behind, brass and timpani at the back`, () => {
        const ps = places(L, aspect);
        const rad = radii(L, aspect);
        const vln = at(L, 'violin');
        const strings = [...vln, ...at(L, 'viola'), ...at(L, 'cello')];
        const fl = at(L, 'flute');
        const ob = at(L, 'oboe');
        const cl = at(L, 'clarinet');
        const bn = at(L, 'bassoon');
        const winds = [...fl, ...ob, ...cl, ...bn];
        const brass = [...at(L, 'horn'), ...at(L, 'trumpet'), ...at(L, 'trombone')];
        const timp = at(L, 'timpani');
        const bass = at(L, 'bass');
        // the strings on the floor in front, first violins at the audience's left, then the seconds, the
        // violas, the cellos at the right
        for (const i of strings) expect(ps[i].y).toBe(0);
        expect(hi(ps, strings, 'z')).toBeLessThan(lo(ps, winds, 'z') - 0.6);
        expect(rHi(rad, strings)).toBeLessThan(rLo(rad, winds) - 0.6);
        const order = [vln[0], vln[1], ...at(L, 'viola'), ...at(L, 'cello')].map((i) => ps[i].x);
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(ps[vln[0]].x).toBeLessThan(-0.5);
        expect(ps[at(L, 'cello')[0]].x).toBeGreaterThan(0.5);
        // the basses behind the cellos, at the right, on the floor
        for (const i of bass) {
          expect(rad[i]).toBeGreaterThan(rad[at(L, 'cello')[0]] + 0.5);
          expect(ps[i].x).toBeGreaterThan(ps[at(L, 'cello')[0]].x - 0.3);
          expect(ps[i].y).toBe(0);
        }
        // the woodwinds in two rows on risers: flutes and oboes in front of clarinets and bassoons, the
        // flutes at the left of the oboes, the clarinets of the bassoons, the second row a step higher
        expect(rHi(rad, [...fl, ...ob])).toBeLessThan(rLo(rad, [...cl, ...bn]) - 0.5);
        expect(hi(ps, fl, 'x')).toBeLessThan(lo(ps, ob, 'x'));
        expect(hi(ps, cl, 'x')).toBeLessThan(lo(ps, bn, 'x'));
        expect(lo(ps, winds, 'y')).toBeGreaterThan(0);
        expect(ps[cl[0]].y).toBeCloseTo(ps[fl[0]].y + RISE, 9);
        // the brass behind the woodwinds, higher still; horns at the left, then trumpets, trombones (on the
        // same row, or a phone's row behind)
        expect(rLo(rad, brass)).toBeGreaterThan(rHi(rad, winds) + 0.5);
        expect(lo(ps, brass, 'y')).toBeGreaterThan(hi(ps, winds, 'y'));
        expect(hi(ps, at(L, 'horn'), 'x')).toBeLessThan(lo(ps, at(L, 'trumpet'), 'x'));
        const tb = at(L, 'trombone');
        if (tb.length && ps[tb[0]].y === ps[at(L, 'trumpet')[0]].y) expect(hi(ps, at(L, 'trumpet'), 'x')).toBeLessThan(lo(ps, tb, 'x'));
        else if (tb.length) expect(rLo(rad, tb)).toBeGreaterThan(rHi(rad, at(L, 'trumpet')) + 0.5);
        // the timpani at the back, not in front of the horns (#40: the horns stood in front of them): at the
        // brass row's left end, past the woodwinds, or (a phone) on a row of their own behind the brass
        for (const i of timp) {
          expect(rad[i]).toBeGreaterThan(rHi(rad, winds) + 0.5);
          expect(ps[i].y).toBeGreaterThanOrEqual(hi(ps, brass, 'y'));
          if (aspect < TALL) expect(rad[i]).toBeGreaterThan(rHi(rad, brass) + 0.5);
          else expect(ps[i].x + 1.3).toBeLessThan(Math.min(lo(ps, winds, 'x'), lo(ps, at(L, 'horn'), 'x')));
        }
        // nobody on top of anybody: every two seats at least a chair apart (a timpani set its 1.3 m)
        const r = (i: number) => (L[i] === 'timpani' ? 1.3 : 0.34);
        for (let i = 0; i < L.length; i++)
          for (let j = i + 1; j < L.length; j++) expect(Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z), `${L[i]} ${i}, ${L[j]} ${j}`).toBeGreaterThan(r(i) + r(j) - 0.02);
      });

  it('a phone held upright seats them in shorter rows, deeper: narrower than a computer’s', () => {
    for (const L of [B5, B5_TB]) {
      const wide = places(L, 2);
      const tall = places(L, 0.85);
      const span = (ps: Place[], k: 'x' | 'z') => Math.max(...ps.map((p) => p[k])) - Math.min(...ps.map((p) => p[k]));
      expect(span(tall, 'x')).toBeLessThan(span(wide, 'x') * 0.8);
      expect(span(tall, 'z')).toBeGreaterThan(span(wide, 'z'));
    }
  });

  it('the sound takes the wide stage whatever the view', () => {
    expect(places(B5, 0.5).some((p, i) => p.z !== places(B5)[i].z)).toBe(true);
    expect(seats(B5)).toEqual(places(B5).map((p) => [p.x, p.z]));
    // heard from where they sit: the first violins left, the cellos and basses right, the brass at the back
    const s = seats(B5);
    expect(s[13][0]).toBeLessThan(-0.5);
    expect(s[16][0]).toBeGreaterThan(0.5);
    expect(s[17][0]).toBeGreaterThan(0.5);
    for (const i of at(B5, 'horn')) expect(s[i][1]).toBeGreaterThan(s[13][1] + 2);
  });

  it('missing instruments close up: no strings, the woodwinds in front on the floor; no woodwinds, the brass behind the strings', () => {
    const noStrings: Voice[] = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'horn', 'trumpet', 'timpani'];
    const a = places(noStrings);
    for (const i of [0, 1, 2, 3]) expect(a[i].y).toBe(0);
    expect(Math.min(...a.slice(0, 4).map((p) => p.z))).toBeCloseTo(Math.min(...a.map((p) => p.z)), 9);
    for (const i of [4, 5, 6]) expect(a[i].z).toBeGreaterThan(Math.max(...a.slice(0, 4).map((p) => p.z)) + 0.5);
    const noWinds: Voice[] = ['horn', 'horn', 'trumpet', 'violin', 'violin', 'viola', 'cello'];
    const b = places(noWinds);
    for (const i of [0, 1, 2]) {
      expect(b[i].z).toBeGreaterThan(Math.max(...b.slice(3).map((p) => p.z)) + 0.6);
      expect(b[i].y).toBe(RISE);
    }
    // a string quintet: the four on an arc, the bass behind the cello
    const q = places(['violin', 'violin', 'viola', 'cello', 'bass']);
    expect(q[4].z).toBeGreaterThan(q[3].z + 0.5);
    expect(q.map((p) => p.y)).toEqual([0, 0, 0, 0, 0]);
    // the basses alone are the strings in front
    const basses = places(['bass', 'bass', 'flute', 'oboe', 'horn']);
    expect(Math.max(basses[0].z, basses[1].z)).toBeLessThan(basses[2].z);
  });

  it('a section’s desks sit together, two abreast, the next behind them', () => {
    const L: Voice[] = ['violin', 'violin', 'violin', 'violin', 'violin', 'violin', 'viola', 'viola', 'cello', 'cello', 'flute'];
    const ps = places(L);
    const plan = orchestraPlan(kinds(L));
    // six violins: three firsts, three seconds; the firsts' third desk behind the first two
    expect(plan.strings.map((s) => s.length)).toEqual([3, 3, 2, 2]);
    const rad = radii(L, 2);
    expect(rad[2]).toBeCloseTo(Math.max(rad[0], rad[1]) + 1, 6);
    expect(ps[2].z).toBeGreaterThan(ps[0].z + 0.5);
    // each section in its own stretch of the arc: the firsts all left of the seconds, the violas left of the cellos
    expect(Math.max(ps[0].x, ps[1].x, ps[2].x)).toBeLessThan(Math.min(ps[3].x, ps[4].x, ps[5].x));
    expect(Math.max(ps[6].x, ps[7].x)).toBeLessThan(Math.min(ps[8].x, ps[9].x));
  });

  it('a keyboard stands at the back on the left, clear of everyone', () => {
    const L: Voice[] = [...B5, 'grand'];
    const ps = places(L);
    const g = ps[L.length - 1];
    for (let i = 0; i < B5.length; i++) expect(g.x + 1.4).toBeLessThan(ps[i].x);
    expect(g.z).toBeGreaterThan(0.5);
    expect(g.y).toBe(0);
  });
});

describe('orchestra: the risers', () => {
  for (const aspect of [2, 0.85])
    it(`each raised row stands on its riser, no one on the floor under one (${aspect < TALL ? 'a phone' : 'a computer'})`, () => {
      for (const L of [B5, B5_TB, ['violin', 'violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'horn', 'timpani'] as Voice[]]) {
        const ks = kinds(L);
        const ps = seatPlaces(ks, aspect);
        const rs = seatRisers(ks, aspect);
        // one riser per raised row, a step each
        expect(rs.map((r) => r.y)).toEqual(rs.map((_, k) => (k + 1) * RISE));
        ps.forEach((p, i) => {
          // (a timpani set's centre is 0.3 m behind its row's line)
          const R = (r: (typeof rs)[number]) => Math.hypot(p.x, p.z - (L[i] === 'timpani' ? 0.3 : 0) - r.zc);
          const A = (r: (typeof rs)[number]) => Math.atan2(p.x, p.z - (L[i] === 'timpani' ? 0.3 : 0) - r.zc);
          const on = rs.filter((r) => R(r) >= r.r0 - 0.4 && R(r) <= r.r1 + 0.4 && A(r) >= r.a0 - 0.3 / R(r) && A(r) <= r.a1 + 0.3 / R(r));
          if (p.y > 0) {
            const mine = rs.find((r) => r.y === p.y)!;
            expect(R(mine), `${L[i]} ${i}`).toBeGreaterThan(mine.r0);
            expect(R(mine), `${L[i]} ${i}`).toBeLessThan(mine.r1);
            expect(A(mine), `${L[i]} ${i}`).toBeGreaterThan(mine.a0);
            expect(A(mine), `${L[i]} ${i}`).toBeLessThan(mine.a1);
          } else expect(on, `${L[i]} ${i} on the floor, clear of the risers`).toEqual([]);
        });
      }
    });

  it('the 3D seats stand on them: an instrument’s seat at its riser’s height, its top above it', () => {
    const parts = B5.map((v) => {
      const k = kinds([v])[0];
      return { family: k.family, kind: k.kind, bowed: k.family === 'bowed' ? ({ id: v } as never) : null, reed: k.family === 'reed' ? (v as 'oboe') : undefined, brass: k.family === 'brass' ? (v as 'horn') : undefined };
    });
    const s3 = ensembleSeats(parts, 2);
    const ps = places(B5, 2);
    s3.forEach((s, i) => {
      expect(s.c[0]).toBeCloseTo(ps[i].x, 9);
      expect(s.c[1]).toBeCloseTo(ps[i].y, 9);
      expect(s.T[13], `${B5[i]} ${i}: lifted with its riser`).toBeGreaterThanOrEqual(ps[i].y - 1e-9);
      expect(s.top).toBeGreaterThan(ps[i].y + 0.7);
    });
  });
});
