// Trumpet (B♭): a lip reed driving a bore (Cook 1991/1992, "TBone"/STK Brass, with real
// valve fingerings). The player's lips are a mass–spring valve tuned near the note; the
// pressure difference across them (mouth − bore) moves them, the flow through the lip
// opening grows with its square (louder = brighter, by the nonlinearity, not a filter),
// and the bore is a delay loop whose round trip sets its harmonic series. The valves
// lengthen the bore; the lip tension picks which partial of it sounds, as on the real
// instrument. The bell reflects the lows and radiates the highs.

import { Pump } from './pump.ts';
import { MonoKeys, Tongue } from './mono.ts';
import type { KeySummary } from '../api/messages.ts';
import { CC_DYNAMICS, DYN_TAU, type ExciteTrace, type InstrumentCore } from './instrument.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { biquadHighpass, biquadLowpass, biquadPeaking, biquadHighShelf } from './filters.ts';
import type { PianoEvent } from './piano-core.ts';
import { clamp, playerCents, playerSeed, playerVibrato } from './util.ts';
import tuning from './brass-tuning.json';
/** measured per-note correction (cents the bare model plays sharp; scripts/tune-trumpet.ts) */
const TUNING = tuning as Record<string, number>;

export interface TrumpetParams {
  /** blowing pressure scale */
  breath: number;
  /** lip tension: semitones above (+) or below (−) the note; far enough, the next partial speaks */
  lip: number;
  /** lip vibrato depth (fraction of the lip frequency, cents/100-ish) */
  vibrato: number;
  room: number;
  volume: number;
  /** orchestra mode: where it sits on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
}

const BUF = 8192;
const TRACE = 2048;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** concert pitch of the open B♭ trumpet's pedal (partial 1) */
const PEDAL = 46;
const PARTIALS = [2, 3, 4, 5, 6, 8, 9, 10];
const VALVES = ['open', '2', '1', '1+2', '2+3', '1+3', '1+2+3'];
/** lip resonator peak gain × (1 − r), lip tuning below the note (semitones), static opening at full blowing */
const LIP_GAIN = 0.025;
const LIP_BELOW = 0.3;
const LIP_OPEN = 0.5;
/** the bell: below its cutoff it radiates ∝ f² (a small opening, ka < 1) and reflects the rest;
 *  above, the highs leave. Round 3b: a second-order high-pass at the cutoff. Before it the model's
 *  fundamental dominated (Iowa trumpet: the 3rd harmonic does, the 1st is 5–11 dB below it) */
const RAD_FC = 1400;
/** turbulence where the air squeezes through the lips: noise in the flow, ∝ the flow (round 3b:
 *  the model was 16 dB cleaner than the Iowa trumpet's harmonics-to-noise ratio) */
const BREATH_NOISE = 0.016;
/** The tongue's release. Round 3 judged a kick alone against the Iowa trumpet's sustained notes:
 *  NO CLEAR CHANGE (its 10–90 % attack times scatter from 15 to 500 ms note to note), and left it
 *  off. But without it the buzz grows from the breath noise alone: at 48 kHz the note reached 10 %
 *  of its level 92–530 ms after the key (mean 258 ms) and a 50 ms tap peaked 35 dB under the held
 *  note (scripts/tap-audit.ts). A tongued trumpet note has no such dead time, so:
 *  TONGUE_KICK: the lips start from this displacement, not from rest;
 *  ATTACK_BOOST, ATTACK_TAU: the lips' gain is transiently higher (1 + boost·e^(−t/τ)), as the
 *  flute's jet is, so that a soft note also speaks. Chosen on the tap audit (key → 10 %: 9–36 ms,
 *  mean 12 ms; a 50 ms tap 0.6 dB under the held note) with the 10–90 % attack medians against
 *  Iowa's as the fit (pp 50 ms: 155 → 80; ff 30 ms: 55 → 35; mf 130 ms: 70 → 50, the one that moves
 *  away: the recorded mf notes swell) and the judge as the guard: NO CLEAR CHANGE, no guard broken,
 *  held-out attack error 1.41 → 1.37 octaves. */
const TONGUE_KICK = 0.3;
const ATTACK_BOOST = 1.5;
const ATTACK_TAU = 0.06;
/** the shortest tongued note: the breath stays on this long after the tongue's release, even when
 *  the key is let go sooner (s). Players' fastest single-tongued notes are about 100 ms apart */
const MIN_BLOW = 0.1;
/** tongued over the breath (mono.ts): the tongue lets the air go again in this long (s), and the lips'
 *  transient as they are set buzzing again is this much of a first attack's */
const LICK_OPEN = 0.003;
const LICK_BOOST = 0.5;
/** dynamic brightness: output low-pass 18 kHz at ff falling as exp(−k·(0.93 − p)) towards pp (0: off) */
const TILT_K = 0;
/** spectral enrichment: a two-pole low-pass at N·f0, N growing with the blowing pressure (0: off) */
const ENRICH_N = 0;
/** tuning experiments only (scripts/trumpet-iter.ts): knobs from TPT='{"kick":0.3}' or globalThis.__tpt */
const knobs = (): Record<string, number> => {
  const g = (globalThis as { __tpt?: Record<string, number> }).__tpt;
  if (g) return g;
  const env = typeof process !== 'undefined' ? process.env?.TPT : undefined;
  return env ? (JSON.parse(env) as Record<string, number>) : {};
};
let KNOBS: Record<string, number> | null = null;
/** tube length of the open B♭ trumpet, m */
const L_OPEN = 1.48;

/** standard fingering: the fewest valves (then the lowest partial) that reach the note */
export function trumpetFingering(m: number): { partial: number; lower: number; valves: string } {
  let best = { partial: 2, lower: 0, valves: 'open' };
  let bestScore = Infinity;
  for (const n of PARTIALS)
    for (let v = 0; v <= 6; v++) {
      if (PEDAL - v + Math.round(12 * Math.log2(n)) !== m) continue;
      const score = v * 10 + n;
      if (score < bestScore) {
        bestScore = score;
        best = { partial: n, lower: v, valves: VALVES[v] };
      }
    }
  return best;
}

export class TrumpetCore implements InstrumentCore {
  readonly id = 'trumpet' as const;
  readonly fs: number;
  params: TrumpetParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 1;
  sympatheticAllowed = true;
  dry: boolean;
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  private bore = new Float64Array(BUF);
  /** the ring left in the bore, as its length changes at once (setNote) */
  private boreTmp = new Float64Array(BUF);
  private D = 200;
  private Dtarget = 200;
  // lips: a two-pole resonator (mass–spring) on the pressure difference
  private lipF = 440;
  private lipFTarget = 440;
  private y1 = 0;
  private y2 = 0;
  private x1 = 0;
  private x2 = 0;
  private dcX = 0;
  private dcY = 0;
  private lp = 0;
  private radLp = 0;
  private tilt = 0;
  private ex1 = 0;
  private ex2 = 0;
  private ey1 = 0;
  private ey2 = 0;
  private enC = [1, 0, 0, 0, 0];
  private enFc = 0;
  private rx1 = 0;
  private rx2 = 0;
  private ry1 = 0;
  private ry2 = 0;
  private radC = [1, 0, 0, 0, 0];
  private radFcSet = 0;
  private nzSeed = 12345;
  private pressure = 0;
  private pTarget = 0;
  private attackTau = 0.02;
  private vibPhase = 0;
  /** the player's vibrato (util.ts playerVibrato): starting phase and rate factor */
  private vib0 = 0;
  private vibRate = 1;
  private expression = 1;
  /** CC_DYNAMICS (instrument.ts): velocity steps above (below) the note as begun, asked and as the breath has it */
  private dynTarget = 0;
  private dyn = 0;
  private bendFactor = 1;
  /** the player's intonation, semitones (util.ts playerCents), under any bend */
  private tune = 0;
  private note = 70;
  /** the keys as one player takes them (mono.ts), and the tongue's stroke on a sounding note */
  private keys: MonoKeys;
  private lick = new Tongue();
  /** the tongue has held the last note stopped over a rest: the next is let go as a first attack is */
  private afterStop = false;
  /** a strength taken up once the tongue is down (0: none): tongued over the breath, the air through the
   *  stroke's first milliseconds is still the last note's, so nothing steps under a sounding tone */
  private velNext = 0;
  /** when the tongue last let go (frame), and how much of a first attack's transient that stroke has (the
   *  lips' extra gain, their kick: 1 for a note from silence) */
  private tongueAt = 0;
  private boostNow = 1;
  /** the lips are kicked as the stroke under way lets go */
  private lickKick = false;
  private velocity = 80;
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
  private pump = new Pump(64);
  private oL = new Float64Array(128);
  private oR = new Float64Array(128);
  private prevOut = 0;
  private level = 0;
  private trLip = new Float32Array(TRACE);
  private trP = new Float32Array(TRACE);
  private trI = 0;
  private hist = new Float32Array(4096);
  private histI = 0;
  private modeAmps = new Float32Array(16);
  private modeFreqs = new Float64Array(16);
  /** output level, matched to the Iowa trumpet's (as the other instruments are to theirs): the
   *  bell's high-pass (round 3b) took 5.7 dB off the fundamental-heavy level it had */
  private gain = 0.9 * Math.pow(10, 5.7 / 20);
  private noteStart = 0;
  /** frame until which a tongued note keeps its breath (MIN_BLOW), and a key let go before it */
  private blowUntil = 0;
  private releasePending = false;

