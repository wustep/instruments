// One player, one note at a time: how a wind or brass instrument takes the notes it is sent. Shared by
// the flute, the oboe, the clarinet, the bassoon, the horn, the trumpet and the trombone.
//
// The notes of one instant are taken together (MonoKeys.settle, once the core has read every event due at
// its frame), so their order in a file does not matter:
//   · a note begun while the last is still held is slurred to (the fingers move, the breath goes on);
//   · a note begun where the last one ends (the same instant, either order), a pitch struck again while
//     it is held, and a note begun while the breath is still on after a key let go, are tongued again:
//     the breath goes on and the tongue interrupts it (Tongue: a stroke), so a repeated note is a new note;
//   · the end of a note that is no longer the one playing changes nothing; when the note playing is let go
//     and others are still held, the player goes back to the last of them (slurred);
//   · notes begun together are a chord asked of one player: the highest is played;
//   · a note begun and ended at one instant is played its shortest (a tap);
//   · nothing is counted from one instant to the next: a pitch is down or it is not, and its end lets it
//     go however often it was struck (a key held by two hands at once must never hang; a file's notes
//     are paired by whoever reads the file, apps/web/src/file-keys.ts);
//   · no tongue is faster than FASTEST: a different note sooner than that after the last stroke is slurred
//     (a grace note, a trill).
//
// A file or a piece playing says what is to come (`foresee`, as it tells the bows: bowed.ts): then a note's
// length is known when it begins (a short note is tongued to speak within a share of its length, where a
// note of unknown length, played by hand, gets the long tone's attack the recordings were fitted on), and
// the tongue's stroke before a note joined to the last is made ahead of it, so the note speaks on time and
// the one before is that much shorter, as a player's is. And a rest shorter than REST is no breath let go:
// the tongue stops the note where it ends and stays until the next begins (a staccato: such notes are
// ended by the tongue, not by letting the pressure fall, Li et al. 2016), so that note speaks at once.
// Nothing foreseen: nothing here is planned, and a key let go lets the breath go.
//
// Sources. Li, Almeida, Smith & Wolfe 2016, "How clarinettists articulate: the effect of blowing pressure
// and tonguing on initial and final transients", JASA 139, 825–838: a note stopped by the tongue on the
// reed decays at about the rate of the bore's own resonances, some 400 dB/s; a normal attack's fundamental
// grows about 1000 dB/s, an accent's 1300. Tongue–reed contact in legato, portato and staccato playing was
// measured by Hofmann & Goebl 2014, "Production and perception of legato, portato, and staccato
// articulation in saxophone playing", Front. Psychol. 5:690. The contact times here are this model's own:
// set so that a repeated note falls 6–10 dB between its strokes in the middle of each instrument and a
// note joined to another 2–6 dB (scripts/winds-midi-bench.ts measures them). FASTEST is the usual limit of
// single tonguing, about ten notes a second (the trumpet's MIN_BLOW, brass.ts, says the same).

/** the fastest the tongue repeats (s): a different note sooner than this after the last stroke is slurred */
export const FASTEST = 0.085;
/** a note is the one foreseen if it begins within this of it (s) */
export const FORESEE_TOL = 0.012;
/** how far ahead a tongue's stroke is ever begun (s): the horizon of MonoKeys.coming */
export const STROKE_AHEAD = 0.08;

/** `upcoming`: a note foreseen to begin this long (s) or more before the last one's end will be slurred to
 *  (clear of a sample's rounding where one ends as the next begins) */
export const UP_SLUR = 0.001;

/** a rest up to this long (s) before a foreseen note is held by the tongue, the breath kept */
export const REST = 0.12;

export interface MonoAct {
  /** tongue: from silence, or after the breath was let go. slur: the fingers only. retongue: the breath
   *  goes on, the tongue interrupts it. release: the breath is let go. stop: the note ends but the next is
   *  so near that the breath stays, and the tongue stops the note until it begins (`len` s from now). */
  kind: 'tongue' | 'slur' | 'retongue' | 'release' | 'stop';
  /** the note (as sent: the core keeps it in its range); for a stop, the note that is awaited */
  midi: number;
  /** its velocity; 0: as the breath is (the player goes back to a note still held) */
  velocity: number;
  /** begun and ended at one instant: it sounds its shortest (the core's minimum breath), then is let go */
  tap: boolean;
  /** how long the note will last, s (Infinity: not known, a note played by hand); for a stop, how long
   *  until the next note */
  len: number;
  /** the tongue's stroke for this note was begun ahead of it (MonoKeys.coming): it only has to let go */
  struck: boolean;
}

