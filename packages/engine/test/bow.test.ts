// Bow direction changes: the shared bow alternates down/up-bow per détaché note and
// changes automatically when the hair runs out; Helmholtz motion re-forms in the new
// direction (it is not imposed) and the pitch is unaffected.
import { describe, expect, it } from 'vitest';
import { BowedCore } from '../src/core/index.ts';

const FS = 48000;
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Render a violin, recording the mean friction force of the focused string per 10 ms. */
function run(events: { t: number; ev: object }[], dur: number, params: Record<string, unknown> = {}) {
  const core = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true, params: { vibrato: 0, ...params } });
  for (const e of events) core.schedule(e.ev, Math.round(e.t * FS));
  const n = Math.round(dur * FS);
  const x = new Float32Array(n);
  const L = new Float32Array(480);
  const R = new Float32Array(480);
  const force: number[] = [];
  const dirs: number[] = [];
  for (let i = 0; i + 480 <= n; i += 480) {
    core.process(L, R, 480);
    x.set(L, i);
    const s = core.strings.find((q) => q.bowing) ?? core.strings[0];
    let f = 0;
    for (let k = 0; k < 480; k++) f += s.trF[(s.trI - 1 - k + 2048) & 2047];
    force.push(f / 480);
    dirs.push(core.bow.changing ? 0 : core.bow.dir);
  }
  return { core, x, force, dirs };
}

function pitchCents(x: Float32Array, f: number, t0: number, len = 0.3): number {
  const s0 = Math.round(t0 * FS);
  const W = Math.round(len * FS);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag];
    return s;
  };
  const lo = Math.floor(FS / (f * 1.06));
  const hi = Math.ceil(FS / (f * 0.94));
  let best = -Infinity;
  let bl = lo;
  for (let lag = lo; lag <= hi; lag++) {
    const v = ac(lag);
    if (v > best) {
      best = v;
      bl = lag;
    }
  }
  const a = ac(bl - 1);
  const b = ac(bl);
  const c = ac(bl + 1);
  return 1200 * Math.log2(FS / (bl + (0.5 * (a - c)) / (a - 2 * b + c)) / f);
}

describe('bow changes', () => {
  it('a long forte note changes bow when the hair runs out; friction reverses with the bow', () => {
    const r = run([{ t: 0.01, ev: { type: 'noteOn', midi: 62, velocity: 120 } }], 4.5);
    expect(r.core.bow.auto).toBeGreaterThanOrEqual(1);
    // friction pulls the string along the bow: its mean has the bow's sign once settled
    const first = r.dirs.indexOf(0);
    expect(first).toBeGreaterThan(20);
    const before = r.force.slice(first - 15, first - 2);
    const after = r.force.slice(first + 25, first + 40);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(Math.sign(mean(before))).toBe(1);
    expect(Math.sign(mean(after))).toBe(-1);
    for (const v of after) expect(Math.sign(v)).toBe(-1);
  });

  it('the pitch is the same before and after the change', () => {
    const r = run([{ t: 0.01, ev: { type: 'noteOn', midi: 62, velocity: 120 } }], 4.5);
    const first = r.dirs.indexOf(0) * (480 / FS);
    const pb = pitchCents(r.x, et(62), first - 0.45);
    const pa = pitchCents(r.x, et(62), first + 0.25);
    expect(Math.abs(pb)).toBeLessThan(6);
    expect(Math.abs(pa - pb)).toBeLessThan(3);
  });

  it('successive détaché notes alternate down-bow and up-bow; slurred notes keep the stroke', () => {
    const notes = [62, 64, 66, 67];
    const ev = notes.flatMap((m, i) => [
      { t: 0.01 + i * 0.4, ev: { type: 'noteOn', midi: m, velocity: 80 } },
      { t: 0.35 + i * 0.4, ev: { type: 'noteOff', midi: m } },
    ]);
    const core = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true, params: { vibrato: 0 } });
    for (const e of ev) core.schedule(e.ev, Math.round(e.t * FS));
    const seen: number[] = [];
    const L = new Float32Array(480);
    const R = new Float32Array(480);
    // sample the direction in the middle of each note
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < Math.round(((i === 0 ? 0.2 : 0.4) * FS) / 480); k++) core.process(L, R, 480);
      seen.push(core.bow.dir);
    }
    expect(seen).toEqual([1, -1, 1, -1]);
    // legato (overlapping) notes on one string do not take a new stroke
    const lg = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true, params: { vibrato: 0 } });
    lg.schedule({ type: 'noteOn', midi: 62, velocity: 80 }, 0);
    lg.schedule({ type: 'noteOn', midi: 64, velocity: 80 }, Math.round(0.3 * FS));
    lg.schedule({ type: 'noteOff', midi: 62 }, Math.round(0.32 * FS));
    for (let k = 0; k < Math.round((0.6 * FS) / 480); k++) lg.process(L, R, 480);
    expect(lg.bow.dir).toBe(1);
    expect(lg.bow.changes).toBe(0);
  });

  it('with bow changes off, the bow never reverses', () => {
    const r = run([{ t: 0.01, ev: { type: 'noteOn', midi: 62, velocity: 120 } }], 4.5, { bowChanges: false });
    expect(r.core.bow.changes).toBe(0);
    expect(r.force.slice(-20).every((v) => v > 0)).toBe(true);
  });
});

