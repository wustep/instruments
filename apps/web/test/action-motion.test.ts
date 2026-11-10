// The action close-up's motion (ui/action-motion.ts): a strike replayed in the order the instrument
// does it (key, jack, let-off, strike, check or fall; the damper with the key), a held key against a
// tap, and which strikes are replayed at all.
import { describe, expect, it } from 'vitest';
import { ActionMotion, BLOW, CHECK, LETOFF_OF, damperOfKey, type ActionState, type KeyIn, type Kind, type StrikeIn } from '../src/ui/action-motion.ts';

/** a strike as the engine records it: 2 m/s at the string, 2 ms of contact, a half-sine of force */
function strike(serial: number, vHammer = 2): StrikeIn {
  const fs = 48000;
  const n = Math.round(0.002 * fs);
  const force = new Float32Array(n);
  const compression = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    force[i] = 20 * Math.sin((Math.PI * i) / n);
    compression[i] = 0.0008 * Math.sin((Math.PI * i) / n);
  }
  return { serial, vHammer, fs, force, compression, duration: n / fs };
}
const key = (held: boolean, st: StrikeIn | null, damper = held ? 0 : 1): KeyIn => ({ held, damper, hasDamper: true, strike: st, hammerMass: 0.009 });

/** run the motion at 60 frames a second from `t0` for `ms`, the key's word given by `at(t)` */
function run(m: ActionMotion, t0: number, ms: number, at: (t: number) => KeyIn | null, sustain = 0): { t: number; s: ActionState }[] {
  const out: { t: number; s: ActionState }[] = [];
  for (let t = t0; t <= t0 + ms; t += 1000 / 60) out.push({ t, s: { ...m.step(t, at(t), sustain) } });
  return out;
}
const firstAt = (fr: { t: number; s: ActionState }[], f: (s: ActionState) => boolean) => fr.find((x) => f(x.s))?.t ?? Infinity;