/** the tongue's stroke on a sounding note (s): it closes in CLOSE; from its first touch until it lets go is
 *  REPEAT where the note is struck again (the stop is all that says so), MOVE where the fingers move too
 *  (a lighter stroke: the legato tongue) */
export const LICK_CLOSE = 0.002;
export const LICK_REPEAT = 0.026;
export const LICK_MOVE = 0.014;
/** a stroke waits this much longer than its note is due (s; more than FORESEE_TOL) before it lets go by itself */
const LATE = 0.02;
/** a note known to last `len` s speaks within a share of it: a rise's time constant (the breath, 95 % in
 *  three of them) is at most RISE_SHARE of the note, and never under RISE_FLOOR (a normal tongued attack
 *  grows about 1000 dB/s, Li et al. 2016). A note of unknown length keeps the rise it has. */
export const RISE_SHARE = 1 / 12;
export const RISE_FLOOR = 0.008;
/** how much of a quick attack a note known to last `len` s gets: all of it up to QUICK_FULL, none from
 *  QUICK_NONE (and none where the length is not known): a long note is begun as the long tones were */
export const QUICK_FULL = 0.3;
export const QUICK_NONE = 1.2;
export const quickness = (len: number): number => (len < Infinity ? Math.min(1, Math.max(0, (QUICK_NONE - len) / (QUICK_NONE - QUICK_FULL))) : 0);
export const quickRise = (tau: number, len: number, share = RISE_SHARE, floor = RISE_FLOOR): number => (len < Infinity ? Math.min(tau, Math.max(floor, share * len)) : tau);

const CAP = 16;
const BATCH = 64;
const AHEAD = 512;

export class MonoKeys {
  /** the pitches down, in the order they were pressed (those pressed together: low to high), their velocities */
  private dn = new Int16Array(CAP);
  private dv = new Float64Array(CAP);
  private n = 0;
  /** this instant's note events: pitch, and velocity (0: an end) */
  private bm = new Int16Array(BATCH);
  private bv = new Float64Array(BATCH);
  private bn = 0;
  private poked = false;
  /** the note the breath is on (the last one played), −1 before any */
  note = -1;
  /** the frame of the last tongue stroke */
  private lastTongue = -1e12;
  /** what was foreseen: when each note begins and ends (frames), its pitch, whether it has begun */
  private aOn = new Float64Array(AHEAD);
  private aOff = new Float64Array(AHEAD);
  private aMidi = new Int16Array(AHEAD);
  private aHit = new Uint8Array(AHEAD);
  private an = 0;
  /** where the note playing was foreseen to end (frame; −1: not foreseen) */
  private curOff = -1;
  /** the frame of the note a stroke was begun ahead for (−1: none) */
  private strokeFor = -1;
  /** the note `coming` last found strikes the pitch that is playing again; its pitch */
  comingSame = false;
  comingMidi = -1;
  /** the frame of a foreseen note the breath is kept for over a rest (−1: none), and whether the tongue
   *  holds the note stopped meanwhile */
  private waitFor = -1;
  private stopped = false;
  /** the note a rest was held for never came: the core lets the breath go (and clears this) */
  overdue = false;
  private act: MonoAct = { kind: 'release', midi: -1, velocity: 0, tap: false, len: Infinity, struck: false };
  private top = new Int16Array(BATCH);
  private topV = new Float64Array(BATCH);

  constructor(private fs: number) {}

