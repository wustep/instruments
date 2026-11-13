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

  // (FLUTE_HUMAN's vibrato entry. As first written the vibrato was the breath's alone: once a breath was 0.7 s
  // old every note had all of it, and a run's notes sat 8–10 ¢ apart, each bent 11–22 ¢: scripts/flute-ab.ts)
  describe('the flute’s vibrato belongs to the notes long enough to carry one', () => {
    /** how far the pitch moves inside the note of pitch `m` sounding over [a, b] s (cents, highest less lowest) */
    const moves = (x: Float32Array, m: number, a: number, b: number) => {
      const c: number[] = [];
      for (let t = a; t + 0.04 <= b + 1e-9; t += 0.01) c.push(cents(x, Math.round(t * FS), Math.round(0.04 * FS), hz(m)));
      return Math.max(...c) - Math.min(...c);
    };
    /** a long note, a run joined to it, and the long note the run ends on: [pitch, seconds] */
    const LINE: [number, number][] = [[76, 1.6], ...[77, 79, 81, 79, 77, 76, 77, 79, 81, 79, 77, 79].map((m): [number, number] => [m, 0.2]), [76, 1.8]];
    const line = (told: boolean, slur: boolean, human = 1) => {
      const ev: { time: number; event: Record<string, unknown> }[] = [];
      const at: number[] = [];
      let t = 0.05;
      LINE.forEach(([m, len], i) => {
        at.push(t);
        if (told) ev.push({ time: t, event: { type: 'foresee', midi: m, velocity: 76, dur: len } });
        ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: 76 } }, { time: t + len + (slur && i < LINE.length - 1 ? 0.03 : 0), event: { type: 'noteOff', midi: m } });
        t += len;
      });
      ev.sort((a, b) => a.time - b.time || (a.event.type === 'noteOff' ? 0 : 1) - (b.event.type === 'noteOff' ? 0 : 1));
      return { x: renderInstrument({ instrument: 'flute', sampleRate: FS, dry: true, params: { human }, events: ev, duration: t + 0.5 } as never).left, at };
    };

    it('a file’s run has none, slurred or tongued: its notes are straight and on their pitch; the long notes either side have it', () => {
      for (const slur of [true, false]) {
        const { x, at } = line(true, slur);
        const tag = slur ? 'slurred' : 'tongued';
        // the first long note has it by its second half, the last by its end
        expect(moves(x, 76, at[0] + 0.9, at[0] + 1.5), `${tag}: the first long note`).toBeGreaterThan(15);
        expect(moves(x, 76, at[13] + 1.0, at[13] + 1.7), `${tag}: the last long note`).toBeGreaterThan(15);
        // …which comes into it: its first third of a second is straighter than its end
        expect(moves(x, 76, at[13] + 0.08, at[13] + 0.3), `${tag}: the last long note’s beginning`).toBeLessThan(10);
        const inside: number[] = [];
        const off: number[] = [];
        for (let i = 2; i <= 12; i++) {
          const m = LINE[i][0];
          inside.push(moves(x, m, at[i] + 0.07, at[i] + 0.19));
          off.push(cents(x, Math.round((at[i] + 0.08) * FS), Math.round(0.1 * FS), hz(m)));
        }
        // (with the breath's vibrato on every note: 11–22 ¢ inside a note, the notes up to 20 ¢ off)
        expect(Math.max(...inside), `${tag}: inside a run’s note`).toBeLessThan(5);
        expect(Math.max(...off.map(Math.abs)), `${tag}: a run’s note off its pitch`).toBeLessThan(8);
      }
    });

    it('by hand (no length told) a run sheds it in two notes; a note held on gets it back', () => {
      const { x, at } = line(false, true);
      expect(moves(x, 76, at[0] + 0.9, at[0] + 1.5)).toBeGreaterThan(15);
      for (let i = 3; i <= 12; i++) expect(moves(x, LINE[i][0], at[i] + 0.07, at[i] + 0.19), `note ${i}`).toBeLessThan(8);
      expect(moves(x, 76, at[13] + 1.0, at[13] + 1.7)).toBeGreaterThan(15);
    });

    it('a slow slurred line is one vibrato: a long note joined to a long note has it from its beginning', () => {
      const ev = [
        { time: 0.05, event: { type: 'foresee', midi: 76, velocity: 76, dur: 1.5 } },
        { time: 0.05, event: { type: 'noteOn', midi: 76, velocity: 76 } },
        { time: 1.55, event: { type: 'foresee', midi: 79, velocity: 76, dur: 1.5 } },
        { time: 1.55, event: { type: 'noteOn', midi: 79, velocity: 76 } },
        { time: 1.58, event: { type: 'noteOff', midi: 76 } },
        { time: 3.05, event: { type: 'noteOff', midi: 79 } },
      ];
      const x = renderInstrument({ instrument: 'flute', sampleRate: FS, dry: true, params: { human: 1 }, events: ev, duration: 3.6 } as never).left;
      expect(moves(x, 79, 1.65, 2.1)).toBeGreaterThan(15);
    });

    it('the model alone is as it was: its breath vibrato over the breath, not the note', () => {
      // (human 0 is bit-identical to the engine before: scripts/winds-human-same.ts; here, that the entry is not in it)
      const a = line(true, true, 0).x;
      const b = line(false, true, 0).x;
      // told ahead or not, the model's run differs only by what a file's notes are given (the quick attack),
      // and neither has a vibrato to shed
      for (const x of [a, b]) expect(moves(x, 76, 0.95, 1.55)).toBeLessThan(3);
    });
  });
});
