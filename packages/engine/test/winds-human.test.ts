// The woodwinds' player (core/winds-human.ts: `human`, 1 by default, 0 the model alone). With it a held note's
// pitch moves as a player's does, the flute's vibrato is heard (the model's breath vibrato hardly reaches its
// sound) and is no generator, no two tongued notes are alike, and a long note let go dies away where a short
// one stops; without it, the model as it was (bit-identical to the engine before the player: checked against
// that engine by scripts/winds-alone-same.ts and scripts/winds-human-same.ts, which a test cannot hold).
import { describe, expect, it } from 'vitest';
import { renderInstrument, type InstrumentId } from '../src/core/index.ts';
import { spectrum } from '../src/analysis/index.ts';

const FS = 44100;
const WOODS: InstrumentId[] = ['flute', 'oboe', 'clarinet', 'bassoon'];
const MID: Record<string, number> = { flute: 76, oboe: 72, clarinet: 62, bassoon: 50 };
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const sd = (v: number[]) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};
/** the pitch of x over [a, a + win) (cents from f), by the parabola through the fundamental's peak */
function cents(x: Float32Array, a: number, win: number, f: number): number {
  const sp = spectrum(x, FS, a, win, 16384, 'hann');
  const lo = Math.floor((f * 0.96) / sp.binHz);
  const hi = Math.ceil((f * 1.04) / sp.binHz);
  let top = lo;
  for (let k = lo; k <= hi; k++) if (sp.mag[k] > sp.mag[top]) top = k;
  const l = Math.log(sp.mag[top - 1]);
  const c = Math.log(sp.mag[top]);
  const r = Math.log(sp.mag[top + 1]);
  return 1200 * Math.log2(((top + (0.5 * (l - r)) / (l - 2 * c + r)) * sp.binHz) / f);
}
/** one note held `len` s (`told`: as a file sends it, its length told ahead) */
const held = (id: InstrumentId, human: number, extra: Record<string, unknown> = {}, len = 2.75, player = 0, told = false) =>
  renderInstrument({
    instrument: id,
    sampleRate: FS,
    dry: true,
    player,
    params: { human, ...extra },
    events: [...(told ? [{ time: 0.05, event: { type: 'foresee', midi: MID[id], velocity: 70, dur: len } }] : []), { time: 0.05, event: { type: 'noteOn', midi: MID[id], velocity: 70 } }, { time: 0.05 + len, event: { type: 'noteOff', midi: MID[id] } }],
    duration: len + 0.6,
  } as never).left;
const dB = (x: Float32Array, t0: number, t1: number) => {
  let s = 0;
  for (let i = Math.round(t0 * FS); i < Math.round(t1 * FS); i++) s += x[i] * x[i];
  return 10 * Math.log10(s / ((t1 - t0) * FS) + 1e-20);
};

