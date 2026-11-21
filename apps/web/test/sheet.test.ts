// The sheet music (sheet/score.ts, sheet/parts.ts): a MIDI file set out in bars as written values,
// spelled in its key, a part at a time or a few as a score, and the place in it as the file plays.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMidi, type MidiSong } from '../src/midi-file.ts';
import { express } from '../src/expression.ts';
import { planOf } from '../src/orchestra/assign.ts';
import { DEMOS, demoSong, PIECES, piecePlan, pieceSong } from '../src/orchestra/pieces.ts';
import { firstPart, partsOf, SCORE_MOST } from '../src/sheet/parts.ts';
import { barAt, buildScore, Q, soundingAt, spell, transposeKey, valuesOf, type Entry, type Score, type StaffPlan } from '../src/sheet/score.ts';
import { smf } from './smf.ts';

const load = (file: string): MidiSong => {
  const b = readFileSync(new URL(`../public/pieces/${file}`, import.meta.url));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const one = (lines: number[], clef: StaffPlan['clef'] = 'treble'): StaffPlan => ({ lines, clef });
/** a bar's staff as text: "r:8 g4:8 c5:q.~" (a pitch's printed accidental after its letter) */
const said = (es: Entry[]) => es.map((e) => (e.rest ? 'r' : e.pitches.map((p) => `${p.letter}${p.acc}${p.octave}`).join('+')) + ':' + e.dur + '.'.repeat(e.dots) + (e.tie ? '~' : '')).join(' ');
const fills = (sc: Score) => sc.bars.every((b) => b.staves.every((st) => st.reduce((a, e) => a + e.len, 0) === b.len && st.every((e, i) => i === 0 || e.start === st[i - 1].start + st[i - 1].len)));

describe('the sheet music: a file set out in bars', () => {
  it('spells a pitch in its key: C major’s chromatic notes, a minor key’s leading note raised', () => {
    const name = (m: number, f: number, minor = false) => {
      const p = spell(m, f, minor);
      return `${p.letter}${p.alter > 0 ? '#'.repeat(p.alter) : 'b'.repeat(-p.alter)}${p.octave}`;
    };
    expect([61, 63, 66, 68, 70].map((m) => name(m, 0))).toEqual(['c#4', 'eb4', 'f#4', 'ab4', 'bb4']);
    // C minor: B♮ (not C♭), F♯; E♭ major's A♭; A major's G♯
    expect(name(71, -3, true)).toBe('b4');
    expect(name(66, -3, true)).toBe('f#4');
    expect(name(68, -3)).toBe('ab4');
    expect(name(68, 3)).toBe('g#4');
    // (B♯ and C♭ keep the octave of their letter)
    expect(name(72, 7)).toBe('b#4');
    expect(name(59, -7)).toBe('cb4');
    // a key moved with its notes: C up a tone is D, down a tone B♭, up a twelfth G
    expect([transposeKey(0, 2), transposeKey(0, -2), transposeKey(0, 19), transposeKey(-3, 12)]).toEqual([2, -2, 1, -3]);
  });

  it('writes a stretch of a bar as values that show its beats', () => {
    const at = (p: number, q: number, beats: number[], num: number) => valuesOf(p, q, beats, num).map((v) => v.dur + '.'.repeat(v.dots));
    // 4/4: a minim on the second beat is two crotchets (the bar's middle shown); from the first, a minim
    expect(at(Q, 3 * Q, [0, 48, 96, 144, 192], 4)).toEqual(['q', 'q']);
    expect(at(0, 2 * Q, [0, 48, 96, 144, 192], 4)).toEqual(['h']);
    // 3/4: crotchet then minim; a dotted minim whole
    expect(at(Q, 3 * Q, [0, 48, 96, 144], 3)).toEqual(['h']);
    expect(at(0, 3 * Q, [0, 48, 96, 144], 3)).toEqual(['h.']);
    // a quaver over a beat is two tied semiquavers; a dotted quaver inside one stays
    expect(at(36, 60, [0, 48, 96], 2)).toEqual(['16', '16']);
    expect(at(12, 48, [0, 48, 96], 2)).toEqual(['8.']);
    // 6/8: a dotted crotchet a beat
    expect(at(0, 72, [0, 72, 144], 6)).toEqual(['q.']);
  });

  it('reads a typed file exactly: Chopin’s rhythm and its accidentals in C minor, on two staves', () => {
    const song = load('chopin-op28-20.mid');
    const sc = buildScore(song, [one([0], 'treble'), one([1], 'bass')])!;
    expect(sc.bars.length).toBe(13);
    expect(fills(sc)).toBe(true);
    const b1 = sc.bars[0];
    expect(b1.n).toBe(1);
    expect(b1.keys).toEqual([-3, -3]);
    expect(said(b1.staves[0]).split(' ').map((x) => x.split(':')[1])).toEqual(['q', 'q', '8.', '16', 'q']);
    // the third chord's B is the leading note: a natural, printed
    expect(b1.staves[0][2].pitches.some((p) => p.letter === 'b' && p.acc === 'n')).toBe(true);
    expect(said(b1.staves[1])).toBe('c2+c3:q f1+f2:q g1+g2:q c2+g2+c3:q');
  });

  it('keeps a rest, a tie over the bar and the conductor’s key over a part’s own (Beethoven’s Fifth)', () => {
    // the clarinets' staff: Mutopia writes their key as they read it (one flat) over the notes as they sound
    const sc = buildScore(load('beethoven-op67-i.mid'), [one([2])])!;
    const [b1, b2, b3, b4] = sc.bars;
    expect(b1.keys).toEqual([-3]);
    expect(said(b1.staves[0])).toBe('r:8 g4:8 g4:8 g4:8');
    expect(said(b2.staves[0])).toBe('e4:h');
    expect(said(b3.staves[0])).toBe('r:8 f4:8 f4:8 f4:8');
    expect(said(b4.staves[0])).toBe('d4:h~');
    expect(sc.bars[4].staves[0][0].tied).toBe(true);
  });

  it('finds the triplets (Brandenburg 5, iii) and a pickup bar of one quaver (Handel)', () => {
    const br = buildScore(load('bach-bwv1050-iii.mid'), [one([0])])!;
    const b = br.bars.find((x) => x.n === 4)!;
    expect(said(b.staves[0])).toBe('f5:8 e5:8 d5:8 c5:8 d5:8 e5:8');
    const groups = new Set(b.staves[0].map((e) => e.tuplet));
    expect(groups.size).toBe(2);
    expect([...groups].every((g) => g >= 0)).toBe(true);
    expect(b.staves[0].every((e) => e.len === 16 && e.tupletOf === 3)).toBe(true);
    const ha = buildScore(load('handel-hwv351-rejouissance.mid'), [one([0])])!;
    expect(ha.bars[0].n).toBe(0);
    expect(ha.bars[0].len).toBe(24);
    expect(said(ha.bars[0].staves[0])).toBe('g4:8');
    expect(ha.bars[1].n).toBe(1);
  });

  it('every line of every bundled piece fills its bars; a line played in is read on semiquavers', () => {
    for (const pc of PIECES.filter((p) => !p.generate)) {
      const song = load(pc.file);
      const sc = buildScore(song, song.lines.map((_, i) => one([i])))!;
      expect(sc, pc.id).not.toBeNull();
      expect(fills(sc), pc.id).toBe(true);
      // (bars numbered in order, the meter's length each but a pickup)
      for (let i = 1; i < sc.bars.length; i++) expect(sc.bars[i].start, pc.id).toBe(sc.bars[i - 1].start + sc.bars[i - 1].len);
    }
    // Pass It On's players stand apart from the grid (each led by its instrument's speaking time): on it
    const sc = buildScore(load('fable-pass-it-on.mid'), [one([12])])!;
    const starts = sc.bars.flatMap((b) => b.staves[0].filter((e) => !e.rest && !e.tied).map((e) => e.start));
    expect(starts.length).toBeGreaterThan(100);
    expect(starts.every((u) => u % 12 === 0)).toBe(true);
  });

  it('follows the file as it plays: a note’s time is its entry, through a piece’s tempo and a demo’s excerpt', () => {
    const check = (song: MidiSong, staves: StaffPlan[]) => {
      const sc = buildScore(song, staves)!;
      const ons = song.events.filter((e) => e.kind === 'on' && staves[0].lines.includes(e.line ?? 0));
      expect(ons.length).toBeGreaterThan(10);
      for (const e of ons.slice(0, 40)) {
        const u = sc.unitsAt(e.t + 1e-4);
        const bar = sc.bars[barAt(sc.bars, u)];
        const lit = soundingAt(bar, u);
        expect(lit.some((x) => x.pitches.some((p) => p.midi === (e as { midi: number }).midi))).toBe(true);
        // and back: a place is a time in the song
        expect(sc.timeAt(sc.unitsAt(e.t))).toBeCloseTo(e.t, 6);
      }
    };
    // a piece at a tempo of its own (pieceSong rate)
    const mz = PIECES.find((p) => p.rate && p.rate !== 1 && !p.generate)!;
    expect(mz).toBeTruthy();
    check(pieceSong(load(mz.file), mz), [one([0])]);
    // the trumpet's own piece: an excerpt, moved a tone (demoSong: from, rate, shift), its key moved with it
    const d = DEMOS.trumpet;
    const song = demoSong(load(d.file), d);
    check(song, [one([0])]);
    expect(song.score!.shift).toBe(d.shift);
    // with automatic expression's tempo (expression.ts TEMPO), the place heard is found in written time
    const x = express(load('chopin-op28-20.mid'));
    if (x.clock) {
      const t = 7.3;
      expect(x.clock.written(x.clock.on(t))).toBeCloseTo(t, 3);
    }
  });

  it('has no score for a song made as it plays', () => {
    const seeds = PIECES.find((p) => p.generate)!;
    expect(buildScore(seeds.generate!('kelumo'), [one([0])])).toBeNull();
  });

  it('reads a file typed with no signatures in the key its notes fit (a short tune in D)', () => {
    // D E F♯ G A B C♯ D, crotchets, at 480 ticks a crotchet, no time or key signature
    const notes = [62, 64, 66, 67, 69, 71, 73, 74];
    const ev: [number, ...number[]][] = [];
    notes.forEach((m) => ev.push([0, 0x90, m, 80], [480, 0x80, m, 0]));
    const song = parseMidi(smf(480, [ev]).buffer as ArrayBuffer);
    const sc = buildScore(song, [one([0])])!;
    expect(sc.bars.length).toBe(2);
    expect(sc.bars[0].keys[0]).toBe(2);
    expect(sc.bars.flatMap((b) => b.staves[0]).every((e) => e.pitches.every((p) => p.acc === ''))).toBe(true);
  });
});

describe('the sheet music: its parts', () => {
  it('a quartet: a part a line, each in its instrument’s clef; a score of them all offered', () => {
    const pc = PIECES.find((p) => p.id.includes('haydn'))!;
    const song = load(pc.file);
    const plan = piecePlan(pc, song.lines, 20);
    const parts = partsOf(song, plan, null);
    expect(parts.map((p) => p.voice)).toEqual(['violin', 'violin', 'viola', 'cello']);
    expect(parts.map((p) => p.staves[0].clef)).toEqual(['treble', 'treble', 'alto', 'bass']);
    expect(parts.length).toBeLessThanOrEqual(SCORE_MOST);
    // the part the keys play first (the cello's seat)
    expect(firstPart(parts, plan, [3])).toBe(3);
    expect(firstPart(parts, plan, [])).toBe(0);
  });

  it('a piano’s two lines on one seat are one part, braced; a double bass written an octave up', () => {
    const pc = PIECES.find((p) => p.id === 'tango' || p.file === 'fable-after-you.mid')!;
    const song = load(pc.file);
    const plan = piecePlan(pc, song.lines, 20);
    const parts = partsOf(song, plan, null);
    const piano = parts.find((p) => p.voice === 'grand' || p.voice === 'upright')!;
    expect(piano.staves.length).toBe(2);
    expect(piano.brace).toBe(true);
    expect(piano.staves.map((s) => s.clef)).toEqual(['treble', 'bass']);
    const bass = parts.find((p) => p.voice === 'bass')!;
    expect(bass.staves[0]).toMatchObject({ clef: 'bass', written: 12 });
    // (as the bass is written: each note an octave over what it sounds)
    const sc = buildScore(song, bass.staves)!;
    const ps = sc.bars.flatMap((b) => b.staves[0]).flatMap((e) => e.pitches);
    expect(ps.length).toBeGreaterThan(50);
    for (const p of ps) expect(p.octave).toBe(Math.floor((p.midi + 12 - p.alter) / 12) - 1);
  });

  it('one instrument: every line on it; a piano’s one wide line split at middle C; a glockenspiel two octaves down', () => {
    const song = load('chopin-op28-20.mid');
    const solo = partsOf(song, null, 'grand');
    expect(solo.length).toBe(1);
    expect(solo[0].staves.map((s) => s.clef)).toEqual(['treble', 'bass']);
    // one line across both hands
    const ev: [number, ...number[]][] = [];
    for (const m of [36, 72, 40, 76]) ev.push([0, 0x90, m, 80], [480, 0x80, m, 0]);
    const wide = parseMidi(smf(480, [ev]).buffer as ArrayBuffer);
    const sp = partsOf(wide, null, 'grand')[0].staves;
    expect(sp).toEqual([
      { lines: [0], clef: 'treble', lo: 60 },
      { lines: [0], clef: 'bass', hi: 60 },
    ]);
    const glock = partsOf(demoSong(load(DEMOS.glockenspiel.file), DEMOS.glockenspiel), null, 'glockenspiel')[0];
    expect(glock.staves[0]).toMatchObject({ clef: 'treble', written: -24 });
    expect(glock.brace).toBe(false);
  });

  it('a line on no instrument is still a part (named as the file names it)', () => {
    const song = load('handel-hwv351-rejouissance.mid');
    const plan = planOf([{ voice: 'trumpet', lines: [0] }], song.lines);
    const parts = partsOf(song, plan, null);
    expect(parts.length).toBe(song.lines.length);
    expect(parts[1].voice).toBeNull();
    expect(parts[1].name).toBeTruthy();
  });
});
