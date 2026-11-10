// What one key's action is doing, for its close-up (action-view.ts draws it): the key, the jack's
// escapement, the hammer and the damper, from the engine's own record of that key.
//   * Each strike is replayed in slow motion from its record: the hammer's speed at the string, the
//     felt's contact force and compression over time, and the rebound that follows from them
//     (m·Δv = ∫F dt). The travel before the strike is reconstructed from that speed (the jack
//     accelerates the hammer from rest; it flies free for the last few mm).
//   * While a strike is replayed the levers follow the replay, not the clock on the wall: the key goes
//     down with the hammer it drives and the damper leaves the strings with the key (in the second
//     half of its travel), also for a note that was only tapped and is long over. A pedal that holds
//     the damper off still does.
//   * Between strikes everything is live: the key held or not, the damper where the engine has it.
//   * A strike is replayed only if it happened while the close-up was on this key: the one a key
//     already carried when its close-up opened is history.
// Nothing here touches the page: time comes in as an argument (ms), smoothing is by time constants.

export type Kind = 'grand' | 'upright';
/** the hammer's travel from rest to the string, mm */
export const BLOW = { grand: 47, upright: 45 };
/** let-off: where the jack's toe meets its button, mm before the string (the grand's 2 mm as the 3D
 *  model's `G.letoff` and [Askenfelt-Jansson]'s 1-3 mm; the upright's 2.5) */
export const LETOFF_OF = { grand: 2, upright: 2.5 };
/** the check: how far under the string the backcheck catches the hammer of a held key, mm */
export const CHECK = { grand: 16, upright: 13 };
/** slowest replay of the travel before the strike, s (soft notes are slower) */
const MAX_DRIVE_S = 2.2;
/** time constants, s: the hammer settling when nothing is replayed, the key, the jack's return under
 *  the knuckle (a rate, 1/s: it resets once the key has risen) */
const TAU_HAMMER = 0.058;
const TAU_KEY = 0.039;
const JACK_RESET = 4.8;
/** A key just gone down waits this long (ms) for its strike's record before it is drawn held without
 *  one: the record follows the key by the hammer's flight and a frame or two, and until it came the
 *  hammer used to start for the check, then jump back to its rest for the replay. */
const STRIKE_WAIT_MS = 160;

export type Phase = 'rest' | 'drive' | 'free' | 'contact' | 'fall' | 'checked';

/** the engine's record of one strike (engine `StrikeRecord`, what is used of it) */
export interface StrikeIn {
  serial: number;
  /** the hammer's speed at the string, m/s */
  vHammer: number;
  fs: number;
  force: Float32Array;
  /** felt compression, m */
  compression: Float32Array;
  /** contact duration, s */
  duration: number;
}
/** the engine's live word on the key (engine `WatchKey`, what is used of it) */
export interface KeyIn {
  held: boolean;
  /** damper contact: 0 lifted … 1 on the strings (the pedals included) */
  damper: number;
  hasDamper: boolean;
  strike: StrikeIn | null;
  hammerMass: number;
}

export interface ActionState {
  phase: Phase;
  /** hammer height above rest, mm (the string is at `BLOW`) */
  y: number;
  /** felt compression, mm */
  comp: number;
  /** the key: 0 up … 1 on the key bed */
  keyPos: number;
  /** the jack has tripped out from under the hammer */
  escaped: boolean;
  /** 0 under the knuckle … 1 tipped out */
  jackOut: number;
  /** damper contact as drawn: 0 lifted … 1 on the strings */
  damperOn: number;
  /** the hammer is on its way to the string or on it */
  active: boolean;
  contact: boolean;
  /** how many times slower than life the strike is being replayed (0: nothing is replayed) */
  slow: number;
}

interface Replay {
  t0: number;
  slow: number;
  vH: number;
  ta: number;
  tb: number;
  comp: Float32Array;
  fs: number;
  tc: number;
  vOut: number;
}

const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
/** the damper's contact for a key at `keyPos`: it starts to leave the strings at about half the key's
 *  dip and is clear at the bottom, as on the instrument */
export const damperOfKey = (keyPos: number) => 1 - smooth((keyPos - 0.45) / 0.45);

/** hammer height (mm above rest) and phase at physical time t (s) of a replay */
function replayAt(r: Replay, kind: Kind, t: number, held: boolean): { y: number; phase: Phase; comp: number } {
  const D = BLOW[kind];
  const LETOFF = LETOFF_OF[kind];
  if (t < r.ta) return { y: (D - LETOFF) * (t / r.ta) ** 2, phase: 'drive', comp: 0 };
  if (t < r.ta + r.tb) return { y: D - LETOFF + r.vH * 1000 * (t - r.ta), phase: 'free', comp: 0 };
  const tc = t - r.ta - r.tb;
  if (tc < r.tc) {
    const i = Math.min(r.comp.length - 1, Math.floor(tc * r.fs));
    return { y: D, phase: 'contact', comp: r.comp[i] * 1000 };
  }
  // after the strike: back down at the rebound speed, against gravity and the shank's spring
  const tf = tc - r.tc;
  const g = kind === 'grand' ? 9.8 : 14; // the upright's hammer is returned by a spring
  const y = D - r.vOut * 1000 * tf - 0.5 * g * 1000 * tf * tf;
  const stop = held ? D - CHECK[kind] : 0;
  if (y <= stop) return { y: stop, phase: held ? 'checked' : 'fall', comp: 0 };
  return { y, phase: 'fall', comp: 0 };
}

