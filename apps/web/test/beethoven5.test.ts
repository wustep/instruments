// Beethoven's Fifth in the Orchestra: Mutopia's two movements (I and II) as built-in pieces and an address
// that seats and routes the orchestra. A staff that two wind players share (Mutopia writes the pair on one
// staff: chords, a unison twice) is divided between them; the horns' and trumpets' staves, which the file
// calls "english horn" (GM 69), reach the horns and trumpets by their line names; the eighteen instruments
// are seated because they cost the audio thread less than the most the stage seated before (two pianos and
// the heaviest others).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { divide, parseMidi, type FileEvent, type MidiSong } from '../src/midi-file.ts';
import { deskOf, fitLineup, heaviestCost, lineupCost, lineupOf, placeNote, playsNote, VOICE_COST, VOICE_INFO, VOICES, type Plan, type Voice } from '../src/orchestra/assign.ts';
import { pieceForLineup, PIECES, piecePlan, pieceSong } from '../src/orchestra/pieces.ts';
import { planByRules, rulesOf } from '../src/orchestra/rules.ts';
import { formatAddress, parseAddress, emptyAddress } from '../src/address.ts';
import { smf } from './smf.ts';
import { SYMPHONY } from './presets.ts';

const load = (file: string): MidiSong => {
  const b = readFileSync(new URL(`../public/pieces/${file}`, import.meta.url));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
const I = PIECES.find((p) => p.id === 'beethoven5-i')!;
const II = PIECES.find((p) => p.id === 'beethoven5-ii')!;
const songI = load(I.file);
const songII = load(II.file);
const ORCHESTRA: Voice[] = ['flute', 'flute', 'oboe', 'oboe', 'clarinet', 'clarinet', 'bassoon', 'bassoon', 'horn', 'horn', 'trumpet', 'trumpet', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass'];
/** each line's voices, as the plan routes it */
const routed = (plan: Plan) => plan.lines.map((rs) => rs.map((r) => plan.parts[r.part].voice));

describe('a staff two players share: its voices (midi-file.ts divide)', () => {
  const ev = (t: number, kind: 'on' | 'off', midi: number, line = 0): FileEvent => (kind === 'on' ? { t, kind, midi, vel: 80, line } : { t, kind, midi, line });
  const divs = (events: FileEvent[]) => {
    divide(events);
    return events.map((e) => (e.kind === 'on' || e.kind === 'off' ? `${e.kind}${e.midi}:${e.div}` : ''));
  };
  it('a chord from the top down; a unison written twice is both players; a single note the first’s', () => {
    expect(divs([ev(0, 'on', 76), ev(0, 'on', 79), ev(1, 'off', 76), ev(1, 'off', 79)])).toEqual(['on76:1', 'on79:0', 'off76:1', 'off79:0']);
    expect(divs([ev(0, 'on', 72), ev(0, 'on', 72), ev(1, 'off', 72), ev(1, 'off', 72)])).toEqual(['on72:0', 'on72:1', 'off72:0', 'off72:1']);
    expect(divs([ev(0, 'on', 72), ev(1, 'off', 72), ev(1, 'on', 74), ev(2, 'off', 74)])).toEqual(['on72:0', 'off72:0', 'on74:0', 'off74:0']);
  });
  it('a player holding a note keeps it; the other moves under (or over) it on the free voice', () => {
    // the first holds G5 over two bars while the second plays E5 then C5, and then F5 above C5's end
    const e = [ev(0, 'on', 79), ev(0, 'on', 76), ev(1, 'off', 76), ev(1, 'on', 72), ev(2, 'off', 79), ev(2, 'on', 81), ev(3, 'off', 72), ev(3, 'off', 81)];
    expect(divs(e)).toEqual(['on79:0', 'on76:1', 'off76:1', 'on72:1', 'off79:0', 'on81:0', 'off72:1', 'off81:0']);
  });
  it('a legato overlap (under 40 ms) is one player, not two; each line is its own', () => {
    expect(divs([ev(0, 'on', 72), ev(0.99, 'on', 74), ev(1.01, 'off', 72), ev(2, 'off', 74)])).toEqual(['on72:0', 'on74:0', 'off72:0', 'off74:0']);
    expect(divs([ev(0, 'on', 72, 0), ev(0, 'on', 60, 1), ev(1, 'off', 72, 0), ev(1, 'off', 60, 1)])).toEqual(['on72:0', 'on60:0', 'off72:0', 'off60:0']);
  });
  it('a file read: the voices come with its notes', () => {
    // one track: a third (E5 under G5: the second player's and the first's), then a unison
    const b = smf(480, [[[0, 0xc0, 73], [0, 0x90, 76, 80], [0, 0x90, 79, 80], [480, 0x80, 76, 0], [0, 0x80, 79, 0], [0, 0x90, 74, 80], [0, 0x90, 74, 80], [480, 0x80, 74, 0], [0, 0x80, 74, 0]]]);
    const s = parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    expect(s.events.filter((e) => e.kind === 'on').map((e) => (e as { div?: number }).div)).toEqual([1, 0, 0, 1]);
    expect(s.lines[0].poly).toBe(2);
  });
});

describe('which voice of a line each instrument plays (assign.ts deskOf)', () => {
  const lines = [{ poly: 2 }, { poly: 1 }, { poly: 3 }];
  const plan = (parts: { voice: Voice; lines: number[] }[]): Plan => ({ parts, lines: lines.map((_, li) => parts.flatMap((p, k) => (p.lines.includes(li) ? [{ part: k, shift: 0 }] : []))) });
  it('two flutes on a staff of two: the first the top voice, the second the next; an oboe on it its own first', () => {
    const p = plan([{ voice: 'flute', lines: [0] }, { voice: 'oboe', lines: [0] }, { voice: 'flute', lines: [0] }]);
    expect([0, 1, 2].map((k) => deskOf(p, lines, 0, k))).toEqual([0, 0, 1]);
    expect(playsNote({ div: 1 }, 0)).toBe(false);
    expect(playsNote({ div: 1 }, 1)).toBe(true);
    expect(playsNote({}, 0)).toBe(true);
  });
  it('four horns on a staff of two double it in turn; a line of one voice is every player’s whole', () => {
    const p = plan([{ voice: 'horn', lines: [0, 1] }, { voice: 'horn', lines: [0, 1] }, { voice: 'horn', lines: [0, 1] }, { voice: 'horn', lines: [0, 1] }]);
    expect([0, 1, 2, 3].map((k) => deskOf(p, lines, 0, k))).toEqual([0, 1, 0, 1]);
    expect([0, 1, 2, 3].map((k) => deskOf(p, lines, 1, k))).toEqual([-1, -1, -1, -1]);
  });
  it('bowed strings, pianos and the timpani take every note (double stops, chords, two mallets)', () => {
    for (const v of ['violin', 'cello', 'bass', 'grand', 'timpani'] as Voice[]) {
      const p = plan([{ voice: v, lines: [0, 2] }, { voice: v, lines: [0, 2] }]);
      expect([deskOf(p, lines, 0, 0), deskOf(p, lines, 0, 1), deskOf(p, lines, 2, 1)], v).toEqual([-1, -1, -1]);
    }
    // a part that does not play the line
    expect(deskOf(plan([{ voice: 'flute', lines: [1] }]), lines, 0, 0)).toBe(-1);
  });
});

describe('how many instruments the stage seats (assign.ts fitLineup)', () => {
  it('each voice has a measured cost; the heaviest the stage seated by count is two pianos and the heaviest others', () => {
    for (const v of VOICES) expect(VOICE_COST[v], v).toBeGreaterThan(0);
    expect(heaviestCost(8)).toBeCloseTo(2 * VOICE_COST.upright + 6 * VOICE_COST.bass);
    expect(heaviestCost(6)).toBeCloseTo(2 * VOICE_COST.upright + 4 * VOICE_COST.bass);
  });
  it('the symphony’s eighteen fit on a computer (8) and a phone (6): it costs less than either did', () => {
    expect(lineupCost(ORCHESTRA)).toBeLessThan(heaviestCost(6));
    expect(fitLineup(ORCHESTRA, 8)).toEqual(ORCHESTRA);
    expect(fitLineup(ORCHESTRA, 6)).toEqual(ORCHESTRA);
  });
  it('a lineup up to the count is seated whatever it is; a longer one only as far as the budget goes', () => {
    const pianos: Voice[] = ['grand', 'grand', 'upright', 'upright', 'grand', 'grand'];
    expect(fitLineup(pianos, 6)).toEqual(pianos);
    const many: Voice[] = Array.from({ length: 12 }, () => 'grand');
    expect(fitLineup(many, 8).length).toBe(8);
    expect(fitLineup(['violin', 'violin', 'grand', 'grand', 'grand', 'grand', 'cello', 'cello', 'cello'], 6).length).toBe(6);
  });
});

describe('Beethoven’s Fifth, I and II: the pieces', () => {
  it('Mutopia’s staves: one to twelve, at concert pitch, the horns and trumpets both “english horn” (GM 69)', () => {
    for (const s of [songI, songII]) {
      expect(s.lines.map((l) => l.name)).toEqual(['one:', 'two:', 'three:', 'four:', 'five:', 'six:', 'seven:', 'eight:', 'nine:', 'ten:', 'eleven:', 'twelve:']);
      expect(s.lines.map((l) => l.program)).toEqual([73, 68, 71, 70, 69, 69, 47, 40, 40, 41, 42, 43]);
      expect(s.lines.map((l) => l.instrument)).toEqual(['flute', 'oboe', 'clarinet', 'bassoon', 'english horn', 'english horn', 'timpani', 'violin', 'violin', 'viola', 'cello', 'contrabass']);
      // each wind staff holds its pair
      for (const li of [0, 1, 2, 3, 4, 5]) expect(s.lines[li].poly, String(li)).toBe(2);
    }
  });

  it('every staff on its own instruments, two of each wind, the strings one a staff, in the score’s order', () => {
    for (const [pc, s] of [[I, songI], [II, songII]] as const) {
      const plan = piecePlan(pc, s.lines, pc.parts.length);
      expect(lineupOf(plan)).toEqual(ORCHESTRA);
      expect(routed(plan)).toEqual([['flute', 'flute'], ['oboe', 'oboe'], ['clarinet', 'clarinet'], ['bassoon', 'bassoon'], ['horn', 'horn'], ['trumpet', 'trumpet'], ['timpani'], ['violin'], ['violin'], ['viola'], ['cello'], ['bass']]);
      // the pair divided: each note of a wind staff played by exactly one of its two players, the first
      // the more (the top voice and every solo)
      for (let li = 0; li < 6; li++) {
        const [a, b] = plan.lines[li].map((r) => s.events.filter((e) => e.kind === 'on' && e.line === li && playsNote(e, deskOf(plan, s.lines, li, r.part))).length);
        expect(a + b, `${pc.id} ${li}`).toBe(s.lines[li].notes);
        expect(a, `${pc.id} ${li}`).toBeGreaterThan(b);
        expect(b, `${pc.id} ${li}`).toBeGreaterThan(0.15 * s.lines[li].notes);
      }
    }
  });

  it('as it sounds: I as written; II’s horns in C an octave down (the file has their written pitch)', () => {
    const pI = piecePlan(I, songI.lines, 18);
    const pII = piecePlan(II, songII.lines, 18);
    expect(pI.lines.flat().every((r) => r.shift === 0)).toBe(true);
    expect(pII.lines[4].map((r) => r.shift)).toEqual([-12, -12]);
    expect(pII.lines.flat().filter((r) => r.shift !== 0).length).toBe(2);
    // (the horns' sounding range: C3 to C5)
    const horn = songII.events.filter((e) => e.kind === 'on' && e.line === 4).map((e) => placeNote((e as { midi: number }).midi, -12, 'horn'));
    expect([Math.min(...horn), Math.max(...horn)]).toEqual([48, 72]);
    // nearly every note lies in its instrument's compass as moved (a few of the timpani's are folded)
    for (const [plan, s] of [[pI, songI], [pII, songII]] as const) {
      let out = 0;
      let all = 0;
      for (const e of s.events)
        if (e.kind === 'on')
          for (const r of plan.lines[e.line!]) {
            const v = plan.parts[r.part].voice;
            const m = e.midi + r.shift;
            all++;
            if (m < VOICE_INFO[v].lo || m > VOICE_INFO[v].hi) out++;
          }
      expect(out / all).toBeLessThan(0.005);
    }
  });

  it('at Beethoven’s metronome marks: I half note = 108 (the file 96), II eighth = 92 (the file 62)', () => {
    expect(pieceSong(songI, I).duration).toBeCloseTo((songI.duration * 96) / 108, 6);
    expect(pieceSong(songII, II).duration).toBeCloseTo((songII.duration * 62) / 92, 6);
    expect(pieceSong(songI, I).events.length).toBe(songI.events.length);
    expect(pieceSong(songI, null)).toBe(songI);
  });

  it('the play icon on the symphony’s orchestra plays the first movement', () => {
    expect(PIECES[pieceForLineup(ORCHESTRA)].id).toBe('beethoven5-i');
    expect(PIECES[pieceForLineup(['violin', 'violin', 'viola', 'cello'])].id).toBe('haydn');
  });
});

describe('Beethoven’s Fifth: the address (the preset)', () => {
  const a = parseAddress('/orchestra', SYMPHONY.slice(SYMPHONY.indexOf('?')));
  const setup = a.orchestra!;
  it('seats the eighteen in the score’s order, each staff by its name and program', () => {
    expect(setup.seats).toEqual(ORCHESTRA);
    expect(setup.lines!.map((r) => [r.name, r.program, r.seats])).toEqual([
      ['one', 73, [0, 1]],
      ['two', 68, [2, 3]],
      ['three', 71, [4, 5]],
      ['four', 70, [6, 7]],
      ['five', 69, [8, 9]],
      ['six', 69, [10, 11]],
      ['seven', 47, [12]],
      ['eight', 40, [13]],
      ['nine', 40, [14]],
      ['ten', 41, [15]],
      ['eleven', 42, [16]],
      ['twelve', 43, [17]],
    ]);
    // written back as it was read
    expect(formatAddress({ ...emptyAddress(), orchestra: setup })).toBe(SYMPHONY);
  });

  it('is what a piece writes: loading either movement puts this address in the bar', () => {
    for (const [pc, s] of [[I, songI], [II, songII]] as const) {
      const plan = piecePlan(pc, s.lines, pc.parts.length);
      expect(formatAddress({ ...emptyAddress(), orchestra: { seats: lineupOf(plan), lines: rulesOf(plan, s.lines), keys: null } })).toBe(SYMPHONY);
    }
  });

  it('Mutopia’s own files dropped on it play as the pieces do, both movements', () => {
    for (const [pc, s] of [[I, songI], [II, songII]] as const) {
      const byRules = planByRules(s.lines, setup.seats, setup.lines!);
      const own = piecePlan(pc, s.lines, pc.parts.length);
      expect(routed(byRules), pc.id).toEqual(routed(own));
      expect(byRules.lines, pc.id).toEqual(own.lines);
    }
  });

  it('the horns and trumpets by their line names, not by GM 69: in another order they still find their seats', () => {
    // the same staves with the trumpets' before the horns' (both GM 69, both "english horn")
    const order = [0, 1, 2, 3, 5, 4, 6, 7, 8, 9, 10, 11];
    const lines = order.map((i) => songI.lines[i]);
    const plan = planByRules(lines, setup.seats, setup.lines!);
    expect(plan.lines[4].map((r) => plan.parts[r.part].voice)).toEqual(['trumpet', 'trumpet']);
    expect(plan.lines[5].map((r) => plan.parts[r.part].voice)).toEqual(['horn', 'horn']);
    // and never the English horn (GM 69's own instrument, the oboe's kin)
    expect(plan.lines.flat().filter((r) => plan.parts[r.part].voice === 'oboe').length).toBe(2);
  });

  it('a phone seats it too (its six by hand cost more than the eighteen)', () => {
    expect(fitLineup(setup.seats, 6).length).toBe(18);
  });
});
