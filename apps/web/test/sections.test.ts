// Organising a large lineup (orchestra/sections.ts): Beethoven's Fifth's eighteen seats as twelve sections,
// desks added and taken off, a section's instrument and lines changed as one, the room the stage has (its
// audio thread's, assign.ts fitsStage), an address's rules following each seat when no file is loaded, and
// the keys choosing a section's desks together.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyAddress, formatAddress, parseAddress } from '../src/address.ts';
import { parseMidi, type MidiSong } from '../src/midi-file.ts';
import { deskOf, fitsStage, lineupOf, mayBecome, MAX_SEATS, playersOf, seatFor, type Voice } from '../src/orchestra/assign.ts';
import { toggleKeys, keysFor } from '../src/orchestra/keys.ts';
import { PIECES, piecePlan, pieceSong } from '../src/orchestra/pieces.ts';
import { planByRules, rulesOf } from '../src/orchestra/rules.ts';
import { addDesk, addSeat, familyOf, removeSeats, rulesThrough, seatNames, seatRules, sectionName, sectionsOf, setSeatsLines, setSeatsRoute, setSeatsVoice } from '../src/orchestra/sections.ts';
import { QUINTET, SYMPHONY } from './presets.ts';

const ORCHESTRA: Voice[] = ['flute', 'flute', 'oboe', 'oboe', 'clarinet', 'clarinet', 'bassoon', 'bassoon', 'horn', 'horn', 'trumpet', 'trumpet', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass'];
const I = PIECES.find((p) => p.id === 'beethoven5-i')!;
const load = (file: string): MidiSong => {
  const b = readFileSync(new URL(`../public/pieces/${file}`, import.meta.url));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
const song = pieceSong(load(I.file), I);
const lines = song.lines;
const address = parseAddress('/orchestra', SYMPHONY.slice(SYMPHONY.indexOf('?')));
const rules = address.orchestra!.lines!;
/** the symphony as its address seats it, the first movement loaded */
const symphony = () => planByRules(lines, ORCHESTRA, rules);
const secs = (p: ReturnType<typeof symphony>) => sectionsOf(lineupOf(p), p.parts.map((q) => q.lines));
const CAP = 8;
const PHONE = 6;

describe('the stage’s room: its audio thread’s', () => {
  it('the symphony’s eighteen fit a computer and a phone; a trombone, more desks and a piano still do', () => {
    for (const cap of [CAP, PHONE]) {
      expect(fitsStage(ORCHESTRA, cap)).toBe(true);
      expect(fitsStage([...ORCHESTRA, 'trombone', 'violin', 'violin'], cap)).toBe(true);
      expect(fitsStage([...ORCHESTRA, 'grand'], cap)).toBe(true);
    }
    // two pianos on top of it: a computer only; three: neither
    expect(fitsStage([...ORCHESTRA, 'grand', 'grand'], CAP)).toBe(false);
    expect(fitsStage([...ORCHESTRA.slice(0, 13), 'grand', 'grand'], CAP)).toBe(true);
    // never more than an address carries
    expect(fitsStage(Array<Voice>(MAX_SEATS).fill('flute'), CAP)).toBe(true);
    expect(fitsStage(Array<Voice>(MAX_SEATS + 1).fill('flute'), CAP)).toBe(false);
    // a change that costs no more is always allowed (a section off, a flute for an oboe), even past the room
    const heavy: Voice[] = ['grand', 'grand', 'grand', 'violin'];
    expect(fitsStage(heavy, 2)).toBe(false);
    expect(mayBecome(heavy, ['grand', 'grand', 'violin'], 2)).toBe(true);
    expect(mayBecome(heavy, ['grand', 'grand', 'grand', 'flute'], 2)).toBe(true);
    expect(mayBecome(heavy, ['grand', 'grand', 'grand', 'cello'], 2)).toBe(false);
  });
  it('a new instrument sits after its kind, else at its place in the score (a trombone after the trumpets)', () => {
    expect(seatFor(ORCHESTRA, 'trombone')).toBe(12);
    expect(seatFor(ORCHESTRA, 'violin')).toBe(15);
    expect(seatFor(ORCHESTRA, 'grand')).toBe(18);
    expect(seatFor(['violin', 'violin', 'viola', 'cello'], 'flute')).toBe(0);
    expect(seatFor(['violin', 'violin', 'cello'], 'viola')).toBe(2);
  });
});

describe('sections: the desks of one instrument playing the same lines', () => {
  it('the symphony’s eighteen seats are twelve sections, one per staff, in four families', () => {
    const s = secs(symphony());
    expect(s.map((x) => `${x.voice}×${x.seats.length}`)).toEqual(['flute×2', 'oboe×2', 'clarinet×2', 'bassoon×2', 'horn×2', 'trumpet×2', 'timpani×1', 'violin×1', 'violin×1', 'viola×1', 'cello×1', 'bass×1']);
    expect(s.map((x) => x.lines)).toEqual(lines.map((_, i) => [i]));
    expect([...new Set(s.map((x) => familyOf(x.voice)))]).toEqual(['winds', 'brass', 'percussion', 'strings']);
    const names = seatNames(ORCHESTRA);
    expect(s.map((x) => sectionName(x, names)).slice(0, 2)).toEqual(['flute 1–2', 'oboe 1–2']);
    expect(s.slice(7, 9).map((x) => sectionName(x, names))).toEqual(['violin 1', 'violin 2']);
    expect(sectionName(s[11], names)).toBe('double bass');
  });
  it('with no file, the address’s routing groups them the same way', () => {
    const s = sectionsOf(ORCHESTRA, seatRules(ORCHESTRA.length, rules));
    expect(s.map((x) => x.seats)).toEqual(secs(symphony()).map((x) => x.seats));
  });
  it('a seat waiting for a line is a section of its own; so is a seat whose lines differ from its neighbour’s', () => {
    expect(sectionsOf(['cello', 'cello'], [[], []]).length).toBe(2);
    expect(sectionsOf(['cello', 'cello'], [[3], [3]]).length).toBe(1);
    expect(sectionsOf(['cello', 'cello'], [[3], [2, 3]]).length).toBe(2);
    // (neighbours only: two grands apart are two sections)
    expect(sectionsOf(['grand', 'violin', 'grand'], [[0], [0], [0]]).length).toBe(3);
  });
});

describe('a section changed as one', () => {
  it('another desk: a seat like its last, beside it, playing its lines, a player of its own', () => {
    const p = symphony();
    // a second desk for the first violins (seat 13): seat 14, on the same line; the seconds move along
    const r = addDesk(p, lines, [13], CAP)!;
    expect(lineupOf(r.plan)).toEqual([...ORCHESTRA.slice(0, 14), 'violin', ...ORCHESTRA.slice(14)]);
    expect(r.from).toEqual([...Array.from({ length: 14 }, (_, k) => k), 13, ...Array.from({ length: 4 }, (_, k) => 14 + k)]);
    expect(r.plan.parts[14].lines).toEqual(r.plan.parts[13].lines);
    expect(playersOf(r.plan)[14]).toBe(1);
    const s = secs(r.plan);
    expect(s[7]).toEqual({ voice: 'violin', seats: [13, 14], lines: [7] });
    expect(s.length).toBe(12);
    // a third flute on the flutes' staff (two voices): it doubles the first flute's
    const f = addDesk(p, lines, [0, 1], CAP)!;
    expect(lineupOf(f.plan).slice(0, 4)).toEqual(['flute', 'flute', 'flute', 'oboe']);
    expect([0, 1, 2].map((k) => deskOf(f.plan, lines, 0, k))).toEqual([0, 1, 0]);
    // no room: refused (a phone's stage with a piano too: 44.7 % of the 45.6 % a phone's stage carries)
    const full = addSeat(p, lines, 'grand', [], PHONE)!.plan;
    expect(addDesk(full, lines, [18], PHONE)).toBeNull();
    expect(addDesk(full, lines, [0, 1], PHONE)).toBeNull();
    expect(addDesk(full, lines, [0, 1], CAP)).not.toBeNull();
  });
  it('desks taken off: one, or the whole section; its lines fall silent only when no other seat plays them', () => {
    const p = symphony();
    const one = removeSeats(p, lines, [1])!;
    expect(lineupOf(one.plan).slice(0, 3)).toEqual(['flute', 'oboe', 'oboe']);
    expect(one.plan.lines[0].map((r) => r.part)).toEqual([0]);
    expect(one.from.slice(0, 3)).toEqual([0, 2, 3]);
    // the first violins off: their line is silent, the seconds' stays on the violin left
    const vln = removeSeats(p, lines, [13])!;
    expect(vln.plan.lines[7]).toEqual([]);
    expect(vln.plan.lines[8].map((r) => vln.plan.parts[r.part].voice)).toEqual(['violin']);
    // never the last instrument
    expect(removeSeats({ parts: [{ voice: 'cello', lines: [0] }], lines: [[{ part: 0, shift: 0 }]] }, lines.slice(0, 1), [0])).toBeNull();
  });
  it('another instrument for the whole section, each desk keeping its lines (as far as the stage has room)', () => {
    const p = symphony();
    const r = setSeatsVoice(p, lines, [4, 5], 'oboe', CAP)!;
    expect(lineupOf(r.plan).slice(2, 6)).toEqual(['oboe', 'oboe', 'oboe', 'oboe']);
    expect(r.plan.parts[4].lines).toEqual([2]);
    // (still two sections: their lines differ)
    expect(secs(r.plan).length).toBe(12);
    // the first violins as a piano: room on a computer and a phone; both violins as pianos: on neither
    for (const cap of [CAP, PHONE]) expect(setSeatsVoice(p, lines, [13], 'grand', cap)).not.toBeNull();
    expect(setSeatsVoice(p, lines, [13, 14], 'grand', CAP)).toBeNull();
  });
  it('a line given to (or taken from) a section reaches every desk; the whole file at once', () => {
    const p = symphony();
    const r = setSeatsRoute(p, lines, [0, 1], 2, true);
    expect(r.parts[0].lines).toEqual([0, 2]);
    expect(r.parts[1].lines).toEqual([0, 2]);
    expect(secs(r)[0].seats).toEqual([0, 1]);
    const all = setSeatsLines(p, lines, [16], lines.map((_, i) => i));
    expect(all.lines.every((rs) => rs.some((x) => x.part === 16))).toBe(true);
    expect(setSeatsLines(all, lines, [16], []).parts[16].lines).toEqual([]);
  });
});

describe('an address’s routing follows the seats when no file is loaded', () => {
  const lineupFor = (from: (number | null)[], add?: Voice) => from.map((o) => (o === null ? add! : ORCHESTRA[o]));
  it('a desk added plays its section’s staff; a seat off leaves its staff silent; the rest stay on theirs', () => {
    // a second cello (seat 17, from seat 16): staff eleven on both cellos
    const from = [...Array.from({ length: 17 }, (_, k) => k), 16, 17];
    const r = rulesThrough(rules, from);
    expect(r[10].seats).toEqual([16, 17]);
    expect(r[11].seats).toEqual([18]);
    expect(r.slice(0, 10)).toEqual(rules.slice(0, 10));
    // the address it writes reopens as the same orchestra and routing
    const a = { ...emptyAddress(), orchestra: { seats: lineupFor(from), lines: r, keys: null } };
    const back = parseAddress('/orchestra', formatAddress(a).slice('/orchestra'.length));
    expect(back.orchestra!.seats).toEqual(lineupFor(from));
    expect(back.orchestra!.lines).toEqual(r);
    // and a file loaded on it is routed as written: both cellos on staff eleven
    const plan = planByRules(lines, lineupFor(from), r);
    expect(plan.lines[10].map((x) => x.part)).toEqual([16, 17]);
    // the timpani off (seat 12): staff seven silent, every later seat one along
    const t = rulesThrough(rules, ORCHESTRA.map((_, k) => k).filter((k) => k !== 12));
    expect(t[6].seats).toEqual([]);
    expect(t[7].seats).toEqual([12]);
    // a new instrument given a silent staff back
    const back2 = rulesThrough(t, [...Array.from({ length: 12 }, (_, k) => k), null, ...Array.from({ length: 5 }, (_, k) => 12 + k)], [6]);
    expect(back2).toEqual(rules);
  });
  it('the presets read as they did: the symphony and the Daylight quintet', () => {
    expect(rulesOf(symphony(), lines).map((r) => r.seats)).toEqual(rules.map((r) => r.seats));
    const q = parseAddress('/orchestra', QUINTET.slice(QUINTET.indexOf('?'))).orchestra!;
    expect(q.seats).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
    expect(sectionsOf(q.seats, seatRules(5, q.lines)).map((s) => s.seats)).toEqual([[0], [1], [2], [3], [4]]);
  });
});

describe('the keys choose a section’s desks together', () => {
  it('all in, all out (never nothing); from some, all; from split, the section alone', () => {
    const c = keysFor(ORCHESTRA);
    expect(c.parts).toEqual([0]);
    const a = toggleKeys(c, [0, 1], 18);
    expect(a.parts).toEqual([0, 1]);
    expect(toggleKeys(a, [0, 1], 18)).toBe(a);
    const b = toggleKeys(a, [16], 18);
    expect(toggleKeys(b, [0, 1], 18).parts).toEqual([16]);
    expect(toggleKeys({ parts: [0], split: true, byUser: true }, [13, 14], 18)).toEqual({ parts: [13, 14], split: false, byUser: true });
  });
});

describe('the piece’s own plan is the address’s', () => {
  it('Beethoven I as a piece seats the same twelve sections', () => {
    const p = piecePlan(I, lines, 18);
    expect(secs(p).map((s) => s.seats)).toEqual(secs(symphony()).map((s) => s.seats));
  });
});