// The bow in the player's hand (a finger or the mouse dragging it on the stage): controllers 128
// (signed speed, m/s), 129 (contact point along the hair) and 130 (let go).
describe('the bow in the hand', () => {
  const cc = (t: number, c: number, value: number) => ({ t, ev: { type: 'control', cc: c, value } });
  const rms = (x: Float32Array, t0: number, t1: number) => {
    let s = 0;
    for (let i = Math.round(t0 * FS); i < Math.round(t1 * FS); i++) s += x[i] * x[i];
    return Math.sqrt(s / Math.round((t1 - t0) * FS));
  };
  for (const inst of ['violin', 'viola', 'cello', 'bass'] as const) {
    it(`${inst}: a still bow is silent, a moving one sounds, both ways, and it stops with the hand`, () => {
      const core = new BowedCore({ sampleRate: FS, instrument: inst, dry: true, params: { vibrato: 0 } });
      const evs = [cc(0.01, 128, 0), cc(0.3, 128, 0.25), cc(0.3, 129, 0.4), cc(1.0, 128, -0.25), cc(1.7, 128, 0), cc(2.4, 130, 0)];
      for (const e of evs) core.schedule(e.ev, Math.round(e.t * FS));
      const n = Math.round(3 * FS);
      const x = new Float32Array(n);
      const L = new Float32Array(480);
      const R = new Float32Array(480);
      const dir: number[] = [];
      const snd: number[] = [];
      for (let i = 0; i + 480 <= n; i += 480) {
        core.process(L, R, 480);
        x.set(L, i);
        dir.push(core.bow.dir);
        snd.push(core.sounding().length);
      }
      expect(rms(x, 0.05, 0.28)).toBe(0);
      const down = rms(x, 0.6, 0.95);
      const up = rms(x, 1.3, 1.65);
      expect(down).toBeGreaterThan(1e-3);
      expect(up).toBeGreaterThan(0.4 * down);
      expect(dir[80]).toBe(1);
      expect(dir[150]).toBe(-1);
      // the hair is where the hand has it, with no automatic change
      expect(core.bow.auto).toBe(0);
      expect(snd[80]).toBe(1);
      // the bow at rest on the string: it rings down; let go: nothing is bowed
      expect(rms(x, 2.2, 2.4)).toBeLessThan(0.2 * up);
      expect(snd[snd.length - 1]).toBe(0);
    });
  }

  it('a held key stops the string and the hand bows it: the pitch is the key\u2019s; the key alone bows again after', () => {
    const r = run([cc(0.01, 128, 0), { t: 0.05, ev: { type: 'noteOn', midi: 69, velocity: 90 } }, cc(0.4, 128, 0.2), cc(1.4, 130, 0)], 2.4);
    // the key is down but the bow is still: nothing yet
    let s = 0;
    for (let i = Math.round(0.1 * FS); i < Math.round(0.38 * FS); i++) s += r.x[i] * r.x[i];
    expect(Math.sqrt(s)).toBeLessThan(1e-6);
    expect(Math.abs(pitchCents(r.x, et(69), 0.9))).toBeLessThan(8);
    // let go with the key still held: the note carries on, bowed as the key asked
    expect(r.core.sounding()).toEqual([69]);
    expect(Math.abs(pitchCents(r.x, et(69), 1.9))).toBeLessThan(8);
  });
});