  /** a note begins (velocity > 0: the caller sends an end otherwise) or ends, at this instant */
  on(midi: number, velocity: number): void {
    if (this.bn >= BATCH) return;
    this.bm[this.bn] = midi;
    this.bv[this.bn++] = velocity;
  }
  off(midi: number): void {
    if (this.bn >= BATCH) return;
    this.bm[this.bn] = midi;
    this.bv[this.bn++] = 0;
  }
  /** something else changed that may let the breath go (the sustain pedal) */
  poke(): void {
    this.poked = true;
  }
  /** every key up, nothing pending (allNotesOff, allSoundOff) */
  clear(): void {
    this.n = 0;
    this.bn = 0;
    this.poked = false;
    this.curOff = -1;
    this.strokeFor = -1;
    this.waitFor = -1;
    this.stopped = false;
    this.overdue = false;
  }
  /** the tongue holds the last note stopped until a foreseen one begins: nothing sounds */
  get silent(): boolean {
    return this.stopped;
  }
  /** is any key down? */
  get any(): boolean {
    return this.n > 0;
  }
  private isDown(m: number): boolean {
    for (let i = 0; i < this.n; i++) if (this.dn[i] === m) return true;
    return false;
  }
  private lift(m: number): void {
    let w = 0;
    for (let i = 0; i < this.n; i++)
      if (this.dn[i] !== m) {
        this.dn[w] = this.dn[i];
        this.dv[w++] = this.dv[i];
      }
    this.n = w;
  }
  private press(m: number, v: number): void {
    if (this.n >= CAP) {
      // (more keys than fingers: the oldest goes)
      for (let i = 1; i < this.n; i++) {
        this.dn[i - 1] = this.dn[i];
        this.dv[i - 1] = this.dv[i];
      }
      this.n--;
    }
    this.dn[this.n] = m;
    this.dv[this.n++] = v;
  }

  /**
   * What the player does with this instant's events (null: nothing). `blowing`: the breath is on (a note
   * is sounding, or the shortest breath of a key just let go); `sustained`: the pedal holds the breath.
   */
  settle(frame: number, blowing: boolean, sustained: boolean): MonoAct | null {
    if (!this.bn && !this.poked) return null;
    this.poked = false;
    const prev = this.note;
    const prevHeld = prev >= 0 && this.isDown(prev);
    // each pitch of the instant: begun how often, ended how often; down after it if it was down or begun
    // more often than it ended. A pitch begun is struck, whatever the order.
    let struck = 0;
    let stay = 0;
    let prevLet = false;
    for (let i = 0; i < this.bn; i++) {
      const m = this.bm[i];
      let seen = false;
      for (let j = 0; j < i; j++) if (this.bm[j] === m) seen = true;
      if (seen) continue;
      let nOn = 0;
      let nOff = 0;
      let vel = 0;
      for (let j = i; j < this.bn; j++)
        if (this.bm[j] === m) {
          if (this.bv[j]) {
            nOn++;
            vel = this.bv[j];
          } else nOff++;
        }
      const after = (this.isDown(m) ? 1 : 0) + nOn - nOff > 0;
      if (m === prev && nOff > 0) prevLet = true;
      this.lift(m);
      if (!nOn) continue;
      // the struck pitches, those that stay down first (ascending within each kind: insertion)
      let at = after ? stay : struck;
      const lo = after ? 0 : stay;
      while (at > lo && this.top[at - 1] > m) at--;
      for (let k = struck; k > at; k--) {
        this.top[k] = this.top[k - 1];
        this.topV[k] = this.topV[k - 1];
      }
      this.top[at] = m;
      this.topV[at] = vel;
      struck++;
      if (after) stay++;
    }
    this.bn = 0;
    for (let k = 0; k < stay; k++) this.press(this.top[k], this.topV[k]);
    const a = this.act;
    a.tap = false;
    a.len = Infinity;
    a.struck = false;
    if (struck) {
      // the highest of the notes begun together that stays down; none stays: the highest, as a tap
      const k = stay ? stay - 1 : struck - 1;
      a.midi = this.top[k];
      a.velocity = this.topV[k];
      a.tap = !stay;
      if (!blowing) a.kind = 'tongue';
      // the last note still held, and not let go and struck again at this instant: a slur
      else if (prevHeld && !prevLet && a.midi !== prev && this.isDown(prev)) a.kind = 'slur';
      else if (a.midi !== prev && frame - this.lastTongue < FASTEST * this.fs) a.kind = 'slur';
      else a.kind = 'retongue';
      if (a.kind !== 'slur') this.lastTongue = frame;
      this.note = a.midi;
      const f = this.match(a.midi, frame);
      this.curOff = f < 0 ? -1 : this.aOff[f];
      if (f >= 0) a.len = (this.aOff[f] - this.aOn[f]) / this.fs;
      a.struck = this.strokeFor >= 0 && Math.abs(this.strokeFor - frame) <= FORESEE_TOL * this.fs && a.kind === 'retongue';
      this.strokeFor = -1;
      this.waitFor = -1;
      this.stopped = false;
      return a;
    }
    if (!this.n) {
      if (!blowing || sustained) return null;
      // a foreseen note begins within REST: the breath is kept
      const tol = FORESEE_TOL * this.fs;
      for (let i = 0; i < this.an; i++) {
        if (this.aHit[i] || this.aOn[i] < frame - tol) continue;
        const on = this.aOn[i];
        if (on - frame > REST * this.fs) break;
        this.waitFor = on;
        this.curOff = -1;
        // (a different note too soon after the last stroke for the tongue: this one sounds on into it)
        if (this.aMidi[i] !== prev && on - this.lastTongue < FASTEST * this.fs) return null;
        a.kind = 'stop';
        a.midi = this.aMidi[i];
        a.velocity = 0;
        a.len = Math.max(0, on - frame) / this.fs;
        a.struck = this.strokeFor >= 0;
        this.strokeFor = on;
        this.stopped = true;
        return a;
      }
      a.kind = 'release';
      a.midi = prev;
      a.velocity = 0;
      this.curOff = -1;
      return a;
    }
    // the note playing was let go and others are still held: back to the last of them
    if (blowing && prev >= 0 && !this.isDown(prev)) {
      a.kind = 'slur';
      a.midi = this.dn[this.n - 1];
      a.velocity = 0;
      this.note = a.midi;
      this.curOff = -1;
      return a;
    }
    return null;
  }