  constructor(opts: { sampleRate: number; params?: Partial<TrumpetParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { breath: 1, lip: 0, vibrato: 0.004, room: 0.3, volume: 1, ...opts.params };
    this.keys = new MonoKeys(this.fs);
    this.nzSeed = playerSeed(12345, opts.player);
    const pv = playerVibrato(opts.player);
    this.vib0 = this.vibPhase = pv.phase;
    this.vibRate = pv.rate;
    this.tune = playerCents(opts.player) / 100;
    if (this.tune) this.bendFactor = Math.pow(2, -this.tune / 12);
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    this.updatePost();
    this.setNote(70, true);
  }

  private updatePost(): void {
    const fs = this.fs;
    // the bell's radiation: a rising presence region and a gentle top
    this.eq.set([biquadHighpass(120, 0.7, fs), biquadPeaking(1300, 1.0, 3, fs), biquadHighShelf(7000, -6, fs)]);
    this.room.configure(this.params.room, this.params.seat);
  }

  private setNote(m: number, immediate: boolean): void {
    const { partial, lower } = trumpetFingering(m);
    // the bore's round trip is one period of its fundamental; the note is its n-th partial
    // the lips pull the pitch above the bore's mode; a measured table lengthens the bore
    // (and lowers the lips) so each note plays at equal temperament
    const c = Math.pow(2, (TUNING[m] ?? 0) / 1200);
    this.Dtarget = ((partial * this.fs) / et(m)) * c;
    if (immediate) {
      // A note from near silence takes its length at once; what is left of the last note's ring in the bore
      // is stretched to the new length, so that the read goes on from where it was. Set in one sample over that
      // ring, the read point jumped through it: a one-sample step at every soft note after another, 0.88 of the
      // steady note's largest step against 0.05 around it (audio audit 2: 4 pp note-ons of a walk over 2×,
      // −34…−39 dBFS). A note from silence (the bore cleared: level 0) is as it was.
      if (this.level > 0 && this.D !== this.Dtarget) this.restretch(this.D, this.Dtarget);
      this.D = this.Dtarget;
    }
    this.lipFTarget = et(m) / c;
    if (immediate) this.lipF = this.lipFTarget;
    this.note = m;
    const fb = et(PEDAL - lower);
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = (k + 1) * fb;
  }

  /** The round trip in the bore read from length d0 laid out again over length d1 (no allocation): the next
   *  sample read at d1 is the one d0 would have given, the rest of the ring stretched with it. */
  private restretch(d0: number, d1: number): void {
    const bore = this.bore;
    const tmp = this.boreTmp;
    const mask = BUF - 1;
    const w = this.frame;
    // the positions the read at d1 will meet before anything new is written: p0 … w − 1
    const p0 = Math.floor(w - d1);
    const n = Math.min(BUF - 4, w - p0);
    for (let k = 0; k < n; k++) {
      // (read at d1 at time w + s, the old read at time w + s·d0/d1, between samples; none from the future)
      const x = Math.min(w - 1, w - d0 + (p0 + k - (w - d1)) * (d0 / d1));
      const i = Math.floor(x);
      const f = x - i;
      tmp[k] = bore[i & mask] * (1 - f) + bore[(i + 1) & mask] * f;
    }
    for (let k = 0; k < n; k++) bore[(p0 + k) & mask] = tmp[k];
  }

  schedule(ev: unknown, frame?: number): void {
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    const fe = ev as { type?: string; midi: number; velocity: number; dur: number };
    // a note to come is not an event: it is known at once, and nothing happens at its frame (mono.ts)
    if (fe.type === 'foresee') return this.keys.foresee(f, fe.midi, fe.velocity, fe.dur);
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev: ev as PianoEvent });
  }