describe('a player on the woodwinds (winds-human.ts)', () => {
  it('a held note’s pitch moves, as a player’s does (without vibrato); the model alone holds it still', () => {
    for (const id of WOODS) {
      const rough = (h: number) => {
        const x = held(id, h, { vibrato: 0 });
        const p: number[] = [];
        for (let t = 0.5; t < 2.5; t += 0.1) p.push(cents(x, Math.round(t * FS), Math.round(0.2 * FS), hz(MID[id])));
        // (from one tenth of a second to the next, against its neighbours either side: the Iowa players'
        // 0.6–3.5 ¢, scripts/winds-variation.ts)
        return sd(p.slice(1, -1).map((y, i) => y - (p[i] + p[i + 2]) / 2));
      };
      const still = rough(0);
      const moving = rough(1);
      expect(still, `${id} alone`).toBeLessThan(0.3);
      expect(moving, `${id} played`).toBeGreaterThan(0.4);
      expect(moving, `${id} played`).toBeLessThan(2.5);
    }
  });

  it('the flute’s vibrato is heard and is no generator; the model alone’s is not heard', () => {
    // the pitch every 10 ms over 60 ms, less its own slow part, over 1.6 s of the held note
    const vib = (h: number) => {
      const x = held('flute', h);
      const c: number[] = [];
      for (let t = 1.0; t < 2.6; t += 0.01) c.push(cents(x, Math.round(t * FS), Math.round(0.06 * FS), hz(MID.flute)));
      const d = c.map((v, i) => {
        const w = c.slice(Math.max(0, i - 15), i + 16);
        return v - w.reduce((a, b) => a + b, 0) / w.length;
      }).slice(15, -15);
      // each cycle's length, from one upward crossing to the next
      const ups: number[] = [];
      for (let i = 1; i < d.length; i++) if (d[i - 1] < 0 && d[i] >= 0) ups.push(i);
      const lens = ups.slice(1).map((u, k) => u - ups[k]).filter((l) => l >= 10 && l <= 33);
      return { pp: Math.max(...d) - Math.min(...d), cycles: lens.length >= 4 ? sd(lens) / (lens.reduce((a, b) => a + b, 0) / lens.length) : 0 };
    };
    const alone = vib(0);
    const played = vib(1);
    // (the Iowa flautist: 12 ¢ an amplitude at mf, 11 % from one cycle's length to the next)
    expect(alone.pp).toBeLessThan(3);
    expect(played.pp).toBeGreaterThan(20);
    expect(played.pp).toBeLessThan(70);
    expect(played.cycles).toBeGreaterThan(0.04);
    // and the vibrato parameter still sets it: none asked for, none played
    const none = held('flute', 1, { vibrato: 0 });
    const c: number[] = [];
    for (let t = 1.0; t < 2.6; t += 0.01) c.push(cents(none, Math.round(t * FS), Math.round(0.06 * FS), hz(MID.flute)));
    expect(Math.max(...c) - Math.min(...c)).toBeLessThan(12);
  });

  it('no two tongued notes alike: their levels differ by a little; the model alone’s are the same', () => {
    for (const id of WOODS) {
      const levels = (h: number) => {
        const ev = [0, 1, 2, 3, 4].flatMap((i) => [{ time: 0.05 + 0.6 * i, event: { type: 'noteOn', midi: MID[id], velocity: 80 } }, { time: 0.45 + 0.6 * i, event: { type: 'noteOff', midi: MID[id] } }]);
        const x = renderInstrument({ instrument: id, sampleRate: FS, dry: true, params: { human: h }, events: ev, duration: 3.2 } as never).left;
        // (the second note on: the first is still coming up from silence)
        return [1, 2, 3, 4].map((i) => dB(x, 0.25 + 0.6 * i, 0.4 + 0.6 * i));
      };
      const range = (v: number[]) => Math.max(...v) - Math.min(...v);
      const alone = range(levels(0));
      const played = range(levels(1));
      // (the bassoon's model has its own unevenness, its two regimes: 0.8 dB)
      expect(alone, `${id} alone`).toBeLessThan(id === 'bassoon' ? 1 : 0.7);
      expect(played, `${id} played`).toBeGreaterThan(alone + 0.3);
      expect(played, `${id} played`).toBeLessThan(4);
    }
  });

  it('a file’s long note before a rest dies away (as the recordings’ players let theirs go); a short one stops as it did; a key in the hand is let go as the model lets it', () => {
    for (const id of WOODS) {
      // the time from the key's release to 20 dB under the note's loudest (20 ms windows: a short note may
      // still be coming up as the key is let go, and the player's attack is quicker or slower than the model's)
      const fall = (h: number, len: number, told = true) => {
        const x = held(id, h, { vibrato: 0 }, len, 0, told);
        let top = -Infinity;
        for (let t = 0.05; t < 0.05 + len; t += 0.01) top = Math.max(top, dB(x, t, t + 0.02));
        let t = 0.05 + len;
        while (t < len + 0.6 && dB(x, t, t + 0.01) > top - 20) t += 0.002;
        return t - 0.05 - len;
      };
      const long0 = fall(0, 1.2);
      const long1 = fall(1, 1.2);
      expect(long1, `${id} long`).toBeGreaterThan(1.4 * long0);
      expect(long1, `${id} long`).toBeLessThan(0.3);
      const short0 = fall(0, 0.13);
      const short1 = fall(1, 0.13);
      expect(Math.abs(short1 - short0), `${id} short`).toBeLessThan(0.03);
      // (by hand nothing says a rest follows: a note 50 ms after it must still be heard as detached)
      expect(Math.abs(fall(1, 1.2, false) - fall(0, 1.2, false)), `${id} by hand`).toBeLessThan(0.03);
    }
  });

  it('a 50 ms tap speaks with the player as it does without (eight players, the taps of taps.test.ts)', () => {
    const tap = (id: InstrumentId, m: number, vel: number, len: number, player: number, human: number) => {
      const x = renderInstrument({ instrument: id, sampleRate: FS, dry: true, player, params: { human }, events: [{ time: 0.05, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 0.05 + len, event: { type: 'noteOff', midi: m } }], duration: 0.8 } as never).left;
      let p = 0;
      for (const v of x) p = Math.max(p, Math.abs(v));
      return p;
    };
    const cases: [InstrumentId, number, number][] = [['oboe', 62, 30], ['oboe', 74, 80], ['clarinet', 55, 30], ['clarinet', 67, 80], ['bassoon', 38, 30], ['bassoon', 50, 80]];
    for (const [id, m, vel] of cases) {
      const tenth = (human: number) => {
        const r: number[] = [];
        for (let p = 0; p < 8; p++) r.push(20 * Math.log10(tap(id, m, vel, 0.05, p, human) / tap(id, m, vel, 0.6, p, human)));
        return r.sort((a, b) => a - b)[1];
      };
      // (the second weakest of eight: a tap is not lost to the player's attack, as the oboe's soft low notes
      // were to a rise varied by ±10 %)
      expect(tenth(1), `${id} ${m} ${vel}`).toBeGreaterThan(tenth(0) - 3);
    }
  });

  it('a second player of the same part plays otherwise: its own pitch, not the first’s a few cents off', () => {
    for (const id of ['flute', 'bassoon'] as InstrumentId[]) {
      const track = (player: number) => {
        const x = held(id, 1, { vibrato: 0 }, 2.75, player);
        const p: number[] = [];
        for (let t = 0.5; t < 2.5; t += 0.1) p.push(cents(x, Math.round(t * FS), Math.round(0.2 * FS), hz(MID[id])));
        return p;
      };
      const a = track(0);
      const b = track(1);
      // (the model alone: the second player's track is the first's moved by a constant few cents)
      const diff = a.map((v, i) => v - b[i]);
      expect(sd(diff), id).toBeGreaterThan(0.3);
    }
  });
});
