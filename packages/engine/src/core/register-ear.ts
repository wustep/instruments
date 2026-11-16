// The player's ear for the register: a double reed's note held on the wrong regime is taken back.
//
// A conical bore's resonances are harmonic (oboe.ts, bassoon.ts: the "cylindrical saxophone"), so a note's
// octave (and its twelfth, and stranger regimes) is a stable oscillation of the same tube; at a soft dynamic
// above all the reed sits near more than one threshold and how the note began decides which it keeps.
// Joined, slurred or after a short rest, the oboe's and the bassoon's notes sat on another regime, some for
// the whole of a held note (scripts/winds-legato.ts, notes held 1.5 s from a neighbour at velocity 40–90:
// the oboe 55–63 of 448 of each sounding another register for more than 10 ms, the bassoon 21–70); the
// composers of the pieces written here kept the oboe above C♯5 and the bassoon off G3–A3 for it. A player
// hears it and puts it right with the lips and the voicing, in a few tens of milliseconds (a crack, then the
// note): what is done here. The reed's pressure is heard over 15 ms, as the instrument asks:
// - 'fundamental' (the oboe): the note's own frequency in it (a complex demodulator) against its whole level,
//   which a note on its octave or its twelfth has none of, and its likeness to itself one period before,
//   which a regime off the note's harmonics has not;
// - 'octave' (the bassoon): the pressure less itself half a period before, against its level; a note on its
//   octave has the period twice over, so the difference holds none of it (a low bassoon note's fundamental is
//   as weak on its own register as on another: heard for its fundamental, correct soft low notes were taken
//   for wrong ones).
// When that holds for `wait` s, the note sounding (over `floor`: a soft note's murmur before it speaks is no
// regime at all), its level no longer rising (a note's attack passes through other regimes and a soft low
// one swells in over 0.2–0.3 s) and the reed free (no tongue on it, its key and breath still on), the bore's
// last round trip down the long branch is written again as one period of the note at the oscillation's own
// amplitude (as the tongue's release would start it), at most `most` times a note, `rest` s apart. A note on
// its own register is never touched. It is the player's: at `human` 0 (the model fitted and judged) nothing is
// heard and the engine is bit for bit as before.

export const EAR = {
  /** the averages' time constant, s */
  tau: 0.015,
  /** the fundamental's share of the level (√2·its demodulated amplitude over the RMS: 1 for a sine at the
   *  note) under which the note is not on its own register */
  share: 0.15,
  /** the pressure's likeness to itself a period before (1: the same) under which it is not the note */
  like: 0.7,
  /** 'octave': the odd harmonics' share (the pressure less itself half a period before, its mean square
   *  over four times the pressure's: 1 for a sine at the note, 0 for a wave of half its period) under which
   *  the note is on its octave */
  octave: 0.1,
  /** a note's own attack is let be (its first moments pass through other regimes): heard from `settle` s,
   *  and only once its level has stopped rising (its mean square over 15 ms within `steady` of that over
   *  `slow` s: a soft low note swells in over 0.2–0.3 s, irregular until it is there) */
  settle: 0.06,
  steady: 1.3,
  slow: 0.06,
  /** how long it must be so, s, and the reed sounding at least `floor` (units of its closing pressure; a
   *  sounding soft note's is about 1: under it the note has not spoken yet, its murmur no regime at all) */
  wait: 0.04,
  floor: 0.15,
  /** the fundamental given back, of the oscillation's amplitude (twice it set some soft notes on a louder
   *  branch of their own regime, 3–4 dB over); the next not before `rest` s; at most `most` */
  kick: 1,
  rest: 0.06,
  most: 4,
} as const;

/** a period's history: enough for the lowest note asked for (s) */
const PERIOD_MAX = 0.02;