  /** what was foreseen is forgotten (the file paused or stopped) */
  forget(): void {
    // (a rest held for a note that will not come now: the breath is let go)
    if (this.keys.forget()) this.pTarget = 0;
  }

  private apply(ev: PianoEvent | { type: 'control'; cc: number; value: number }): void {
    switch (ev.type) {
      // the notes of one instant are taken together (settle)
      case 'noteOn':
        if (ev.velocity <= 0) this.keys.off(ev.midi);
        else this.keys.on(ev.midi, ev.velocity);
        break;
      case 'noteOff':
        this.keys.off(ev.midi);
        break;
      case 'sustain':
        this.sustain = clamp(ev.value, 0, 1);
        this.keys.poke();
        break;
      case 'control':
        // (below 0, CC_REST: back to the breath the note asks for)
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.expression = ev.value < 0 ? 1 : 0.4 + 0.8 * clamp(ev.value, 0, 1);
        else if (ev.cc === CC_DYNAMICS) this.dynTarget = clamp(ev.value, -64, 64);
        break;
      case 'bend':
        this.bendFactor = Math.pow(2, -(clamp(ev.value, -12, 12) + this.tune) / 12);
        break;
      case 'allNotesOff':
        this.keys.clear();
        this.pTarget = 0;
        this.releasePending = false;
        break;
      default:
        break;
    }
  }

