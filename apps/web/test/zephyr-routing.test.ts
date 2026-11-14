// The zephyr in the Orchestra's routing (orchestra/assign.ts): no file of the past asks for it, so only its
// name brings it (no General MIDI program is its); every line named for it is one zephyr's (a keyboard's
// two staves); it stands with the harps; and files without it route as they did.
import { describe, expect, it } from 'vitest';
import { autoPlan, guessVoice, placeNote, takesAll, voiceFromName, voiceFromProgram, VOICE_COST, VOICE_INFO, VOICES, SCORE_ORDER, type LineInfo } from '../src/orchestra/assign.ts';
import { orchestraPlan, seatKinds, SEAT_W } from '../src/orchestra/seats.ts';
import { familyOf } from '../src/orchestra/sections.ts';

const L = (name: string, program: number, lo: number, hi: number, median = Math.round((lo + hi) / 2), poly = 1, notes = 200): LineInfo => ({ name, instrument: '', program, lo, hi, median, notes, poly, core: [lo, hi] });

describe('orchestra: the zephyr', () => {
  it('only its name brings it: Zephyr, Zephyrs, Zephyr 1; no program does, and no other name', () => {
    for (const n of ['Zephyr', 'zephyr', 'Zephyrs', 'Zephyr 1', 'Zephyr (R.H.)']) expect(voiceFromName(n), n).toBe('zephyr');
    for (const [n, v] of [['Harp', 'harp'], ['Piano', 'grand'], ['Organ', 'grand'], ['Zephyrus', null], ['Aeolian Harp', 'harp'], ['Flute', 'flute']] as const) expect(voiceFromName(n), n).toBe(v);
    for (let p = 0; p < 128; p++) expect(voiceFromProgram(p), `program ${p}`).not.toBe('zephyr');
    expect(VOICES).toContain('zephyr');
    expect(SCORE_ORDER).toContain('zephyr');
    expect(VOICE_INFO.zephyr).toMatchObject({ instrument: 'zephyr', lo: 36, hi: 96, poly: 61 });
    expect(VOICE_COST.zephyr).toBeGreaterThan(1);
    expect(familyOf('zephyr')).toBe('harp');
    expect(takesAll('zephyr')).toBe(true);
  });

  it('a part named for it gets it, its chords and its bass too; both its staves are one zephyr’s', () => {
    expect(guessVoice(L('Zephyr', 0, 39, 87, 63, 7))).toBe('zephyr');
    expect(guessVoice(L('Zephyr', -1, 36, 60, 46, 2))).toBe('zephyr');
    // its compass C2–C7: notes outside come in by octaves
    expect(placeNote(60, 0, 'zephyr')).toBe(60);
    expect(placeNote(30, 0, 'zephyr')).toBe(42);
    expect(placeNote(100, 0, 'zephyr')).toBe(88);
    const lines = [L('Flute', 73, 62, 93), L('Zephyr', 0, 55, 96, 72, 4), L('Zephyr', 0, 36, 62, 45, 3), L('Cello', 42, 36, 67)];
    const plan = autoPlan(lines, { cap: 12 });
    expect(plan.parts.map((p) => p.voice)).toEqual(['flute', 'zephyr', 'cello']);
    expect(plan.parts[1].lines).toEqual([1, 2]);
    // the same file without it: the others as they were; chords with nothing named are a piano's still
    expect(autoPlan([lines[0], lines[3]], { cap: 12 }).parts.map((p) => p.voice)).toEqual(['flute', 'cello']);
    expect(guessVoice(L('', 0, 40, 91, 62, 5))).toBe('grand');
  });

  it('it stands with the harps: at the left end of the first row behind the strings', () => {
    const lineup = ['violin', 'violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'zephyr'].map((v) => ({ instrument: v as 'violin' }));
    const kinds = seatKinds(lineup);
    expect(kinds[7].family).toBe('aeolian');
    const plan = orchestraPlan(kinds);
    expect(plan.harps).toEqual([7]);
    expect(SEAT_W.zephyr).toBeGreaterThan(1.2);
  });
});
