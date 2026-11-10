// Routing by what a file calls its lines (orchestra/rules.ts): the routing an address carries applies
// to a file dropped in later, by name ("Cello" is "Violoncello"), then program, then place; a file it
// does not fit is matched by register as any hand-picked lineup is. The files are constructed (no
// copyrighted music): one has the track names and programs of Max Richter's "On the Nature of
// Daylight" string quintet (Violin I, Violin II, Viola, Violoncello, Contrabass on GM 40/40/41/42/43).
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { lineupOf, matchLineup, planOf, type LineInfo, type Plan, type Voice } from '../src/orchestra/assign.ts';
import { keyOf, matchRules, planByRules, remapRules, rulesOf, type LineRule } from '../src/orchestra/rules.ts';
import { parseAddress } from '../src/address.ts';
import { smf } from './smf.ts';
import { QUINTET } from './presets.ts';

/** a format-1 file: a tempo track, then one track per part (its name if any, its program if any, a
 *  few notes) */
function file(parts: { name?: string; program?: number; notes: number[] }[]): LineInfo[] {
  const name = (s: string): [number, ...number[]] => [0, 0xff, 0x03, s.length, ...[...s].map((c) => c.charCodeAt(0))];
  const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]];
  parts.forEach((p, ch) => {
    const t: [number, ...number[]][] = [];
    if (p.name) t.push(name(p.name));
    if (p.program !== undefined) t.push([0, 0xc0 | ch, p.program]);
    for (const m of p.notes) t.push([0, 0x90 | ch, m, 64], [480, 0x80 | ch, m, 0]);
    tracks.push(t);
  });
  const b = smf(480, tracks);
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer).lines;
}
const VN1 = [70, 77, 82, 85, 89, 85];
const VN2 = [61, 65, 68, 70, 73, 77];
const VA = [56, 58, 61, 63, 66, 61];
const VC = [49, 51, 53, 54, 56, 53];
const CB = [34, 37, 41, 44, 46, 49];
const DAYLIGHT_LIKE = file([
  { name: 'Violin I', program: 40, notes: VN1 },
  { name: 'Violin II', program: 40, notes: VN2 },
  { name: 'Viola', program: 41, notes: VA },
  { name: 'Violoncello', program: 42, notes: VC },
  { name: 'Contrabass', program: 43, notes: CB },
]);
const preset = parseAddress(QUINTET.split('?')[0], `?${QUINTET.split('?')[1]}`).orchestra!;
const lineup = preset.seats;
/** each line's seats */
const seats = (p: Plan) => p.lines.map((rs) => rs.map((r) => r.part));
/** each line's instruments */
const voices = (p: Plan) => p.lines.map((rs) => rs.map((r) => p.parts[r.part].voice));