export class RegisterEar {
  private fs: number;
  private under: number;
  /** the demodulator's phasor (turned one sample at a time) and its step */
  private cr = 1;
  private ci = 0;
  private wr = 1;
  private wi = 0;
  private dr = 0;
  private di = 0;
  private ms = 0;
  private msSlow = 0;
  private kSlow: number;
  /** a period's history, and the averages of the pressure with it and of it squared */
  private buf: Float64Array;
  private mask: number;
  private i = 0;
  private T = 1;
  private pq = 0;
  private qq = 0;
  private k: number;
  private off = 0;
  private hold = 0;
  private count = 0;
  private n = 0;
  /** samples since the note began */
  private age = 0;
  /** the nudges given, all told (tools) */
  kicks = 0;

  /** what is listened for: 'fundamental' (its share and the period's likeness, under `under` and EAR.like),
   *  or 'octave' (the odd harmonics' share, under `under`: a wave of half the note's period) */
  private by: 'fundamental' | 'octave';
  /** half a period back, and the average of the difference squared */
  private half = 1;
  private dd = 0;

  constructor(fs: number, by: 'fundamental' | 'octave' = 'fundamental', under: number = by === 'octave' ? EAR.octave : EAR.share) {
    this.fs = fs;
    this.by = by;
    this.under = under;
    this.k = 1 - Math.exp(-1 / (EAR.tau * fs));
    this.kSlow = 1 - Math.exp(-1 / (EAR.slow * fs));
    let size = 1;
    while (size < PERIOD_MAX * fs + 2) size <<= 1;
    this.buf = new Float64Array(size);
    this.mask = size - 1;
  }

  /** a new note (its fundamental, Hz): heard afresh */
  note(f: number): void {
    const w = (2 * Math.PI * f) / this.fs;
    this.wr = Math.cos(w);
    this.wi = Math.sin(w);
    this.cr = 1;
    this.ci = 0;
    this.T = Math.max(1, Math.min(this.mask, Math.round(this.fs / f)));
    this.half = Math.max(1, Math.round(this.fs / (2 * f)));
    this.dr = this.di = this.ms = this.msSlow = this.pq = this.qq = this.dd = 0;
    this.off = this.hold = this.count = this.age = 0;
  }

  /** One sample of the reed's pressure, `free`: the reed sounding with nothing holding it. The amplitude to
   *  give the fundamental back with now, or 0. */
  hear(p: number, free: boolean): number {
    const k = this.k;
    const cr = this.cr * this.wr - this.ci * this.wi;
    const ci = this.ci * this.wr + this.cr * this.wi;
    this.cr = cr;
    this.ci = ci;
    this.dr += (p * cr - this.dr) * k;
    this.di += (p * ci - this.di) * k;
    this.ms += (p * p - this.ms) * k;
    this.msSlow += (p * p - this.msSlow) * this.kSlow;
    const q = this.buf[(this.i - this.T) & this.mask];
    const d = p - this.buf[(this.i - this.half) & this.mask];
    this.dd += (d * d - this.dd) * k;
    this.buf[this.i & this.mask] = p;
    this.i++;
    this.pq += (p * q - this.pq) * k;
    this.qq += (q * q - this.qq) * k;
    if (this.hold > 0) this.hold--;
    this.age++;
    if (++this.n < 32) return 0;
    this.n = 0;
    // (the phasor back on the unit circle)
    const g = 1 / Math.hypot(this.cr, this.ci);
    this.cr *= g;
    this.ci *= g;
    if (this.hold > 0 || this.count >= EAR.most) return 0;
    const rms = Math.sqrt(this.ms);
    const own =
      this.by === 'octave' ? this.dd >= this.under * 4 * this.ms : Math.SQRT2 * Math.hypot(this.dr, this.di) >= this.under * rms && 2 * this.pq >= EAR.like * (this.ms + this.qq);
    if (!free || this.age < EAR.settle * this.fs || this.ms > EAR.steady * this.msSlow || rms < EAR.floor || own) {
      this.off = 0;
      return 0;
    }
    this.off += 32;
    if (this.off < EAR.wait * this.fs) return 0;
    this.off = 0;
    this.hold = Math.round(EAR.rest * this.fs);
    this.count++;
    this.kicks++;
    return EAR.kick * Math.SQRT2 * rms;
  }
}