export class ActionMotion {
  kind: Kind;
  private replay: Replay | null = null;
  /** strikes up to this serial are history (null: whatever the key carries when first seen) */
  private since: number | null = null;
  private last = 0;
  private keyPos = 0;
  private hamY = 0;
  private jackOut = 0;
  /** the key as last seen (null: not yet), and when it was seen to go down */
  private wasHeld: boolean | null = null;
  private downAt = -Infinity;
  state: ActionState = { phase: 'rest', y: 0, comp: 0, keyPos: 0, escaped: false, jackOut: 0, damperOn: 1, active: false, contact: false, slow: 0 };

  constructor(kind: Kind) {
    this.kind = kind;
  }

  /** A key's close-up begins (the view opened, or moved to another key or another mechanism): at
   *  rest, nothing replayed. `since`: the newest strike serial the engine has reported so far, of any
   *  key (later ones are news); null if unknown, and then the strike this key already carries when
   *  it is first seen is taken as history. */
  begin(kind: Kind, since: number | null): void {
    this.kind = kind;
    this.since = since;
    this.replay = null;
    this.last = 0;
    this.keyPos = 0;
    this.hamY = 0;
    this.jackOut = 0;
    this.wasHeld = null;
    this.downAt = -Infinity;
  }

  /** `now`: ms; `w`: the engine's word on this key (null: none yet); `sustain`: the pedal, 0 … 1 */
  step(now: number, w: KeyIn | null, sustain = 0): ActionState {
    const kind = this.kind;
    const dt = this.last ? Math.max(0, Math.min(0.1, (now - this.last) / 1000)) : 0;
    this.last = now;
    const st = w?.strike ?? null;
    if (w && this.since === null) this.since = st ? st.serial : -1;
    if (w && st && this.since !== null && st.serial > this.since) {
      this.since = st.serial;
      this.replay = this.makeReplay(st, w.hammerMass, now);
    }
    const down = !!w?.held;
    if (w) {
      if (down && this.wasHeld === false) this.downAt = now;
      this.wasHeld = down;
    }
    // (a key that has just gone down, its strike still to be reported: not yet drawn held)
    const held = down && (!!this.replay || now - this.downAt >= STRIKE_WAIT_MS);
    const D = BLOW[kind];
    let y = 0;
    let comp = 0;
    let phase: Phase = 'rest';
    let slow = 0;
    if (this.replay) {
      const r = this.replay;
      const t = (now - r.t0) / 1000 / r.slow;
      const at = replayAt(r, kind, t, held);
      y = at.y;
      comp = at.comp;
      phase = at.phase;
      slow = r.slow;
      // over: caught by the backcheck, or back on its rest
      if ((phase === 'checked' || (phase === 'fall' && y <= 0)) && t > r.ta + r.tb + r.tc + 0.05) {
        this.replay = null;
        this.hamY = y;
        this.jackOut = 1;
      }
    }
    const replaying = !!this.replay;
    if (!replaying && slow === 0) {
      // live: a held key's hammer sits in check with the jack tripped; the jack resets under the
      // knuckle once the key has risen
      this.hamY += ((held ? D - CHECK[kind] : 0) - this.hamY) * (1 - Math.exp(-dt / TAU_HAMMER));
      if (held) this.jackOut = 1;
      else this.jackOut = Math.max(0, this.jackOut - JACK_RESET * dt);
      y = this.hamY;
      phase = held ? 'checked' : 'rest';
    }
    // the key follows the hammer while the jack drives it, then sits on the key bed until the hammer
    // comes back (a held key stays there)
    const driveFrac = Math.min(1, Math.max(0, y) / (D - LETOFF_OF[kind]));
    if (slow) this.keyPos = phase === 'drive' ? driveFrac : held || phase !== 'fall' ? 1 : driveFrac;
    else this.keyPos += ((held ? 1 : 0) - this.keyPos) * (1 - Math.exp(-dt / TAU_KEY));
    // the damper: with the drawn key while a strike is replayed or awaited (unless something else
    // holds it off: the pedal under a key that is down, anything at all once the key is up), else as
    // the engine has it
    const live = w ? w.damper : 1;
    const other = down ? 1 - Math.min(1, sustain * 1.4) : live;
    const damperOn = w && !w.hasDamper ? 0 : slow || (down && !held) ? Math.min(damperOfKey(this.keyPos), other) : live;
    const flown = phase === 'free' || phase === 'contact' || phase === 'fall' || phase === 'checked';
    const jackOut = slow ? (phase === 'drive' ? 0 : 1) : this.jackOut;
    this.state = {
      phase,
      y,
      comp,
      keyPos: this.keyPos,
      escaped: slow ? flown : jackOut > 0.5,
      jackOut,
      damperOn,
      active: phase === 'drive' || phase === 'free' || phase === 'contact',
      contact: phase === 'contact',
      slow,
    };
    return this.state;
  }

  private makeReplay(st: StrikeIn, hammerMass: number, now: number): Replay {
    const k = this.kind;
    const vH = Math.max(0.2, st.vHammer);
    const ta = (2 * (BLOW[k] - LETOFF_OF[k])) / 1000 / vH;
    const tb = LETOFF_OF[k] / 1000 / vH;
    let imp = 0;
    for (let i = 0; i < st.force.length; i++) imp += st.force[i] / st.fs;
    const vOut = Math.max(0.05 * vH, imp / Math.max(1e-4, hammerMass) - vH);
    const slow = Math.max(12, Math.min(40, ta > 0 ? MAX_DRIVE_S / ta : 25));
    return { t0: now, slow, vH, ta, tb, comp: st.compression, fs: st.fs, tc: Math.max(st.duration, st.force.length / st.fs), vOut };
  }
}