describe('routing by name, program and place', () => {
  it('the quintet preset: the Daylight quintet’s five lines on violin, violin, viola, cello and double bass, as written', () => {
    const p = planByRules(DAYLIGHT_LIKE, lineup, preset.lines!);
    expect(lineupOf(p)).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
    expect(seats(p)).toEqual([[0], [1], [2], [3], [4]]);
    // (no line moved by an octave: each is in its instrument's range)
    expect(p.lines.every((rs) => rs[0].shift === 0)).toBe(true);
  });

  it('names: "Cello" is "Violoncello", desks by number or numeral, any order in the file', () => {
    const f = file([
      { name: 'Double Bass', notes: CB },
      { name: 'Vln. 2', notes: VN2 },
      { name: 'Cello', notes: VC },
      { name: 'Vla.', notes: VA },
      { name: 'violin 1', notes: VN1 },
    ]);
    expect(voices(planByRules(f, lineup, preset.lines!))).toEqual([['bass'], ['violin'], ['cello'], ['viola'], ['violin']]);
    expect(seats(planByRules(f, lineup, preset.lines!))).toEqual([[4], [1], [3], [2], [0]]);
    // and the other way round: a routing set for "Violoncello" takes a file's "Cello"
    const rules: LineRule[] = [{ name: 'Violoncello', program: -1, seats: [0] }];
    expect(matchRules([{ name: 'Cello', program: -1 }], rules)).toEqual([0]);
  });

  it('programs, in order, for a file whose tracks are not named as the rules (the names saying no other instrument)', () => {
    const f = file([
      { name: 'Track 1', program: 40, notes: VN1 },
      { name: 'Track 2', program: 40, notes: VN2 },
      { program: 41, notes: VA },
      { program: 42, notes: VC },
      { program: 43, notes: CB },
    ]);
    expect(seats(planByRules(f, lineup, preset.lines!))).toEqual([[0], [1], [2], [3], [4]]);
    // a flute line on GM 40 (a wrong program) is not taken for a violin
    expect(matchRules([{ name: 'Flute', program: 40 }], preset.lines!)).toEqual([-1]);
  });

  it('place, for rules that name nothing (a file of unnamed lines with no programs)', () => {
    const rules: LineRule[] = [
      { name: '', program: -1, seats: [1] },
      { name: '', program: -1, seats: [0] },
    ];
    const f = file([{ notes: VN1 }, { notes: VC }]);
    expect(seats(planByRules(f, ['cello', 'violin'], rules))).toEqual([[1], [0]]);
  });

  it('a file the routing does not fit is matched by register, as a hand-picked lineup always is', () => {
    const piano = file([
      { name: 'right hand', program: 0, notes: [72, 76, 79, 84] },
      { name: 'left hand', program: 0, notes: [48, 43, 36, 41] },
    ]);
    expect(planByRules(piano, lineup, preset.lines!)).toEqual(matchLineup(piano, lineup));
  });

  it('lines no rule takes go to the instruments left without one, else join the nearest', () => {
    const f = file([
      { name: 'Violin I', program: 40, notes: VN1 },
      { name: 'Violin II', program: 40, notes: VN2 },
      { name: 'Viola', program: 41, notes: VA },
      { name: 'Violoncello', program: 42, notes: VC },
      { name: 'Bassoon', program: 70, notes: CB },
    ]);
    // the bassoon (a cello by name, but the cello's rule is taken) goes to the seat left waiting
    expect(seats(planByRules(f, lineup, preset.lines!))).toEqual([[0], [1], [2], [3], [4]]);
    // with every seat busy, an extra line joins the instrument nearest its register
    const g = file([...[VN1, VN2, VA, VC, CB].map((notes, i) => ({ name: ['Violin I', 'Violin II', 'Viola', 'Cello', 'Contrabass'][i], notes })), { name: 'Descant', notes: [74, 76, 78] }]);
    expect(seats(planByRules(g, lineup, preset.lines!))[5]).toEqual([0]);
  });

  it('a plan made by hand comes back from its rules: duplicates, a line on two instruments, a silent line', () => {
    const lu: Voice[] = ['flute', 'violin', 'violin', 'viola', 'cello', 'bass'];
    const f = file([
      { name: 'Violin I', program: 40, notes: VN1 },
      { name: 'Violin II', program: 40, notes: VN2 },
      { name: 'Viola', program: 41, notes: VA },
      { name: 'Violoncello', program: 42, notes: VC },
      { name: 'Contrabass', program: 43, notes: CB },
      { name: 'Oboe', program: 68, notes: [74, 76] },
    ]);
    const hand = planOf(
      [
        { voice: 'flute', lines: [0] },
        { voice: 'violin', lines: [0] },
        { voice: 'violin', lines: [1] },
        { voice: 'viola', lines: [2] },
        { voice: 'cello', lines: [3, 4] },
        { voice: 'bass', lines: [4] },
      ],
      f,
    );
    const rules = rulesOf(hand, f);
    expect(rules.map((r) => [r.name, r.program, r.seats])).toEqual([
      ['Violin I', 40, [0, 1]],
      ['Violin II', 40, [2]],
      ['Viola', 41, [3]],
      ['Violoncello', 42, [4]],
      ['Contrabass', 43, [4, 5]],
      ['Oboe', 68, []],
    ]);
    expect(planByRules(f, lu, rules)).toEqual(hand);
    // a line's key: its tidied track name, else its instrument name; its program, if any
    expect(keyOf({ name: 'violinII:', instrument: 'violin', program: 40 })).toEqual({ name: 'violin II', program: 40 });
    expect(keyOf({ name: '\\new', instrument: 'viola', program: -1 })).toEqual({ name: 'viola', program: -1 });
  });

  it('a lineup changed with no file: each line stays with its instrument wherever it now sits', () => {
    const rules = preset.lines!;
    // a flute in front: every seat moves along one
    expect(remapRules(rules, lineup, ['flute', ...lineup]).map((r) => r.seats)).toEqual([[1], [2], [3], [4], [5]]);
    // the second violin gone: its line is dropped (a file's Violin II then goes by register)
    const r2 = remapRules(rules, lineup, ['violin', 'viola', 'cello', 'bass']);
    expect(r2.map((r) => [r.name, r.seats])).toEqual([
      ['Violin I', [0]],
      ['Viola', [1]],
      ['Cello', [2]],
      ['Contrabass', [3]],
    ]);
    // a silent line stays silent
    expect(remapRules([{ name: 'Oboe', program: 68, seats: [] }], lineup, ['cello'])).toEqual([{ name: 'Oboe', program: 68, seats: [] }]);
  });
});