  /** The instant's notes, as one player takes them (mono.ts): a note from silence is tongued, a note over
   *  a held one slurred, a note joined to the last (or its pitch struck again) tongued over the breath. */
  private settle(): void {
    const a = this.keys.settle(this.frame, this.pTarget > 0, this.sustain >= 0.5);
    if (!a) return;
    if (a.kind === 'release') return this.release();
    if (a.kind === 'stop') {
      // a foreseen note is so near that the breath stays: the tongue stops this one until it begins
      this.lick.stop(this.fs, a.len * this.fs, LICK_OPEN * this.fs);
      this.releasePending = false;
      this.afterStop = true;
      return;
    }
    const m = clamp(a.midi, 52, 86);
    // (a stroke made ahead for a note that came otherwise lets go)
    if (this.lick.down && !(a.kind === 'retongue' && a.struck)) this.lick.release(LICK_OPEN * this.fs);
    if (a.kind === 'slur' && !a.velocity) {
      // back to a note still held: the valves and the lips only
      this.setNote(m, false);
      return;
    }
    const was = this.velocity;
    const vel = a.velocity;
    this.velocity = vel;
    this.velNext = 0;
    if (a.kind === 'retongue' && !(a.struck && this.lick.landed)) {
      this.velNext = vel;
      this.velocity = was;
    }
    this.releasePending = false;
    const XA = (globalThis as { __tpt?: Record<string, number> }).__tpt ?? (KNOBS ??= knobs());
    if (a.kind === 'slur') {
      this.setNote(m, false);
      this.pTarget = 1;
      this.attackTau = 0.01 * (XA.att ?? 1);
    } else if (a.kind === 'tongue') {
      this.setNote(m, this.level < 1e-3);
      this.pTarget = 1;
      this.lick.reset();
      this.lickKick = false;
      // tongued attacks are quick; louder ones quicker
      this.attackTau = (0.03 - 0.02 * (vel / 127)) * (XA.att ?? 1);
      // the tongue releases the lips: they start from a kick, not from rest
      this.y1 = (XA.kick ?? TONGUE_KICK) * (0.5 + 0.5 * (vel / 127));
      this.vibPhase = this.vib0;
      this.noteStart = this.frame;
      this.tongueAt = this.frame;
      this.boostNow = 1;
      this.afterStop = false;
      this.blowUntil = this.frame + Math.round((XA.minBlow ?? MIN_BLOW) * this.fs);
    } else {
      // tongued over the breath: the valves and the lips move, the tongue stops the air and lets it go again
      const same = m === this.note;
      this.setNote(m, false);
      this.pTarget = 1;
      this.attackTau = Math.min(this.attackTau, (0.03 - 0.02 * (vel / 127)) * (XA.att ?? 1));
      this.tongueAt = this.frame + this.lick.retongue(a.struck, this.fs, same, LICK_OPEN * this.fs);
      this.boostNow = this.afterStop ? 1 : LICK_BOOST;
      this.afterStop = false;
      this.lickKick = true;
      this.noteStart = this.frame;
      this.blowUntil = this.frame + Math.round((XA.minBlow ?? MIN_BLOW) * this.fs);
    }
    if (a.tap) this.release();
  }