// The bow planned ahead: a file playing tells the notes to come ('foresee': each note's start,
// strength and length), and the stroke is distributed as by a player who reads the part. From the
// keys nothing is foreseen and every note is met as it comes (the tests above).
describe('the bow planned ahead (a file playing)', () => {
  type Note = { t: number; dur: number; midi: number; vel?: number };
  /** the notes played, foreseen (as the file player tells them) or not; sampled every 10 ms */
  function play(inst: 'violin' | 'viola' | 'cello' | 'bass', notes: Note[], dur: number, foreseen = true, block = 480) {
    const core = new BowedCore({ sampleRate: FS, instrument: inst, dry: true, params: { vibrato: 0 } });
    // (in a file's order: at one instant a note is let go before the next begins)
    const evs = notes.flatMap((n) => [
      { f: Math.round(n.t * FS), k: 1, ev: { type: 'noteOn', midi: n.midi, velocity: n.vel ?? 80 } as object, n },
      { f: Math.round((n.t + n.dur) * FS), k: 0, ev: { type: 'noteOff', midi: n.midi } as object, n },
    ]);
    evs.sort((a, b) => a.f - b.f || a.k - b.k);
    for (const e of evs) {
      if (e.k && foreseen) core.schedule({ type: 'foresee', midi: e.n.midi, velocity: e.n.vel ?? 80, dur: e.n.dur }, e.f);
      core.schedule(e.ev, e.f);
    }
    const n = Math.round(dur * FS);
    const x = new Float32Array(n);
    const L = new Float32Array(block);
    const R = new Float32Array(block);
    const pos: number[] = [];
    const dir: number[] = [];
    const bowing: number[] = [];
    const speed: number[] = [];
    const len = core.design.bowLength;
    for (let i = 0; i + block <= n; i += block) {
      core.process(L, R, block);
      x.set(L, i);
      pos.push(core.bow.pos / len);
      dir.push(core.bow.changing ? 0 : core.bow.dir);
      bowing.push(core.strings.filter((s) => s.bowing).length);
      speed.push(Math.max(...core.strings.map((s) => (s.bowing ? s.vBow : 0))));
    }
    return { core, x, pos, dir, bowing, speed };
  }
  const at = (t: number) => Math.round(t * 100);
  const db = (x: Float32Array, t0: number, t1: number) => {
    let s = 0;
    for (let i = Math.round(t0 * FS); i < Math.round(t1 * FS); i++) s += x[i] * x[i];
    return 10 * Math.log10(s / Math.round((t1 - t0) * FS) + 1e-20);
  };

  it('detached notes, each begun as the last ends, alternate down-bow and up-bow with no change inside a note', () => {
    const notes = [62, 64, 66, 67, 69, 71].map((midi, i) => ({ t: 0.05 + 0.4 * i, dur: 0.4, midi }));
    const r = play('violin', notes, 2.6);
    expect(notes.map((n) => r.dir[at(n.t + 0.2)])).toEqual([1, -1, 1, -1, 1, -1]);
    expect(r.core.plan.strokes).toBe(6);
    expect(r.core.bow.changes).toBe(0);
    // each stroke gives back the hair the last one took: the bow stays where it began, within 3 cm
    const ends = notes.map((n) => r.pos[at(n.t + n.dur) - 1] * 0.64);
    for (let i = 2; i < ends.length; i++) expect(Math.abs(ends[i] - ends[i - 2])).toBeLessThan(0.03);
  });

  it('a slurred group (notes that overlap) stays on one bow, its hair travelling on; the note after it takes the other bow', () => {
    const notes = [
      { t: 0.05, dur: 0.43, midi: 62 },
      { t: 0.45, dur: 0.43, midi: 64 },
      { t: 0.85, dur: 0.43, midi: 66 },
      { t: 1.25, dur: 0.4, midi: 67 },
      { t: 1.65, dur: 0.6, midi: 69 },
    ];
    const r = play('violin', notes, 2.4);
    const a = at(0.1);
    const b = at(1.6);
    for (let i = a; i < b; i++) expect(r.dir[i]).toBe(1);
    for (let i = a + 1; i < b; i++) expect(r.pos[i]).toBeGreaterThanOrEqual(r.pos[i - 1]);
    expect(r.pos[b] - r.pos[a]).toBeGreaterThan(0.25);
    expect(r.core.bow.changes).toBe(0);
    expect(r.core.plan.strokes).toBe(2);
    expect(r.dir[at(1.9)]).toBe(-1);
  });

  it('a slur too long for the hair changes bow where a note inside it begins, not inside a note', () => {
    // eleven overlapping notes of 0.6 s at fortissimo: over two bows' worth, however slowly
    const notes = Array.from({ length: 11 }, (_, i) => ({ t: 0.05 + 0.6 * i, dur: 0.63, midi: 62 + (i % 5), vel: 124 }));
    const r = play('violin', notes, 6.9);
    expect(r.core.plan.changes).toBeGreaterThanOrEqual(1);
    expect(r.core.bow.auto).toBe(0);
    // the middle of every turn is at a note's start (the turn takes 70 ms)
    let turns = 0;
    for (let i = 1; i < r.dir.length; i++) if (r.dir[i] === 0 && r.dir[i - 1] !== 0) {
      const mid = i / 100 + 0.035;
      turns++;
      expect(Math.min(...notes.map((n) => Math.abs(n.t - mid)))).toBeLessThan(0.03);
    }
    expect(turns).toBe(r.core.plan.changes);
  });

  it('a long soft note is drawn slower and nearer the bridge so one bow carries it, as loud as before; unforeseen, the hair runs out inside it', () => {
    const note = [{ t: 0.05, dur: 6, midi: 50, vel: 70 }];
    const free = play('cello', note, 6.3, false);
    const seen = play('cello', note, 6.3);
    expect(free.core.bow.auto).toBeGreaterThanOrEqual(1);
    expect(seen.core.bow.changes).toBe(0);
    for (let i = at(0.2); i < at(6); i++) expect(seen.dir[i]).toBe(1);
    // slower, within the instrument's own bow speeds, and the contact nearer the bridge by as much
    const k = seen.speed[at(3)] / free.speed[at(1)];
    expect(k).toBeGreaterThan(0.44);
    expect(k).toBeLessThan(0.8);
    expect(seen.speed[at(3)]).toBeGreaterThanOrEqual(seen.core.design.bowSpeed[0]);
    const s = play('cello', note, 3).core.strings.find((q) => q.bowing)!;
    const held = play('cello', note, 3, false).core.strings.find((q) => q.bowing)!;
    expect(s.kBow).toBeLessThan(0.8);
    expect(s.beta / held.beta).toBeCloseTo(s.kBow, 1);
    expect(s.fBow).toBeLessThanOrEqual(1.3 * s.fMax);
    // from near the frog to near the tip, never jammed at either
    expect(seen.pos[at(0.1)]).toBeLessThan(0.1);
    expect(seen.pos[at(6)]).toBeGreaterThan(0.85);
    expect(Math.max(...seen.pos)).toBeLessThanOrEqual(0.95);
    // the level over the stretch both play on their first bow, and the pitch
    expect(Math.abs(db(seen.x, 0.6, 2) - db(free.x, 0.6, 2))).toBeLessThan(1.5);
    expect(Math.abs(pitchCents(seen.x, et(50), 3))).toBeLessThan(6);
  });

  it('a swell over a long note is counted in: told the dynamics to come, the stroke is drawn slower still and one bow carries it', () => {
    // 5 s at mezzo piano, the file's dynamics 14 velocity steps up from its first second on (11 on average)
    const run = (dyn?: number) => {
      const core = new BowedCore({ sampleRate: FS, instrument: 'cello', dry: true, params: { vibrato: 0 } });
      core.schedule({ type: 'foresee', midi: 50, velocity: 64, dur: 5, dyn }, 2400);
      core.schedule({ type: 'noteOn', midi: 50, velocity: 64 }, 2400);
      core.schedule({ type: 'control', cc: 131, value: 14 }, 2400 + FS);
      core.schedule({ type: 'noteOff', midi: 50 }, 2400 + 5 * FS);
      const L = new Float32Array(480);
      const R = new Float32Array(480);
      let k = 1;
      let top = 0;
      for (let i = 0; i < 520; i++) {
        core.process(L, R, 480);
        const s = core.strings.find((q) => q.bowing);
        if (s) k = s.kBow;
        top = Math.max(top, core.bow.pos / core.design.bowLength);
      }
      return { core, k, top };
    };
    const told = run(11.2);
    expect(told.core.bow.changes).toBe(0);
    expect(told.top).toBeLessThan(0.97);
    // slower than the same note planned without its swell
    expect(told.k).toBeLessThan(0.9 * run(0).k);
  });

  it('a short note before a long one is drawn faster, to give the long one its hair back; never past the fastest bow', () => {
    // long, short, long, short … (a dotted rhythm): unplanned it creeps to the tip
    const notes = Array.from({ length: 8 }, (_, i) => ({ t: 0.05 + Math.floor(i / 2) * 1.6 + (i % 2) * 1.2, dur: i % 2 ? 0.4 : 1.2, midi: i % 2 ? 52 : 50, vel: 84 }));
    const r = play('cello', notes, 6.6);
    const fast = Math.max(...r.speed.slice(at(1.35), at(1.6)));
    const slow = Math.max(...r.speed.slice(at(0.6), at(1.2)));
    expect(fast).toBeGreaterThan(1.2 * slow);
    expect(fast).toBeLessThanOrEqual(r.core.design.bowSpeed[1]);
    expect(notes.slice(0, 4).map((n) => r.dir[at(n.t + 0.5 * n.dur)])).toEqual([1, -1, 1, -1]);
    // the same notes unforeseen use twice the hair in the long notes as in the short ones' way back
    const free = play('cello', notes, 6.6, false);
    const creep = (q: typeof r) => Math.abs(q.pos[at(3.2)] - q.pos[at(0.1)]);
    expect(creep(r)).toBeLessThan(0.6 * creep(free));
    expect(r.core.bow.changes).toBe(0);
    for (let i = at(0.1); i < at(6.4); i++) {
      expect(r.pos[i]).toBeGreaterThan(0.04);
      expect(r.pos[i]).toBeLessThan(0.96);
    }
  });

  it('a stroke begins where it has room: a short soft one out in the bow, a long one by the frog, an upbeat up-bow; in a rest the lifted bow moves there', () => {
    const soft = play('violin', [{ t: 0.05, dur: 0.3, midi: 69, vel: 40 }], 0.3);
    expect(soft.pos[at(0.06)]).toBeGreaterThan(0.3);
    expect(soft.pos[at(0.06)]).toBeLessThan(0.7);
    expect(soft.dir[at(0.2)]).toBe(1);
    const long = play('violin', [{ t: 0.05, dur: 5, midi: 69, vel: 80 }], 0.3);
    expect(long.pos[at(0.06)]).toBeLessThan(0.1);
    // three quavers and a minim: up, down, up, and the minim down-bow
    const motif = [67, 67, 67, 63].map((midi, i) => ({ t: 0.3 + 0.2 * i, dur: i < 3 ? 0.2 : 1.6, midi, vel: 100 }));
    expect(motif.map((n) => play('violin', motif, 1.2).dir[at(n.t + 0.1)])).toEqual([-1, 1, -1, 1]);
    // a long note ends out at the tip; in the rest after it (1.3 s: a new phrase, down-bow) the bow,
    // off the string, goes back to the frog, where the next long note will begin
    const m = play('violin', [{ t: 0.05, dur: 5, midi: 62, vel: 80 }, { t: 6.35, dur: 5, midi: 62, vel: 80 }], 6.7);
    expect(m.pos[at(5.1)]).toBeGreaterThan(0.85);
    expect(m.bowing[at(5.6)]).toBe(0);
    expect(m.pos[at(5.8)]).toBeGreaterThan(0.85);
    expect(m.pos[at(6.33)]).toBeLessThan(0.1);
    // and it is there when the note begins: no jump as the hair lands
    expect(Math.abs(m.pos[at(6.37)] - m.pos[at(6.33)])).toBeLessThan(0.02);
    expect(m.dir[at(6.6)]).toBe(1);
  });

  it('a string crossing inside a slur: the bow arrives on the new string already moving, the same way, with no new stroke', () => {
    for (const inst of ['violin', 'viola', 'cello', 'bass'] as const) {
      const [lo, hi] = { violin: [66, 71], viola: [59, 64], cello: [47, 52], bass: [35, 40] }[inst];
      const notes = [
        { t: 0.05, dur: 0.83, midi: lo },
        { t: 0.85, dur: 0.8, midi: hi },
      ];
      const core = new BowedCore({ sampleRate: FS, instrument: inst, dry: true, params: { vibrato: 0 } });
      for (const n of notes) {
        core.schedule({ type: 'foresee', midi: n.midi, velocity: 80, dur: n.dur }, Math.round(n.t * FS));
        core.schedule({ type: 'noteOn', midi: n.midi, velocity: 80 }, Math.round(n.t * FS));
        core.schedule({ type: 'noteOff', midi: n.midi }, Math.round((n.t + n.dur) * FS));
      }
      const L = new Float32Array(48);
      const R = new Float32Array(48);
      const f1 = Math.round(0.85 * FS);
      for (let i = 0; i < f1; i += 48) core.process(L, R, 48);
      const was = core.strings.find((s) => s.midi === lo)!;
      const vOld = was.vBow;
      const pos = core.bow.pos;
      core.process(L, R, 48);
      const now = core.strings.find((s) => s.midi === hi)!;
      expect(now, inst).not.toBe(was);
      expect(now.vBow, `${inst}: the new string's bow speed`).toBeGreaterThan(0.9 * vOld);
      expect(core.bow.dir).toBe(1);
      expect(Math.abs(core.bow.pos - pos)).toBeLessThan(0.002);
      expect(core.plan.strokes).toBe(1);
      expect(core.bow.changes).toBe(0);
    }
  });

  it('nothing foreseen (the keys, a keyboard): every note is met as it comes, as ever; what was foreseen and forgotten changes nothing', () => {
    const notes = [62, 64, 66].map((midi, i) => ({ t: 0.05 + 0.4 * i, dur: 0.4, midi }));
    const keys = play('violin', notes, 1.4, false);
    expect(keys.core.plan.strokes).toBe(0);
    expect(keys.pos[at(0.06)]).toBeCloseTo(0.05, 2);
    expect(notes.map((n) => keys.dir[at(n.t + 0.2)])).toEqual([1, -1, 1]);
    // a file paused: what it told is forgotten, and the same notes by hand sound as they always did
    const core = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true, params: { vibrato: 0 } });
    for (const n of notes) core.schedule({ type: 'foresee', midi: n.midi, velocity: 80, dur: n.dur }, Math.round(n.t * FS));
    core.forget();
    for (const n of notes) {
      core.schedule({ type: 'noteOn', midi: n.midi, velocity: 80 }, Math.round(n.t * FS));
      core.schedule({ type: 'noteOff', midi: n.midi }, Math.round((n.t + n.dur) * FS));
    }
    const L = new Float32Array(480);
    const R = new Float32Array(480);
    for (let i = 0; i + 480 <= keys.x.length; i += 480) {
      core.process(L, R, 480);
      for (let k = 0; k < 480; k++) if (L[k] !== keys.x[i + k]) throw new Error(`differs at ${i + k}`);
    }
    // a note by hand in the middle of a file's notes (not foreseen) is bowed the old way
    const mixed = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true, params: { vibrato: 0 } });
    mixed.schedule({ type: 'foresee', midi: 62, velocity: 80, dur: 0.4 }, 4800);
    mixed.schedule({ type: 'noteOn', midi: 62, velocity: 80 }, 4800);
    mixed.schedule({ type: 'noteOff', midi: 62 }, 24000);
    mixed.schedule({ type: 'noteOn', midi: 72, velocity: 80 }, 36000);
    for (let i = 0; i < 48000; i += 480) mixed.process(L, R, 480);
    expect(mixed.plan.strokes).toBe(1);
    expect(mixed.plan.on).toBe(false);
    expect(mixed.strings.find((s) => s.bowing)!.kBow).toBe(1);
  });

  it('the bow in the hand overrides the plan: foreseen notes only stop the strings', () => {
    const core = new BowedCore({ sampleRate: FS, instrument: 'cello', dry: true, params: { vibrato: 0 } });
    core.schedule({ type: 'control', cc: 128, value: 0.2 }, 480);
    core.schedule({ type: 'control', cc: 129, value: 0.4 }, 480);
    core.schedule({ type: 'foresee', midi: 50, velocity: 80, dur: 6 }, 4800);
    core.schedule({ type: 'noteOn', midi: 50, velocity: 80 }, 4800);
    const L = new Float32Array(480);
    const R = new Float32Array(480);
    for (let i = 0; i < 100; i++) core.process(L, R, 480);
    expect(core.plan.strokes).toBe(0);
    expect(core.bow.auto).toBe(0);
    expect(core.bow.pos / core.design.bowLength).toBeCloseTo(0.4, 5);
    expect(core.strings.find((s) => s.bowing)!.kBow).toBe(1);
  });

  it('the plan does not depend on the host’s block size, nor on how far ahead the notes were told', () => {
    const notes = [
      { t: 0.05, dur: 0.2, midi: 55, vel: 100 },
      { t: 0.25, dur: 1.2, midi: 62, vel: 100 },
      { t: 1.45, dur: 0.43, midi: 64, vel: 60 },
      { t: 1.85, dur: 0.4, midi: 71, vel: 60 },
      { t: 2.6, dur: 0.6, midi: 67, vel: 90 },
    ];
    const a = play('violin', notes, 3.2, true, 480);
    const b = play('violin', notes, 3.2, true, 37);
    for (let i = 0; i < 37 * Math.floor(a.x.length / 37 / 480) * 480; i++) if (a.x[i] !== b.x[i]) throw new Error(`block size: differs at ${i}`);
    // told all at once (above), or each BOW_LOOK + 1 s before it sounds as the file player does
    const core = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true, params: { vibrato: 0 } });
    const late = notes.map((n) => ({ ...n, t: n.t + 6 }));
    const lead = Math.round(5 * FS);
    const evs = late.flatMap((n) => [
      { f: Math.round(n.t * FS), k: 1, n },
      { f: Math.round((n.t + n.dur) * FS), k: 0, n },
    ]);
    evs.sort((p, q) => p.f - q.f || p.k - q.k);
    for (const e of evs) core.schedule(e.k ? { type: 'noteOn', midi: e.n.midi, velocity: e.n.vel } : { type: 'noteOff', midi: e.n.midi }, e.f);
    const L = new Float32Array(480);
    const R = new Float32Array(480);
    let told = 0;
    for (let i = 0; i + 480 <= Math.round(9.2 * FS); i += 480) {
      for (; told < late.length && Math.round(late[told].t * FS) <= i + lead; told++) core.schedule({ type: 'foresee', midi: late[told].midi, velocity: late[told].vel, dur: late[told].dur }, Math.round(late[told].t * FS));
      core.process(L, R, 480);
      const j = i - 6 * FS;
      if (j >= 0) for (let k = 0; k < 480; k++) if (L[k] !== a.x[j + k]) throw new Error(`told late: differs at ${j + k}`);
    }
  });
});
