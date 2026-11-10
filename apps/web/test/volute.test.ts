// The volute's plan and 3D model are the engine's own sizes, and nothing in the plan collides.
import { describe, expect, it } from 'vitest';
import { voluteGeometry } from '@piano-model/engine';
import { volutePlan } from '../src/ui/volute-plan.ts';
import { buildVoluteModel, VOLUTE_H } from '../src/ui/gl/volute3d.ts';
import { autoPlan, isChordal, isKeyboard, lineupPlan, voiceFromName, VOICE_INFO } from '../src/orchestra/assign.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';

const d = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
describe('volute: plan and model', () => {
  const plan = volutePlan();
  it('49 strings of the engine’s lengths from the bridge to the frame; 37 pipes and bars from C3', () => {
    const g = voluteGeometry();
    expect(plan.strings.length).toBe(49);
    expect(plan.pipes.length).toBe(37);
    expect(plan.bars.length).toBe(37);
    plan.strings.forEach((s, i) => expect(d(s.a, s.b)).toBeCloseTo(g.notes[i].string, 6));
    expect(d(plan.strings[0].a, plan.strings[0].b)).toBeCloseTo(0.64, 2);
    expect(plan.pipes[0].midi).toBe(48);
    // C3's open pipe: c/2f less its end corrections
    expect(plan.pipes[0].len).toBeGreaterThan(1.2);
    expect(plan.pipes[0].len).toBeLessThan(1.32);
  });
  it('neighbouring pipes and bars do not touch, and the bars lie outside the pipes', () => {
    for (let i = 1; i < plan.pipes.length; i++) expect(d(plan.pipes[i].c, plan.pipes[i - 1].c)).toBeGreaterThan(plan.pipes[i].r + plan.pipes[i - 1].r);
    for (let i = 1; i < plan.bars.length; i++) expect(d(plan.bars[i].a, plan.bars[i - 1].a)).toBeGreaterThan((plan.bars[i].w + plan.bars[i - 1].w) / 2);
    plan.bars.forEach((b, i) => expect(Math.hypot(...b.a)).toBeGreaterThan(Math.hypot(...plan.pipes[i].c) + plan.pipes[i].r));
  });
  it('the 3D model stands 0.82 m high at the strings and 2.1 m at its tallest pipe', () => {
    const m = buildVoluteModel();
    expect(m.pipes.length).toBe(37);
    expect(m.top).toBeGreaterThan(VOLUTE_H + 1.2);
    expect(m.top).toBeLessThan(2.3);
    for (const s of [...m.statics, ...m.pipes.map((p) => p.mesh), ...m.bars.map((b) => b.mesh), m.mallet]) expect(s.data.every(Number.isFinite)).toBe(true);
  });
});

describe('volute: in the ensemble', () => {
  it('holds chords without being a keyboard; named in a file it takes that line; never chosen unasked', () => {
    expect(isKeyboard('volute')).toBe(false);
    expect(isChordal('volute')).toBe(true);
    expect(isChordal('cello')).toBe(false);
    expect(voiceFromName('Volute')).toBe('volute');
    const line = (name: string, poly: number) => ({ name, instrument: '', program: -1, notes: 200, lo: 40, hi: 76, median: 60, poly });
    expect(autoPlan([line('volute', 5), line('Violin', 1)], { cap: 6 }).parts[0].voice).toBe('volute');
    expect(autoPlan([line('', 5), line('', 1)], { cap: 6 }).parts.some((p) => p.voice === 'volute')).toBe(false);
    expect(VOICE_INFO.volute.poly).toBe(10);
    expect(lineupPlan(['flute', 'volute']).parts.length).toBe(2);
  });
  it('stands on the floor behind the players, as a piano does', () => {
    const seats = ensembleSeats([{ family: 'bowed', kind: 'grand', bowed: null }, { family: 'consort', kind: 'grand', bowed: null }]);
    expect(seats[1].top).toBeGreaterThan(2);
    expect(seats[1].c[2]).toBeGreaterThan(seats[0].c[2]);
  });
});
