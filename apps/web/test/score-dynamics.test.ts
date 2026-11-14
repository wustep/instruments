// The bundled pieces' dynamics. Five came from Mutopia with none (every note at one velocity), and one of
// this project's own held its viola and cello at one: their scores' marks are written into the files as
// velocities and expression (scripts/score-dynamics). Here: the marks' reading (a crescendo arrives at the
// dynamic it leads to, a sforzando is an accent, a fortepiano falls at once), that each file is what its
// marks make, and that the pieces keep a real dynamic range, where their scores have it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { giveDynamics, rangesOf, readMarks, SHAPE, sha256, timeline } from '../../../scripts/score-dynamics/dynamics.ts';
import { SCORES } from '../../../scripts/score-dynamics/marks/index.ts';
import { isCC, isOn, readSmf } from '../../../scripts/score-dynamics/smf.ts';
import { lineShapes, express } from '../src/expression.ts';
import { parseMidi, type MidiSong } from '../src/midi-file.ts';
import { PIECES } from '../src/orchestra/pieces.ts';

const bytesOf = (file: string) => new Uint8Array(readFileSync(new URL(`../public/pieces/${file}`, import.meta.url)));
const songOf = (file: string): MidiSong => {
  const b = bytesOf(file);
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
/** a line's notes (time, velocity) within [from, to) seconds */
const vels = (song: MidiSong, line: number, from = 0, to = Infinity) => song.events.flatMap((e) => (e.kind === 'on' && e.line === line && e.t >= from && e.t < to ? [e.vel] : []));
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
/** a line's expression (0…127) at its lowest and highest */
const cc11 = (song: MidiSong, line: number) => {
  const v = song.events.flatMap((e) => (e.kind === 'cc' && e.cc === 11 && e.line === line ? [Math.round(e.value * 127)] : []));
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
};

describe('a score’s marks as a level in time', () => {
  // bars of four quarters, 480 ticks each
  const place = (bar: number, beat: number) => (bar - 1) * 1920 + (beat - 1) * 480;
  const read = (text: string, start = -5.5) => timeline(readMarks(text, place), start, 1920, 40 * 1920, SHAPE);

  it('a dynamic holds until the next; cresc. and dim. arrive at the dynamic they lead to', () => {
    const t = read('1 p  5 cresc  9 f  13 dim  17 pp');
    expect(t.level(place(1, 1))).toBe(-11);
    expect(t.level(place(4, 4))).toBe(-11);
    // half way through the crescendo, half way from piano to forte
    expect(t.level(place(7, 1))).toBeCloseTo((-11 + -2.5) / 2, 6);
    expect(t.level(place(9, 1))).toBe(-2.5);
    expect(t.level(place(12, 1))).toBe(-2.5);
    expect(t.level(place(15, 1))).toBeCloseTo((-2.5 + -15) / 2, 6);
    expect(t.level(place(30, 1))).toBe(-15);
  });

  it('a crescendo before a sudden piano grows, then falls at once; one said twice is one', () => {
    const t = read('1 p  2 <  4 ! p');
    expect(t.level(place(4, 1) - 1)).toBeGreaterThan(-8.1);
    expect(t.level(place(4, 1))).toBe(-11);
    // "cresc." written again while it runs does not begin another
    const again = read('1 p  2 cresc  4 cresc  6 f');
    expect(again.level(place(4, 1))).toBeCloseTo(-11 + (8.5 * 2) / 4, 6);
  });

  it('a hairpin with nowhere to arrive moves by a mark or so, and stays there; one ended before a dynamic goes most of the way to it', () => {
    const t = read('1 mp  2 <  3 !  4 >  5 !');
    expect(t.level(place(3, 1))).toBeCloseTo(-8 + SHAPE.hairpin, 6);
    expect(t.level(place(3, 3))).toBeCloseTo(-8 + SHAPE.hairpin, 6);
    expect(t.level(place(6, 1))).toBeCloseTo(-8, 6);
    const to = read('1 p  2 <  2:4 !  3 ff');
    expect(t.level(place(1, 1))).toBe(-8);
    expect(to.level(place(2, 4))).toBeCloseTo(-11 + 0.85 * 11, 6);
    expect(to.level(place(3, 1))).toBe(0);
  });

  it('sf is an accent over the level, which stays; fp begins loud and is piano at once', () => {
    const t = read('1 p  2 sf  3 fp  4 mf  5 sfp');
    expect(t.level(place(2, 1))).toBe(-11);
    expect(t.accents.get(place(2, 1))).toEqual({ over: SHAPE.accent });
    expect(t.accents.get(place(3, 1))).toEqual({ peak: -2.5, to: -11 });
    expect(t.level(place(3, 1))).toBe(-11);
    // from a level already loud, a fortepiano's attack is over it
    expect(t.accents.get(place(5, 1))).toEqual({ peak: -2.5, to: -11 });
    // and an accent in a crescendo is over the level the crescendo has reached there, not where it began
    const up = read('1 p  2 cresc  3 sf  4 sf  5 sf  6 f');
    expect(up.level(place(5, 1)) - up.level(place(3, 1))).toBeCloseTo(8.5 / 2, 6);
    expect([3, 4, 5].map((b) => up.accents.get(place(b, 1)))).toEqual([{ over: SHAPE.accent }, { over: SHAPE.accent }, { over: SHAPE.accent }]);
    expect(t.level(place(5, 2))).toBe(-11);
  });

  it('a third of the way to the next mark (mf+, p−); a mark that is none is refused', () => {
    expect(read('1 mf+').level(0)).toBeCloseTo(-5.5 + 1, 6);
    expect(read('1 p-').level(0)).toBeCloseTo(-11 - 4 / 3, 6);
    expect(() => read('1 loud')).toThrow(/no such mark/);
    expect(() => read('p 1')).toThrow(/before any place/);
  });
});

describe('the bundled pieces’ dynamics', () => {
  it('each file is what its marks make of it, and making it again changes nothing', () => {
    for (const m of SCORES) {
      const piece = PIECES.find((p) => p.id === m.id)!;
      expect(piece.file, m.id).toBe(m.file);
      const now = bytesOf(m.file);
      expect(sha256(now), m.id).toBe(piece.sha256);
      const made = giveDynamics(now, m).bytes;
      expect(sha256(made), `${m.id}: run npx tsx scripts/score-dynamics/build.ts`).toBe(piece.sha256);
      // every line it names is one the piece's file has
      const lines = rangesOf(now);
      for (const l of Object.keys(m.players)) expect(lines[Number(l)], `${m.id} line ${l}`).toBeDefined();
    }
  });

  it('nothing but the dynamics is touched: every other event of every track, tick for tick, is the file’s as it came', () => {
    // (the files as they came are not kept in the repository: what is checked is that a build moves
    // nothing else. Built again with other marks, a file differs only in its velocities and its CC11)
    for (const m of SCORES) {
      const now = bytesOf(m.file);
      const other = giveDynamics(now, { ...m, all: '', lines: {}, start: 'ff', shape: { ...m.shape, uneven: 0 } }).bytes;
      expect(sha256(other), m.id).not.toBe(sha256(now));
      const rest = (b: Uint8Array) => {
        const s = readSmf(b);
        return { format: s.format, ppq: s.ppq, tracks: s.tracks.map((t) => t.filter((e) => !isCC(e, 11)).map((e) => `${e.tick}:${isOn(e) ? [e.bytes[0], e.bytes[1]] : e.bytes}`)) };
      };
      expect(rest(other), m.id).toEqual(rest(now));
    }
  });

  it('every line of the six has dynamics of its own: the page’s automatic expression leaves them as written', () => {
    for (const m of SCORES) {
      const song = songOf(m.file);
      const shapes = lineShapes(song);
      song.lines.forEach((l, i) => expect(shapes[i].flat, `${m.id} line ${i} (${l.name || l.instrument})`).toBe(false));
      expect(express(song).shaped, m.id).toBe(false);
    }
  });

  it('the five that came flat keep a real range: velocities a mark or more apart on every line, expression that moves on the bowed and the blown', () => {
    for (const m of SCORES) {
      if (m.id === 'everything-so-far') continue;
      const song = songOf(m.file);
      for (const [key, who] of Object.entries(m.players)) {
        const li = Number(key);
        const v = vels(song, li);
        const label = `${m.id} line ${li} (${who})`;
        // at least 20 velocity steps between its softest and loudest note, and many levels between
        expect(Math.max(...v) - Math.min(...v), label).toBeGreaterThanOrEqual(20);
        expect(new Set(v).size, label).toBeGreaterThanOrEqual(12);
        expect(Math.max(...v), label).toBeLessThanOrEqual(124);
        const cc = cc11(song, li);
        if (who === 'piano' || who === 'timpani') expect(cc, label).toBeNull();
        else {
          expect(cc![1], label).toBe(127);
          expect(cc![0], label).toBeLessThanOrEqual(116);
          expect(cc![0], label).toBeGreaterThanOrEqual(80);
        }
      }
    }
  });

  it('Beethoven’s Fifth: the motto fortissimo, the answer piano, the second theme piano, the tutti fortissimo', () => {
    const song = songOf('beethoven-op67-i.mid');
    // bars of 0.625 s (the file's half note = 96)
    const bar = (n: number) => (n - 1) * 0.625;
    for (const line of [7, 8, 9, 10]) {
      const motto = mean(vels(song, line, bar(1), bar(5)));
      const answer = mean(vels(song, line, bar(8) + 0.4, bar(18)));
      expect(motto, `line ${line} motto`).toBeGreaterThan(100);
      expect(answer, `line ${line} answer`).toBeLessThan(66);
    }
    // the first violins' second theme (bars 63–70), and the tutti that ends the exposition (110–122)
    expect(mean(vels(song, 7, bar(63), bar(71)))).toBeLessThan(66);
    for (const line of [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) expect(mean(vels(song, line, bar(110), bar(122))), `line ${line} tutti`).toBeGreaterThan(98);
    // the sforzandi on the way to the first tutti (38–43): each over the notes round it
    const v1 = song.events.filter((e) => e.kind === 'on' && e.line === 7 && e.t >= bar(38) - 1e-6 && e.t < bar(44));
    const onBar = v1.filter((e) => Math.abs(e.t / 0.625 - Math.round(e.t / 0.625)) < 1e-3).map((e) => (e as { vel: number }).vel);
    const off = v1.filter((e) => Math.abs(e.t / 0.625 - Math.round(e.t / 0.625)) >= 1e-3).map((e) => (e as { vel: number }).vel);
    expect(mean(onBar) - mean(off)).toBeGreaterThan(8);
    // the winds' piano is the controller's too: a flute's loudness hardly follows its velocity
    expect(cc11(song, 0)![0]).toBeLessThan(95);
  });

  it('the Emperor’s hymn: piano, the fz on the last line’s two high phrases, pianissimo at the close', () => {
    const song = songOf('haydn-op76-3-ii.mid');
    // a pickup of 2.5 s, bars of 5 s (quarter = 48)
    const at = (bar: number, beat = 1) => 2.5 + (bar - 1) * 5 + (beat - 1) * 1.25;
    const first = vels(song, 0, 0, at(12, 3) - 0.01);
    const fz = song.events.find((e) => e.kind === 'on' && e.line === 0 && Math.abs(e.t - at(12, 3)) < 0.01) as { vel: number };
    expect(fz.vel - mean(first)).toBeGreaterThan(12);
    expect(mean(first)).toBeLessThan(78);
    // the close (bar 101 on) under everything before it
    for (const line of [0, 1, 2, 3]) expect(mean(vels(song, line, at(101))), `line ${line}`).toBeLessThan(mean(vels(song, line, 0, at(100))) - 5);
  });

  it('the Brandenburg’s terraces: the solo violin forte, piano at 79, forte again at 89; the Air nowhere at full force', () => {
    const b5 = songOf('bach-bwv1050-iii.mid');
    // bars of 1 s (quarter = 120, 2/4)
    const forte = mean(vels(b5, 1, 60, 78));
    expect(forte - mean(vels(b5, 1, 78, 88))).toBeGreaterThan(12);
    expect(mean(vels(b5, 1, 89, 98)) - mean(vels(b5, 1, 78, 88))).toBeGreaterThan(12);
    // the harpsichord's, on a piano: velocities alone
    expect(mean(vels(b5, 6, 60, 78)) - mean(vels(b5, 6, 78, 88))).toBeGreaterThan(8);
    const air = songOf('bach-bwv1068-air-trombones.mid');
    for (const line of [0, 1, 2, 3]) {
      const v = vels(air, line);
      expect(Math.max(...v), `line ${line}`).toBeLessThan(116);
      expect(mean(v), `line ${line}`).toBeGreaterThan(70);
      expect(mean(v), `line ${line}`).toBeLessThan(96);
    }
  });

  it('Everything So Far: the viola and the cello swell and fade, under the tune; every other line is as it was written', () => {
    const song = songOf('fable-everything-so-far.mid');
    for (const line of [8, 9]) {
      const cc = cc11(song, line)!;
      expect(cc[1]).toBe(127);
      expect(cc[0]).toBeLessThan(100);
      // swells inside the notes: the controller moves many times a note
      const moves = song.events.filter((e) => e.kind === 'cc' && e.cc === 11 && e.line === line).length;
      expect(moves / vels(song, line).length).toBeGreaterThan(10);
      // never over the tune: but for the one mezzo-forte at the return (bar 54), no louder than piano
      const v = vels(song, line).sort((a, b) => a - b);
      expect(v[v.length - 2]).toBeLessThanOrEqual(64);
      expect(new Set(v).size).toBeGreaterThanOrEqual(8);
    }
    // the others: their notes' velocities as first bundled (a count and a sum each), their controller at rest
    const sums = [0, 1, 2, 3, 4, 5, 6, 7, 10].map((l) => [vels(song, l).length, vels(song, l).reduce((a, b) => a + b, 0)]);
    expect(sums).toEqual([[23, 1212], [69, 4743], [70, 4043], [48, 3930], [255, 24671], [188, 17005], [39, 1473], [44, 1723], [51, 2639]]);
    for (const l of [0, 1, 2, 3, 4, 5, 6, 7, 10]) expect(cc11(song, l)).toEqual([127, 127]);
  });
});