  // ------------------------------------------------------------- what is to come
  /** A note to come: it will begin at `frame` and last `dur` seconds. The note itself still arrives. */
  foresee(frame: number, midi: number, velocity: number, dur: number): void {
    if (!(dur > 0) || !(velocity > 0)) return;
    // (a stuck sender: the oldest go)
    if (this.an >= AHEAD) this.drop(0);
    let i = this.an;
    while (i > 0 && this.aOn[i - 1] > frame) {
      this.aOn[i] = this.aOn[i - 1];
      this.aOff[i] = this.aOff[i - 1];
      this.aMidi[i] = this.aMidi[i - 1];
      this.aHit[i] = this.aHit[i - 1];
      i--;
    }
    this.aOn[i] = frame;
    this.aOff[i] = frame + Math.max(1, Math.round(dur * this.fs));
    this.aMidi[i] = midi;
    this.aHit[i] = 0;
    this.an++;
  }
  /** the frame the next note foreseen begins at, after `frame` (−1: none is) */
  nextAfter(frame: number): number {
    for (let i = 0; i < this.an; i++) if (this.aOn[i] > frame) return this.aOn[i];
    return -1;
  }
  /** What was foreseen is forgotten (the file paused or stopped). True if the breath was being kept over
   *  a rest for a note that will now not come: the core lets it go. */
  forget(): boolean {
    const waiting = this.waitFor >= 0;
    this.an = 0;
    this.curOff = -1;
    this.strokeFor = -1;
    this.waitFor = -1;
    this.stopped = false;
    return waiting;
  }
  private drop(i: number): void {
    for (let k = i + 1; k < this.an; k++) {
      this.aOn[k - 1] = this.aOn[k];
      this.aOff[k - 1] = this.aOff[k];
      this.aMidi[k - 1] = this.aMidi[k];
      this.aHit[k - 1] = this.aHit[k];
    }
    this.an--;
  }
  /** the foreseen note that begins now on this pitch (the nearest within FORESEE_TOL), marked begun; those
   *  that are over, or never came, are dropped */
  private match(midi: number, frame: number): number {
    const tol = FORESEE_TOL * this.fs;
    let w = 0;
    let best = -1;
    for (let i = 0; i < this.an; i++) {
      if (this.aHit[i] ? this.aOff[i] <= frame : this.aOn[i] < frame - tol) continue;
      if (!this.aHit[i] && this.aMidi[i] === midi && Math.abs(this.aOn[i] - frame) <= tol && (best < 0 || Math.abs(this.aOn[i] - frame) < Math.abs(this.aOn[best] - frame))) best = w;
      if (w !== i) {
        this.aOn[w] = this.aOn[i];
        this.aOff[w] = this.aOff[i];
        this.aMidi[w] = this.aMidi[i];
        this.aHit[w] = this.aHit[i];
      }
      w++;
    }
    this.an = w;
    if (best >= 0) this.aHit[best] = 1;
    return best;
  }
  /**
   * The frame of the next note that will be tongued over the breath (it begins where the note playing was
   * foreseen to end, or strikes its pitch again), if it begins within STROKE_AHEAD of `frame`; −1: none
   * (nothing foreseen, a rest first, a slur, or a note too soon after the last stroke to be tongued).
   */
  coming(frame: number, blowing: boolean): number {
    if (!this.an || !blowing || this.curOff < 0 || this.strokeFor >= 0) return -1;
    const tol = FORESEE_TOL * this.fs;
    const far = frame + STROKE_AHEAD * this.fs;
    for (let i = 0; i < this.an; i++) {
      if (this.aHit[i]) continue;
      const on = this.aOn[i];
      if (on <= frame) continue;
      if (on > far) break;
      // (the first note to come decides. One that begins while the note playing goes on is a slur, unless
      // it strikes its pitch again; one after a rest longer than the stroke waits for the note's end, where
      // the tongue stops it: settle)
      const same = this.aMidi[i] === this.note;
      if (this.curOff > on + tol ? !same : on - this.curOff > (same ? LICK_REPEAT : LICK_MOVE) * this.fs) return -1;
      if (!same && on - this.lastTongue < FASTEST * this.fs) return -1;
      this.comingSame = same;
      this.comingMidi = this.aMidi[i];
      return on;
    }
    return -1;
  }
  /** the pitch of the note `upcoming` last found, and whether it will be slurred to (it begins while the
   *  note playing is foreseen to go on, by UP_SLUR or more, on another pitch) */
  upMidi = -1;
  upSlur = false;
  /**
   * The next note foreseen and not yet begun, if it begins within `within` s after `frame`: its frame (−1:
   * none) and, in `upMidi`, its pitch (of notes begun together the highest, the one played). However it will
   * be joined (tongued, slurred: `upSlur`, after a rest): for a core that readies more than its tongue for a
   * note to come (the trombone's slide). Asked only by such a core; it changes nothing of what `settle`,
   * `coming` and `plan` do.
   */
  upcoming(frame: number, within: number): number {
    const far = frame + within * this.fs;
    for (let i = 0; i < this.an; i++) {
      if (this.aHit[i]) continue;
      const on = this.aOn[i];
      if (on <= frame) continue;
      if (on > far) break;
      let m = this.aMidi[i];
      for (let j = i + 1; j < this.an && this.aOn[j] === on; j++) if (!this.aHit[j] && this.aMidi[j] > m) m = this.aMidi[j];
      this.upMidi = m;
      this.upSlur = m !== this.note && this.curOff > on + UP_SLUR * this.fs;
      return on;
    }
    return -1;
  }
  /** the frame of the note whose stroke begins with the block just planned (`plan`), −1: none */
  strokeNow = -1;
  /**
   * Before a block of up to `n` samples from `frame`: the tongue's stroke for a foreseen note joined to the
   * one sounding is begun its contact time ahead of the note, so that it lets go as the note begins. Returns
   * the block's length (cut where the stroke is to begin); `strokeNow` is the note's frame when the stroke
   * begins with this block (the core then makes it: Tongue.ahead), else −1.
   */
  plan(frame: number, n: number, blowing: boolean): number {
    this.strokeNow = -1;
    if (this.waitFor >= 0 && frame > this.waitFor + FORESEE_TOL * this.fs) {
      // (the note a rest was held for never came)
      this.waitFor = -1;
      this.stopped = false;
      this.strokeFor = -1;
      this.overdue = true;
      return n;
    }
    if (this.strokeFor >= 0) {
      // (a stroke made for a note that never came is forgotten)
      if (frame > this.strokeFor + FORESEE_TOL * this.fs) this.strokeFor = -1;
      return n;
    }
    const at = this.coming(frame, blowing);
    if (at < 0) return n;
    const start = at - Math.round((this.comingSame ? LICK_REPEAT : LICK_MOVE) * this.fs);
    if (start > frame) return Math.min(n, start - frame);
    this.strokeFor = at;
    this.strokeNow = at;
    return n;
  }
}

