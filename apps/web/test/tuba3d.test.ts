// The tuba in 3D (tuba3d.ts), without WebGL: built from the 2D plan to a contrabass tuba's measures (0.97 m
// to a rim 0.48 m across), every tube as long as the plan's (so the engine's), inside its budget; posed from
// the engine's frames: the pistons follow the engine's own four-valve fingering on springs, 21 mm down, and
// come back up after the note; nothing is lit by the sound (the bore, the bell and the pistons are as they are); and seated in the Orchestra without moving anyone else.
import { describe, expect, it } from 'vitest';
import { TUBA_HI, TUBA_LENGTH, TUBA_LO, tubaFingering, valvesDown, type VisualFrame } from '@piano-model/engine';
import { Batch, type Mesh, chain, rotY, xform } from '../src/ui/gl/gl3d.ts';
import { TUBA_HELD, TUBA_SEAT, VALVE_Z, buildTubaModel, poseTuba, tubaPistonState, type TubaModel } from '../src/ui/gl/tuba3d.ts';
import { newWindPose } from '../src/ui/gl/winds3d.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';
import { BELL_LEN, BUTTON_Y, RIM_Y, TRAVEL, TUBE_LEN, BELL_TOP_X, BELL_X, VALVE_X } from '../src/ui/tuba-plan.ts';

const t0 = performance.now();
const tm: TubaModel = buildTubaModel();
const buildMs = performance.now() - t0;
const all = (): Mesh[] => [...tm.statics, ...tm.segs.map((s) => s.mesh), tm.rim, ...tm.pistons];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const frame = (midi: number | null, blow = 0.6): VisualFrame =>
  ({
    focus: midi === null ? null : { midi, lengthM: 4.88, f1: hz(midi), shapes: [Float32Array.from({ length: 160 }, (_, i) => 0.2 + Math.abs(Math.cos(2 * Math.PI * (i / 159))))] },
    lips: { open: midi === null ? 0 : 0.6, blow: midi === null ? 0 : blow },
  }) as unknown as VisualFrame;
function play(fr: VisualFrame, n = 45, pose = newWindPose(), b = new Batch(), rms = 0.05) {
  for (let k = 0; k < n; k++) {
    b.clear();
    poseTuba(b, tm, fr, pose, 1 / 60, k * 16.7, rms);
  }
  return { st: Array.from(tubaPistonState(pose)!), pose, b };
}
const glowOf = (b: Batch, m: Mesh) => b.inst.get(m)?.a[19] ?? 0;