  /** The key is up: stop blowing, but not before the tongued note has had its minimum breath. */
  private release(): void {
    if (this.pTarget > 0 && this.frame < this.blowUntil) this.releasePending = true;
    else this.pTarget = 0;
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<TrumpetParams>) };
    if (this.params.room !== old.room || this.params.volume !== old.volume) this.updatePost();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
  }

  /** the one note actually sounding (a monophonic instrument: the last held key wins and a
   *  release returns to the previous held one), or none */
  sounding(): number[] {
    return this.pTarget > 0 && !this.keys.silent ? [this.note] : [];
  }

  allSoundOff(): void {
    this.dyn = this.dynTarget = 0;
    this.bore.fill(0);
    this.pressure = this.pTarget = 0;
    this.releasePending = false;
    this.keys.clear();
    this.keys.forget();
    this.lick.reset();
    this.lickKick = false;
    this.y1 = this.y2 = this.dcX = this.dcY = this.lp = 0;
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  get activeVoiceCount(): number {
    return this.pressure > 1e-3 || this.level > 1e-4 ? 1 : 0;
  }
  get activeSympatheticCount(): number {
    return 0;
  }
  get modeFrequencies(): Float64Array {
    return this.modeFreqs;
  }

  /** Render `frames` samples into outL/outR. Internal blocks (≤ 64, cut at events) do not depend
   *  on `frames` (see Pump). */
  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    this.pump.pull(outL, outR, frames, (L, R) => {
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      this.settle();
      let n = 64;
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      if (this.releasePending) {
        // a key let go inside the minimum blow: the breath stops when that is over (the block is
        // cut there, as at an event)
        if (this.frame >= this.blowUntil) {
          this.releasePending = false;
          if (!this.keys.any && this.sustain < 0.5) this.pTarget = 0;
        } else n = Math.min(n, this.blowUntil - this.frame);
      }
      // a foreseen note joined to the one sounding: the tongue's stroke is made ahead of it (mono.ts)
      n = this.keys.plan(this.frame, n, this.pTarget > 0 && !this.releasePending);
      if (this.keys.overdue) {
        // (the note a rest was held for never came: the breath is let go, behind the tongue if it is down)
        this.keys.overdue = false;
        this.pTarget = 0;
        if (this.lick.down) this.pressure = 0;
      }
      if (this.keys.strokeNow >= 0) this.lick.ahead(this.fs, this.keys.strokeNow - this.frame, LICK_OPEN * this.fs);
      this.render(n);
      for (let t = 0; t < n; t++) {
        L[t] = this.oL[t];
        R[t] = this.oR[t];
      }
      return n;
    });
  }

  /** the frame now leaving process() (the core has rendered up to `frame`) */
  get outputFrame(): number {
    return this.frame - this.pump.pending;
  }

  private render(n: number): void {
    if (this.velNext && this.lick.landed) {
      this.velocity = this.velNext;
      this.velNext = 0;
    }
    const X = (globalThis as { __tpt?: Record<string, number> }).__tpt ?? (KNOBS ??= knobs());
    const fs = this.fs;
    const dt = n / fs;
    const P = this.params;
    const k = 1 - Math.exp(-dt / (this.pTarget > this.pressure ? this.attackTau : 0.04));
    this.pressure += (this.pTarget - this.pressure) * k;
    if (this.pressure < 1e-5 && this.pTarget === 0) this.pressure = 0;
    const age = (this.frame - this.noteStart) / fs;
    this.vibPhase += 2 * Math.PI * 5.2 * this.vibRate * dt;
    const vib = 1 + P.vibrato * clamp((age - 0.35) / 0.4, 0, 1) * Math.sin(this.vibPhase);
    // CC_DYNAMICS: the lips are blown as a note begun that much harder or softer would be (a time constant)
    if (this.dyn !== this.dynTarget) {
      this.dyn += (this.dynTarget - this.dyn) * (1 - Math.exp(-dt / DYN_TAU));
      if (Math.abs(this.dynTarget - this.dyn) < 1e-3) this.dyn = this.dynTarget;
    }
    const v01 = this.dyn ? clamp(this.velocity + this.dyn, 1, 127) / 127 : this.velocity / 127;
    // mouth pressure (normalised): louder notes blow harder
    const pLo = X.pLo ?? 0.42;
    const pMouth = this.pressure * P.breath * this.expression * (pLo + (1 - pLo) * v01);
    // the lips follow the note (with the player's tension offset and vibrato)
    // the lips buzz a little below the note: the bore mode just above them takes over
    const lipTarget = this.lipFTarget * Math.pow(2, (P.lip - LIP_BELOW) / 12) * vib / this.bendFactor;
    // (a time constant, not a per-block fraction: the glide must not depend on block length)
    this.lipF += (lipTarget - this.lipF) * (1 - Math.exp(-dt / 0.006));
    const r = 0.997;
    const th = (2 * Math.PI * this.lipF) / fs;
    const a1 = -2 * r * Math.cos(th);
    const a2 = r * r;
    // peak gain LIP_GAIN/(1 - r) at every pitch
    // right after the tongue's release the lips are set to buzz: a transient extra gain (as on the
    // flute's jet), decaying over ATTACK_TAU, lets a soft note speak as soon as a played one does
    const ageT = Math.max(0, this.frame - this.tongueAt) / fs;
    const boost = 1 + (X.ab ?? ATTACK_BOOST) * this.boostNow * Math.exp(-ageT / (X.abT ?? ATTACK_TAU));
    const b0 = LIP_GAIN * (X.gain ?? 1) * boost * 2 * Math.sin(th);
    // bell loss in the loop: higher notes lose a little more at the bell
    const lpA = X.bell ? Math.exp((-2 * Math.PI * (X.bellFc ?? 1500)) / fs) : 0.12 + 0.18 * clamp((this.lipF - 200) / 800, 0, 1);
    const hpA = Math.exp((-2 * Math.PI * (X.bellFc ?? 1500)) / fs);
    const nz = X.noise ?? BREATH_NOISE;
    // dynamic brightness: the bore's nonlinear steepening brightens loud playing; soft playing
    // has none (the cutoff falls as the blowing pressure does)
    const bN = pMouth / Math.max(1e-6, P.breath * this.expression);
    const nN = (X.lpN ?? ENRICH_N) > 0 ? (X.lpN ?? ENRICH_N) * Math.exp((X.lpK ?? 4) * (bN - 0.557)) : 0;
    if (nN > 0) {
      const fc = Math.min(0.45 * fs, nN * this.lipF);
      if (Math.abs(fc - this.enFc) > 1) {
        this.enFc = fc;
        const lp = biquadLowpass(fc, 0.707, fs);
        this.enC = [lp[0], lp[1], lp[2], lp[3], lp[4]];
      }
    }
    const kT = X.tiltK ?? TILT_K;
    const tiltA = kT > 0 ? Math.exp((-2 * Math.PI * Math.min(0.45 * fs, 18000 * Math.exp(-kT * Math.max(0, 0.93 - pMouth / Math.max(1e-6, P.breath * this.expression))))) / fs) : 0;
    if ((X.rad === undefined || X.rad === 2) && this.radFcSet !== (X.radFc ?? RAD_FC)) {
      this.radFcSet = X.radFc ?? RAD_FC;
      const hp = biquadHighpass(this.radFcSet, 0.707, fs);
      this.radC = [hp[0], hp[1], hp[2], hp[3], hp[4]];
    }
    const DT = this.Dtarget * this.bendFactor;
    const bore = this.bore;
    const mask = BUF - 1;
    const oL = this.oL;
    const oR = this.oR;
    let peak = 0;
    // a stroke of the tongue on the sounding note (mono.ts): the air it lets through to the lips
    const lick = this.lick;
    let licking = lick.busy;
    for (let t = 0; t < n; t++) {
      this.D += (DT - this.D) * 0.003;
      const w = this.frame + t;
      const D = this.D;
      const di = Math.floor(D);
      const fr = D - di;
      const boreOut = bore[(w - di) & mask] * (1 - fr) + bore[(w - di - 1) & mask] * fr;
      // lips: driven by the pressure difference across them
      let mouth = 0.3 * pMouth;
      if (licking) {
        const wasDown = lick.down;
        mouth *= lick.next();
        if (this.lickKick && wasDown && !lick.down) {
          // let go: the lips are kicked again, less than from rest
          this.lickKick = false;
          this.y1 += (X.kick ?? TONGUE_KICK) * this.boostNow * (0.5 + 0.5 * v01);
        }
        licking = lick.busy;
      }
      const dp = mouth - 0.85 * boreOut;
      // the lips: a mass–spring (all-pole resonator) driven by the varying part of the
      // pressure difference; the steady part is the static opening below. Its phase near
      // resonance is what lets a bore mode just above the lip frequency sustain the buzz.
      const dpAc = dp - this.x1 + 0.9986 * this.x2;
      this.x1 = dp;
      this.x2 = dpAc;
      const y = b0 * dpAc - a1 * this.y1 - a2 * this.y2;
      this.y2 = this.y1;
      this.y1 = y;
      // lip opening: pushed open by the mouth pressure, buzzing around that; flow grows
      // with the square of the opening (Cook's valve)
      const h = Math.min(X.hmax ?? 1, Math.max(0, LIP_OPEN * (X.open ?? 1) * Math.sqrt(Math.max(0, mouth) / 0.3) + y));
      const open = h * h;
      // flow through the opening, the rest reflected at the lips
      let lipOut = open * mouth + (1 - open) * 0.85 * boreOut;
      if (nz) {
        this.nzSeed = (Math.imul(this.nzSeed, 1664525) + 1013904223) >>> 0;
        lipOut += nz * open * mouth * ((this.nzSeed / 4294967296) * 2 - 1);
      }
      // DC blocker, bell loss
      const x = lipOut - this.dcX + 0.995 * this.dcY;
      this.dcX = lipOut;
      this.dcY = x;
      this.lp = (1 - lpA) * x + lpA * this.lp;
      bore[w & mask] = this.lp;
      // radiation from the bell: the highs it does not reflect
      let out: number;
      if (X.rad === undefined || X.rad === 2) {
        // second-order high-pass (radiation ∝ f² below the bell's cutoff), plus a little direct
        const c = this.radC;
        const yv = c[0] * boreOut + c[1] * this.rx1 + c[2] * this.rx2 - c[3] * this.ry1 - c[4] * this.ry2;
        this.rx2 = this.rx1;
        this.rx1 = boreOut;
        this.ry2 = this.ry1;
        this.ry1 = yv;
        out = yv * (X.radHi ?? 2) + (X.radLo ?? 0.05) * boreOut;
      } else if (X.rad === 1 || X.bell) {
        this.radLp = (1 - hpA) * boreOut + hpA * this.radLp;
        out = (boreOut - this.radLp) * (X.radHi ?? 3) + (X.radLo ?? 0.15) * this.radLp;
      } else out = 0.55 * (boreOut - this.prevOut) * 6 + 0.45 * boreOut;
      this.prevOut = boreOut;
      if (tiltA > 0) {
        this.tilt = (1 - tiltA) * out + tiltA * this.tilt;
        out = this.tilt;
      }
      if (nN > 0) {
        // spectral enrichment: soft playing keeps only the lowest few harmonics (two poles at N·f0)
        const c = this.enC;
        const yv = c[0] * out + c[1] * this.ex1 + c[2] * this.ex2 - c[3] * this.ey1 - c[4] * this.ey2;
        this.ex2 = this.ex1;
        this.ex1 = out;
        this.ey2 = this.ey1;
        this.ey1 = yv;
        out = yv;
      }
      oL[t] = out;
      oR[t] = 0.92 * out;
      this.trLip[this.trI] = open;
      this.trP[this.trI] = boreOut;
      this.trI = (this.trI + 1) & (TRACE - 1);
      this.hist[this.histI] = boreOut;
      this.histI = (this.histI + 1) & 4095;
      const a = Math.abs(out);
      if (a > peak) peak = a;
    }
    this.level = Math.max(peak, this.level * 0.9);
    const g = this.gain * P.volume;
    for (let t = 0; t < n; t++) {
      oL[t] *= g;
      oR[t] *= g;
    }
    this.eq.process(oL, oR, n);
    if (!this.dry) {
      this.room.process(oL, oR, n, 1, P.room * 0.7);
      this.limiter.process(oL, oR, n);
    }
    this.frame += n;
    if (this.level < 1e-9 && this.pressure === 0 && this.level > 0) {
      this.bore.fill(0);
      this.level = 0;
    }
  }

  keySummary(): KeySummary[] {
    const out: KeySummary[] = [];
    for (let m = 52; m <= 86; m++) {
      const { partial, lower, valves } = trumpetFingering(m);
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: L_OPEN * Math.pow(2, lower / 12), hasDamper: false, preparation: `valves ${valves}, partial ${partial}` });
    }
    return out;
  }

  getVisual(points = 160): object {
    // the standing pressure wave along the bore (lips 0 → bell 1): forward + returning wave
    const shape = new Float32Array(points);
    const D = this.D;
    const half = D / 2;
    const w = this.frame - 1;
    for (let p = 0; p < points; p++) {
      const d = (p / (points - 1)) * half;
      shape[p] = this.bore[(w - Math.round(d)) & (BUF - 1)] + this.bore[(w - Math.round(D - d)) & (BUF - 1)];
    }
    const len = Math.min(TRACE, Math.max(64, Math.round((4 * this.fs) / et(this.note))));
    const tl = new Float32Array(len);
    const tp = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const j = (this.trI - len + i + TRACE) & (TRACE - 1);
      tl[i] = this.trLip[j];
      tp[i] = this.trP[j];
    }
    // bore resonances (Goertzel over the last 4096 samples)
    for (let k = 0; k < 16; k++) {
      const wk = (2 * Math.PI * this.modeFreqs[k]) / this.fs;
      if (wk >= Math.PI) {
        this.modeAmps[k] = 0;
        continue;
      }
      const c = 2 * Math.cos(wk);
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < 4096; i++) {
        const s0 = this.hist[(this.histI + i) & 4095] + c * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      this.modeAmps[k] = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / 2048;
    }
    const { partial, lower, valves } = trumpetFingering(this.note);
    const excite: ExciteTrace = {
      title: 'Lips',
      unit: '',
      rate: this.fs,
      trace: tl,
      trace2: tp,
      trace2Label: 'pressure in the mouthpiece',
      caption: 'Opening of the lips (top) as they buzz, driven by the pressure in the mouthpiece (bottom).',
      meta: `valves ${valves} · partial ${partial}`,
    };
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: 0,
      focus: {
        midi: this.note,
        nStrings: 1,
        shapes: [shape],
        hammerAt: 0.01,
        prepAt: -1,
        lengthM: L_OPEN * Math.pow(2, lower / 12),
        f1: et(this.note),
        B: 0,
        damper: 0,
      },
      strike: null,
      excite,
      modes: this.modeAmps.slice(),
      sustain: this.sustain,
      soft: this.soft,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}