/**
 * The tongue's stroke on a sounding note: it closes on the reed (or across the air) over `close` samples,
 * stays for `hold`, and lets go over `open` (half-cosines). `next()` is the opening sample by sample: 1 off,
 * 1 − depth on.
 */
export class Tongue {
  private phase = 0;
  private i = 0;
  private cN = 1;
  private hN = 0;
  private oN = 1;
  private depth = 1;
  private from = 1;
  /** the opening as it last was */
  now = 1;
  /** in a stroke (until it has let go again) */
  get busy(): boolean {
    return this.phase !== 0;
  }
  /** fully down (or letting go again), or away: not on its way down */
  get landed(): boolean {
    return this.phase !== 1;
  }
  /** on the reed: closing or held (it has not begun to let go) */
  get down(): boolean {
    return this.phase === 1 || this.phase === 2;
  }
  stroke(close: number, hold: number, open: number, depth = 1): void {
    this.cN = Math.max(1, Math.round(close));
    this.hN = Math.max(0, Math.round(hold));
    this.oN = Math.max(1, Math.round(open));
    this.depth = depth;
    this.from = this.now;
    this.phase = 1;
    this.i = 0;
  }
  /** let go now, over `open` samples (the note it was made for has come) */
  release(open: number): void {
    if (this.phase === 0) return;
    this.oN = Math.max(1, Math.round(open));
    this.from = this.now;
    this.phase = 3;
    this.i = 0;
  }
  reset(): void {
    this.phase = 0;
    this.now = 1;
  }
  /**
   * The stroke for a note tongued over the breath (MonoAct 'retongue'), at the note: made now (`same`: its
   * pitch is struck again, the longer contact), or, where it was made ahead of the note (`struck`), let go
   * now. `open`: samples it takes to let go. Returns how many samples from now it lets go.
   */
  retongue(struck: boolean, fs: number, same: boolean, open: number): number {
    if (struck && this.busy) {
      this.release(open);
      return 0;
    }
    const contact = Math.round((same ? LICK_REPEAT : LICK_MOVE) * fs);
    this.stroke(LICK_CLOSE * fs, contact - LICK_CLOSE * fs, open);
    return contact;
  }
  /** the stroke made ahead of a note `lead` samples away: held until the note comes (MonoKeys.plan), and
   *  a little longer if it is late; then it lets go by itself */
  ahead(fs: number, lead: number, open: number): void {
    this.stroke(LICK_CLOSE * fs, lead - LICK_CLOSE * fs + LATE * fs, open);
  }
  /** a note stopped until the next begins, `wait` samples away (MonoAct 'stop'): the tongue comes down now,
   *  unless a stroke made ahead already has, and stays */
  stop(fs: number, wait: number, open: number): void {
    if (this.down) return;
    this.stroke(LICK_CLOSE * fs, wait - LICK_CLOSE * fs + LATE * fs, open);
  }
  next(): number {
    const lo = 1 - this.depth;
    switch (this.phase) {
      case 1:
        this.i++;
        this.now = lo + (this.from - lo) * (0.5 + 0.5 * Math.cos((Math.PI * this.i) / this.cN));
        if (this.i >= this.cN) {
          this.phase = this.hN > 0 ? 2 : 3;
          this.i = 0;
          this.from = this.now;
        }
        break;
      case 2:
        this.now = lo;
        if (++this.i >= this.hN) {
          this.phase = 3;
          this.i = 0;
          this.from = lo;
        }
        break;
      case 3:
        this.i++;
        this.now = 1 - (1 - this.from) * (0.5 + 0.5 * Math.cos((Math.PI * this.i) / this.oN));
        if (this.i >= this.oN) {
          this.phase = 0;
          this.now = 1;
        }
        break;
      default:
        this.now = 1;
    }
    return this.now;
  }
}