describe('the tuba in 3D', () => {
  it('is a contrabass tuba’s size: a metre tall, the bell’s rim 0.49 m with its bead, the valves in front of the body', () => {
    expect(tm.height).toBeGreaterThan(0.96);
    expect(tm.height).toBeLessThan(1.0);
    expect(tm.bellWidth).toBeGreaterThan(0.48);
    expect(tm.bellWidth).toBeLessThan(0.5);
    expect(VALVE_Z).toBeGreaterThan(0.06);
    // the rim's ring really is that wide, level, at 0.97 m
    let rx0 = Infinity;
    let rx1 = -Infinity;
    let top = -Infinity;
    for (let i = 0; i < tm.rim.count; i++) {
      rx0 = Math.min(rx0, tm.rim.data[i * 14]);
      rx1 = Math.max(rx1, tm.rim.data[i * 14]);
      top = Math.max(top, tm.rim.data[i * 14 + 1]);
    }
    expect(rx1 - rx0).toBeCloseTo(tm.bellWidth, 2);
    // (the bell leans 4° towards the mouthpiece's side: the rim's far edge stands 17 mm over its middle's
    // 0.97 m, and its middle 54 mm to that side of the stack's foot)
    expect(top).toBeGreaterThan(0.975);
    expect(top).toBeLessThan(1.0);
    expect((rx0 + rx1) / 2).toBeCloseTo(BELL_TOP_X, 2);
    expect(BELL_TOP_X).toBeLessThan(BELL_X - 0.03);
  });

  it('is the right way round: the mouthpiece at the bell’s side pointing out to the player, the valves at the other side, their pistons leaning to him', () => {
    // the lips' place: left of the bell's stack, at a seated player's mouth; the breath comes from further left
    expect(tm.lips[0]).toBeLessThan(BELL_TOP_X - 0.1);
    expect(tm.lips[1]).toBeGreaterThan(0.53);
    expect(tm.lips[1]).toBeLessThan(0.63);
    // its axis out of the rim: out at the left, and turned out of the body's plane on the side away from the
    // valves (MP_TURN: held, it goes back into the lips; the model is built mirrored, F3, its valves at −z)
    expect(tm.lipAxis[0]).toBeLessThan(-0.6);
    expect(tm.lipAxis[2]).toBeGreaterThan(0.6);
    expect(tm.lipAxis[0] * VALVE_Z).toBeLessThan(0);
    // every piston's button stands up and to the mouthpiece's side of its casing's foot
    for (let k = 0; k < 4; k++) {
      const m = tm.pistons[k];
      let hiY = -Infinity;
      let hiX = 0;
      for (let i = 0; i < m.count; i++) if (m.data[i * 14 + 1] > hiY) [hiY, hiX] = [m.data[i * 14 + 1], m.data[i * 14]];
      expect(hiX).toBeLessThan(VALVE_X[k] - 0.03);
      expect(hiX).toBeGreaterThan(BELL_X);
    }
  });

  it('every tube is as long as the plan’s (the engine’s lengths); in space the leadpipe goes round the bell, 0.2 m more', () => {
    for (const id of ['body', 'L1', 'L2', 'L3', 'L4', 'slide', 'lead']) {
      const built = tm.lengths[id];
      expect(built, id).toBeGreaterThan(TUBE_LEN[id] * 0.985);
      // (the plan lays the leadpipe flat across the bell's front; here it goes round it, and the main slide
      // comes back into the body's plane)
      expect(built, id).toBeLessThan(TUBE_LEN[id] * (id === 'lead' ? 1.3 : id === 'slide' ? 1.05 : 1.012));
    }
    // the open tube as built: within 6 % of the engine's 4.88 m (the wave is laid along the plan's lengths)
    const open = tm.lengths.lead + tm.lengths.slide + tm.lengths.body + BELL_LEN + 0.09 + 0.165;
    expect(open / TUBA_LENGTH).toBeGreaterThan(0.99);
    expect(open / TUBA_LENGTH).toBeLessThan(1.06);
  });

  it('builds in its budget: under 0.6 M vertices, quickly', () => {
    const verts = all().reduce((s, m) => s + m.count, 0);
    expect(verts).toBeLessThan(600_000);
    expect(verts).toBeGreaterThan(60_000);
    expect(buildMs).toBeLessThan(2500);
  });

  it('presses the pistons of the engine’s fingering, 21 mm down, and lets them up after', () => {
    for (const m of [24, 25, 29, 31, 36, 41, 50, 65]) {
      const want = valvesDown(tubaFingering(m).valves, 4);
      const { st } = play(frame(m));
      st.forEach((p, k) => (want[k] ? expect(p, `MIDI ${m} valve ${k + 1}`).toBeGreaterThan(0.9) : expect(p, `MIDI ${m} valve ${k + 1}`).toBeLessThan(0.1)));
    }
    // the piston's mesh is drawn 21 mm lower when down (its instance's translation)
    const down = play(frame(25));
    const up = play(frame(36));
    const yOf = (b: Batch, m: Mesh) => b.inst.get(m)!.a[13];
    const xOf = (b: Batch, m: Mesh) => b.inst.get(m)!.a[12];
    for (let k = 0; k < 4; k++) {
      // (down its leaning casing: 21 mm along it, down and away from the mouthpiece's side)
      const dy = yOf(up.b, tm.pistons[k]) - yOf(down.b, tm.pistons[k]);
      const dx = xOf(down.b, tm.pistons[k]) - xOf(up.b, tm.pistons[k]);
      expect(Math.hypot(dx, dy)).toBeCloseTo(TRAVEL, 3);
      expect(dy).toBeGreaterThan(0.85 * TRAVEL);
      expect(dx).toBeGreaterThan(0.2 * TRAVEL);
    }
    // the note over: a moment later every piston is up
    const { pose } = play(frame(25));
    const after = play(frame(null), 90, pose);
    for (const p of after.st) expect(p).toBeLessThan(0.1);
  });

  it('no tube, bell or piston is lit or tinted while it sounds (the bore does not glow)', () => {
    for (const m of [29, 36, 41, 50]) {
      const loud = play(frame(m)).b;
      for (const mesh of all()) expect(glowOf(loud, mesh)).toBe(0);
    }
    const quiet = play(frame(null), 10, newWindPose(), new Batch(), 0).b;
    for (const mesh of all()) expect(glowOf(quiet, mesh)).toBe(0);
    // every note of the compass poses without a hitch
    for (let m = TUBA_LO; m <= TUBA_HI; m += 3) expect(play(frame(m), 2).st.length).toBe(4);
  });

  it('takes its own seat among a few players, held on the lap, the bell up (the others’ seats as they were)', () => {
    const parts = (ps: [('wind' | 'reed' | 'brass' | 'bowed'), ('oboe' | 'clarinet' | 'bassoon')?, ('trumpet' | 'horn' | 'tuba')?][]) => ps.map(([family, reed, brass]) => ({ family, reed, brass, kind: 'grand' as const, bowed: null }));
    const withIt = ensembleSeats(parts([['reed', 'oboe'], ['brass', undefined, 'tuba'], ['reed', 'bassoon'], ['brass', undefined, 'trumpet']]));
    const without = ensembleSeats(parts([['reed', 'oboe'], ['wind'], ['reed', 'bassoon'], ['brass', undefined, 'trumpet']]));
    for (const i of [0, 2, 3]) expect(Array.from(withIt[i].T)).toEqual(Array.from(without[i].T));
    const seat = withIt[1];
    expect(seat.top).toBe(TUBA_SEAT.top);
    let hi = -Infinity;
    let lo = Infinity;
    for (const m of all())
      for (let i = 0; i < m.count; i += 13) {
        const p = xform(seat.T, xform(TUBA_HELD, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]));
        hi = Math.max(hi, p[1]);
        lo = Math.min(lo, p[1]);
      }
    const mpY = xform(seat.T, xform(TUBA_HELD, tm.lips))[1];
    expect(hi).toBeLessThan(seat.top);
    // the mouthpiece at a seated player's lips (≈ 1.1–1.3 m), the bottom bow on the lap, the bell over the head
    expect(mpY).toBeGreaterThan(1.08);
    expect(mpY).toBeLessThan(1.3);
    expect(lo).toBeGreaterThan(0.28);
    expect(hi).toBeGreaterThan(mpY + 0.05);
  });

  it('is held the right way round in its seat: the mouthpiece back into the lips, the bell beside the head at the left, the body and valves in front, half to the hall', () => {
    // (the seat's own frame: the world is mirrored, the player's right is −x, the hall at −z; the seat turns
    // the tuba by TUBA_SEAT.turn, then holds it so)
    const T = chain(rotY(TUBA_SEAT.turn), TUBA_HELD);
    const dir = (v: ArrayLike<number>) => [0, 1, 2].map((k) => T[k] * v[0] + T[4 + k] * v[1] + T[8 + k] * v[2]);
    const at = (v: ArrayLike<number>) => Array.from(xform(T, [v[0], v[1], v[2]]));
    /** as the player has it: to his right, up, back towards him (m, or a direction) */
    const rub = (v: number[]) => ({ right: -v[0], up: v[1], back: v[2] });
    const lips = at(tm.lips);
    const from = (p: number[]) => rub([p[0] - lips[0], p[1] - lips[1], p[2] - lips[2]]);
    // the mouthpiece's axis out of its rim: at the player, not to either side (it was 47° to his right)
    const mp = rub(dir(tm.lipAxis));
    expect(Math.abs(mp.right)).toBeLessThan(0.1);
    expect(mp.back).toBeGreaterThan(0.95);
    // the bell's rim over the head, its stack beside the head at the left and a little in front
    const rim = from(at([BELL_TOP_X, RIM_Y, 0]));
    expect(rim.up).toBeGreaterThan(0.3);
    expect(rim.right).toBeLessThan(-0.08);
    expect(rim.back).toBeLessThan(0);
    const stack = from(at([BELL_X, 0.5, 0]));
    expect(stack.right).toBeLessThan(-0.08);
    expect(stack.back).toBeLessThan(0);
    // the pistons in front of the player, at his chest, under the hand that comes round the front
    const btn = from(at([VALVE_X[1], BUTTON_Y, -VALVE_Z]));
    expect(btn.back).toBeLessThan(-0.2);
    expect(btn.up).toBeLessThan(0.05);
    expect(btn.up).toBeGreaterThan(-0.35);
    // the valves' side (the model's −z: built mirrored) turned half towards the hall
    const valves = rub(dir([0, 0, -1]));
    expect(valves.back).toBeLessThan(-0.4);
    expect(valves.right).toBeGreaterThan(0.4);
  });

  it('stands on the floor on its own, inside its bounds', () => {
    let lowY = Infinity;
    let far = 0;
    for (const m of all())
      for (let i = 0; i < m.count; i += 7) {
        const p = xform(tm.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]);
        lowY = Math.min(lowY, p[1]);
        far = Math.max(far, Math.hypot(p[0] - tm.bounds.c[0], p[1] - tm.bounds.c[1], p[2] - tm.bounds.c[2]));
      }
    expect(lowY).toBeGreaterThanOrEqual(0);
    expect(lowY).toBeLessThan(0.03);
    expect(far).toBeLessThan(tm.bounds.r);
  });
});