describe('the action close-up’s motion', () => {
  for (const kind of ['grand', 'upright'] as Kind[]) {
    const D = BLOW[kind];

    it(`${kind}: the strike a key already carried when its close-up opened is not replayed`, () => {
      // the first frames have no word of the key yet (the engine answers a frame or two later)
      for (const since of [null, 7]) {
        const m = new ActionMotion(kind);
        m.begin(kind, since);
        const fr = run(m, 1000, 1500, (t) => (t < 1050 ? null : key(false, strike(5))));
        expect(fr.every((x) => x.s.slow === 0 && x.s.phase === 'rest' && x.s.y === 0 && x.s.keyPos === 0 && x.s.damperOn === 1), `since ${since}`).toBe(true);
      }
    });

    it(`${kind}: a held note: key, jack, let-off, strike, check; the damper leaves with the key and all return on release`, () => {
      const m = new ActionMotion(kind);
      m.begin(kind, 5);
      // the key goes down at 1000 ms; the strike's record arrives 40 ms later; released at 9000 ms
      const word = (t: number) => (t < 1000 ? key(false, strike(5)) : t < 9000 ? key(true, t < 1040 ? strike(5) : strike(6)) : key(false, strike(6)));
      const fr = run(m, 900, 10000, word);
      const tDrive = firstAt(fr, (s) => s.phase === 'drive');
      const tKey = firstAt(fr, (s) => s.keyPos > 0.02);
      const tDamp = firstAt(fr, (s) => s.damperOn < 0.5);
      const tEsc = firstAt(fr, (s) => s.escaped);
      const tHit = firstAt(fr, (s) => s.contact);
      const tCheck = firstAt(fr, (s) => s.phase === 'checked');
      expect(tDrive).toBeGreaterThanOrEqual(1040);
      expect(tDrive).toBeLessThan(1080);
      // in order: the key moves, the damper lifts, the jack escapes, the hammer strikes, is caught
      expect(tKey).toBeLessThan(tDamp);
      expect(tDamp).toBeLessThan(tEsc);
      expect(tEsc).toBeLessThan(tHit);
      expect(tHit).toBeLessThan(tCheck);
      for (const { t, s } of fr) {
        const why = `at ${t.toFixed(0)} ms (${s.phase})`;
        expect(s.y, why).toBeGreaterThanOrEqual(0);
        expect(s.y, why).toBeLessThanOrEqual(D + 1e-9);
        // the jack is under the hammer until let-off, and the hammer is past let-off once it is out
        if (s.phase === 'drive') {
          expect(s.escaped, why).toBe(false);
          expect(s.y, why).toBeLessThan(D - LETOFF_OF[kind]);
          // the damper is where the drawn key has put it, not where the (already held) key has it live
          expect(s.damperOn, why).toBeCloseTo(damperOfKey(s.keyPos), 9);
        }
        if (s.phase === 'free') expect(s.y, why).toBeGreaterThanOrEqual(D - LETOFF_OF[kind] - 1e-9);
        if (s.contact) {
          expect(s.y, why).toBe(D);
          expect(s.keyPos, why).toBe(1);
          expect(s.damperOn, why).toBe(0);
        }
      }
      // early in the drive the damper still rests on the strings (it used to jump off at once)
      expect(fr.find((x) => x.s.phase === 'drive' && x.s.keyPos < 0.3)!.s.damperOn).toBe(1);
      // the felt is compressed on the string
      expect(Math.max(...fr.filter((x) => x.s.contact).map((x) => x.s.comp))).toBeGreaterThan(0.3);
      // held: in check under the string, the key down, the jack out, the damper off
      const heldAt = fr.filter((x) => x.t > tCheck + 300 && x.t < 9000);
      expect(heldAt.length).toBeGreaterThan(10);
      for (const { s } of heldAt) {
        expect(s.y).toBeCloseTo(D - CHECK[kind], 6);
        expect(s.keyPos).toBeCloseTo(1, 6);
        expect(s.escaped).toBe(true);
        expect(s.damperOn).toBe(0);
        expect(s.active).toBe(false);
      }
      // released: everything back
      const end = fr[fr.length - 1].s;
      expect(end.phase).toBe('rest');
      expect(end.y).toBeLessThan(0.01);
      expect(end.keyPos).toBeLessThan(0.01);
      expect(end.jackOut).toBe(0);
      expect(end.escaped).toBe(false);
      expect(end.damperOn).toBe(1);
      expect(end.slow).toBe(0);
    });

    it(`${kind}: a tap: the damper is off through the strike though the real key is long up, then all return`, () => {
      const m = new ActionMotion(kind);
      m.begin(kind, 5);
      // down at 1000 ms, up at 1090 ms: the engine's damper is back on the strings from then on
      const word = (t: number) => (t < 1000 ? key(false, null) : t < 1090 ? key(true, t < 1040 ? null : strike(6)) : key(false, strike(6), 1));
      const fr = run(m, 900, 14000, word);
      const hit = fr.filter((x) => x.s.contact);
      expect(hit.length).toBeGreaterThan(0);
      expect(hit[0].t).toBeGreaterThan(1090);
      for (const { s } of hit) {
        expect(s.keyPos).toBe(1);
        expect(s.damperOn).toBe(0);
      }
      // never caught by the backcheck: it falls to its rest, the key and the damper with it
      expect(fr.some((x) => x.s.phase === 'checked')).toBe(false);
      const fall = fr.filter((x) => x.s.phase === 'fall');
      for (let i = 1; i < fall.length; i++) {
        expect(fall[i].s.y).toBeLessThanOrEqual(fall[i - 1].s.y);
        expect(fall[i].s.keyPos).toBeLessThanOrEqual(fall[i - 1].s.keyPos);
        expect(fall[i].s.damperOn).toBeGreaterThanOrEqual(fall[i - 1].s.damperOn);
      }
      const end = fr[fr.length - 1].s;
      expect([end.phase, end.slow, end.damperOn, end.escaped]).toEqual(['rest', 0, 1, false]);
      expect(end.y).toBeLessThan(0.01);
      expect(end.keyPos).toBeLessThan(0.01);
    });

    it(`${kind}: the sustain pedal holds the damper off before, through and after a strike`, () => {
      const m = new ActionMotion(kind);
      m.begin(kind, 5);
      const word = (t: number) => (t < 1000 ? key(false, null, 0) : t < 1090 ? key(true, t < 1040 ? null : strike(6), 0) : key(false, strike(6), 0));
      const fr = run(m, 900, 14000, word, 1);
      expect(fr.every((x) => x.s.damperOn === 0)).toBe(true);
    });

    it(`${kind}: the same motion at 30, 60 and 120 frames a second`, () => {
      const at = (hz: number) => {
        const m = new ActionMotion(kind);
        m.begin(kind, 5);
        let s = m.state;
        for (let t = 0; t <= 600; t += 1000 / hz) s = m.step(t, key(t >= 100, null));
        return s;
      };
      // (a key held with no strike recorded: the live easing alone)
      for (const hz of [30, 120]) {
        expect(Math.abs(at(hz).y - at(60).y)).toBeLessThan(0.5);
        expect(at(hz).keyPos).toBeCloseTo(at(60).keyPos, 2);
      }
      expect(at(60).y).toBeCloseTo(D - CHECK[kind], 0);
    });
  }

  it('a new key, or the other piano’s action, starts at rest; the next strike is replayed', () => {
    const m = new ActionMotion('grand');
    m.begin('grand', 5);
    run(m, 0, 600, (t) => key(true, t < 40 ? null : strike(6)));
    expect(m.state.slow).toBeGreaterThan(0);
    m.begin('upright', 6);
    expect(m.step(700, key(false, strike(3))).phase).toBe('rest');
    expect(m.state.slow).toBe(0);
    const fr = run(m, 720, 300, () => key(true, strike(7)));
    expect(fr[0].s.phase).toBe('drive');
    expect(m.kind).toBe('upright');
  });

  it('a soft note is replayed slower in life, and less slowed, than a loud one', () => {
    const slowOf = (v: number) => {
      const m = new ActionMotion('grand');
      m.begin('grand', 0);
      return m.step(10, key(true, strike(1, v))).slow;
    };
    expect(slowOf(0.5)).toBeLessThan(slowOf(4));
    expect(slowOf(0.5)).toBeGreaterThanOrEqual(12);
    expect(slowOf(6)).toBeLessThanOrEqual(40);
  });
});
