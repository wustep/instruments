// Which instrument plays which line of a MIDI file. Pure (no DOM, no audio), so it is tested fast.
//
// A voice is one of the eight instruments on the stage. Keyboard voices (the grand, the upright) take
// any number of lines on one instrument (two hands, a continuo); every other line gets an instrument
// of its own (violin I and violin II are two violins), until the stage is full, when the busiest
// lines keep theirs and the rest join a like instrument (a section: the bowed strings play double
// stops) or the piano.
//
// Routing is many to many: a line may play on several instruments at once (the tune on a violin and a
// flute, the whole file on two pianos), an instrument may play several lines, and a voice may be on
// the stage more than once (two cellos, two grands), each its own engine. Auto-assignment never
// doubles a line; doubling is done by hand (setRoute, addPart, setPartLines).
//
// Auto-assignment, per line: its name (track or instrument name: "Violin I", "violoncello",
// "Contrabass"), else its General MIDI program, else its range and polyphony. A line that its
// instrument cannot play (chords on a flute) is moved by whole octaves into range, or goes to the
// piano; a line that goes below the cello's C is a bass line (the double bass is a candidate for it). With a lineup chosen by hand, the lines are matched to it by register instead: the highest
// line to the highest instrument, and so on down.

export type Voice = 'grand' | 'upright' | 'violin' | 'viola' | 'cello' | 'bass' | 'flute' | 'oboe' | 'trumpet';
export const VOICES: Voice[] = ['grand', 'upright', 'violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'trumpet'];

export interface VoiceInfo {
  label: string;
  /** the engine's instrument and (pianos) preset */
  instrument: 'piano' | 'violin' | 'viola' | 'cello' | 'bass' | 'flute' | 'oboe' | 'trumpet';
  preset?: 'grand' | 'upright';
  /** playable range (MIDI notes) and where the instrument sings best */
  lo: number;
  hi: number;
  centre: number;
  /** notes it can hold at once: a keyboard any number, a bowed string one per string, a wind one */
  poly: number;
}
// ranges: the engine's (packages/engine/src/core/instrument.ts INSTRUMENT_INFO); centres: the
// middle of each instrument's usual written range (violin G3–A6, viola C3–E6, cello C2–A5, double
// bass E1–G3 sounding, flute C4–C7, oboe B♭3–G6 (in C: written as it sounds), trumpet F#3–D6), where a
// part for it mostly lies
export const VOICE_INFO: Record<Voice, VoiceInfo> = {
  grand: { label: 'grand piano', instrument: 'piano', preset: 'grand', lo: 21, hi: 108, centre: 60, poly: 88 },
  upright: { label: 'upright piano', instrument: 'piano', preset: 'upright', lo: 21, hi: 108, centre: 60, poly: 88 },
  violin: { label: 'violin', instrument: 'violin', lo: 55, hi: 100, centre: 74, poly: 4 },
  viola: { label: 'viola', instrument: 'viola', lo: 48, hi: 88, centre: 63, poly: 4 },
  cello: { label: 'cello', instrument: 'cello', lo: 36, hi: 81, centre: 52, poly: 4 },
  bass: { label: 'double bass', instrument: 'bass', lo: 28, hi: 67, centre: 40, poly: 4 },
  flute: { label: 'flute', instrument: 'flute', lo: 60, hi: 96, centre: 79, poly: 1 },
  oboe: { label: 'oboe', instrument: 'oboe', lo: 58, hi: 93, centre: 74, poly: 1 },
  trumpet: { label: 'trumpet', instrument: 'trumpet', lo: 52, hi: 86, centre: 68, poly: 1 },
};
export const isKeyboard = (v: Voice): boolean => v === 'grand' || v === 'upright';

/** what assignment needs to know of a line (midi-file.ts MidiLine) */
export interface LineInfo {
  name: string;
  instrument: string;
  program: number;
  notes: number;
  lo: number;
  hi: number;
  median: number;
  poly: number;
}

/** one place a line goes: a part (instrument) that plays it and the octaves it is moved by there
 *  (semitones, a multiple of 12) */
export interface Route {
  part: number;
  shift: number;
}
/** an instrument on the stage and the lines it plays (none: it waits, silent) */
export interface Part {
  voice: Voice;
  lines: number[];
}
/** the stage's instruments, in seating order, and every line's routes among them (none: silent) */
export interface Plan {
  parts: Part[];
  lines: Route[][];
}

// ---------------------------------------------------------------- hints
/** an instrument named in the track: Italian, German, French, Spanish and English names, and
 *  abbreviations. The double bass: contrabass, double bass, contrebasse, Kontrabass, contrabbasso,
 *  contrabajo, violone, "Cb.", "Kb.", "D.B.", and a plain "bass"/"basso"/"basse"/"bassi" (a string
 *  orchestra's bass line; a bass guitar's too), the tuba and the contrabassoon (the lowest line);
 *  the cello keeps "Violoncello", a continuo and a bassoon, and a bass clarinet, bass trombone or bass
 *  drum is not a bass. */
export function voiceFromName(s: string): Voice | null {
  const t = s.toLowerCase();
  if (!t.trim()) return null;
  if (/contra-?bassoon|kontrafagott|contrafagotto|contrebasson/.test(t)) return 'bass';
  if (/upright(?! ?bass)|honky/.test(t)) return 'upright';
  if (/cello|violoncell|violincell|\bvc\.?\b|\bvlc\b|continuo|bassoon|fagott/.test(t)) return 'cello';
  if (
    /contra-? ?b?bass|contrebasse|kontrabass|contrabajo|double ?bass|upright ?bass|string ?bass|acoustic ?bass|violone|\bcb\.?(?![a-z])|\bcbs\b|\bkb\.?(?![a-z])|\bd\. ?b\.|\bbass(o|e|i|es)?\b|tuba/.test(t) &&
    !/clarinet|klarinett|clarinette|trombone|posaune|drum/.test(t)
  )
    return 'bass';
  if (/viola|\bvla?\.?\b|bratsche|\balto\b/.test(t) && !/viola da gamba/.test(t)) return 'viola';
  if (/viol|vln|fiddle|geige|violon\b/.test(t)) return 'violin';
  // the oboe: oboe, oboi, hautbois, Hoboe/Oboe, oboe d'amore, "Ob.", and the cor anglais (English horn,
  // corno inglese, Englischhorn: the alto oboe, a fifth lower, moved by octaves into the oboe's range)
  if (/\boboe|\boboi\b|hautbois|hoboe|\bob\.?(?![a-z])|\bobs?\b|cor anglais|english ?horn|corno inglese|englisch ?horn/.test(t)) return 'oboe';
  if (/flute|flauto|fl[oö]te|flûte|piccolo|recorder|\bfl\.?\b|clarinet|klarinette|clarinette|\bcl\.?\b|sax/.test(t)) return 'flute';
  if (/trumpet|tromba|trompete|trompette|cornet|horn|corno|trombone|posaune|brass|\btpt?\.?\b/.test(t)) return 'trumpet';
  if (/piano|klavier|cembalo|harpsichord|clavecin|keyboard|organ|orgel|continuo|clavichord|celesta|harp|guitar|lute/.test(t)) return 'grand';
  return null;
}

/** General MIDI program families (0…127) */
export function voiceFromProgram(p: number): Voice | null {
  if (p < 0) return null;
  if (p <= 31) return 'grand'; // pianos, chromatic percussion, organs, guitars
  if (p <= 39) return 'bass'; // basses: acoustic (32), electric, fretless, slap, synth
  if (p === 40 || p === 44 || p === 45) return 'violin'; // violin, tremolo and pizzicato strings
  if (p === 41) return 'viola';
  if (p === 42) return 'cello';
  if (p === 43) return 'bass'; // contrabass
  if (p === 46) return 'grand'; // harp
  if (p <= 55) return null; // timpani, string and voice ensembles: by range
  if (p <= 63) return 'trumpet'; // brass
  if (p === 68 || p === 69) return 'oboe'; // oboe, English horn
  if (p <= 79) return 'flute'; // reeds and pipes
  return null;
}

// ---------------------------------------------------------------- fitting a line to an instrument
/** octaves to move a line by so most of it lies in the voice's range (ties: the smallest move) */
export function fitShift(l: Pick<LineInfo, 'lo' | 'hi' | 'median'>, v: Voice): number {
  const r = VOICE_INFO[v];
  let best = 0;
  let bestScore = -Infinity;
  for (const k of [0, 12, -12, 24, -24]) {
    const lo = l.lo + k;
    const hi = l.hi + k;
    const inside = Math.max(0, Math.min(hi, r.hi) - Math.max(lo, r.lo)) / Math.max(1, hi - lo);
    const med = l.median + k >= r.lo && l.median + k <= r.hi ? 1 : 0;
    const score = inside + med - Math.abs(k) / 1000;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}
/** a note moved by the line's shift and then, if still out of range, by octaves into it */
export function placeNote(m: number, shift: number, v: Voice): number {
  const r = VOICE_INFO[v];
  let n = m + shift;
  while (n < r.lo) n += 12;
  while (n > r.hi) n -= 12;
  return n;
}
/** how much of a line lies in the voice's range once shifted (0…1) */
const fits = (l: LineInfo, v: Voice): number => {
  const r = VOICE_INFO[v];
  const k = fitShift(l, v);
  const lo = l.lo + k;
  const hi = l.hi + k;
  return hi === lo ? (lo >= r.lo && lo <= r.hi ? 1 : 0) : Math.max(0, Math.min(hi, r.hi) - Math.max(lo, r.lo)) / (hi - lo);
};
/** can the voice hold the line's chords? (a bowed string: double stops; a wind: one note) */
const holds = (l: LineInfo, v: Voice): boolean => l.poly <= (VOICE_INFO[v].poly === 1 ? 1 : VOICE_INFO[v].poly === 4 ? 3 : 88);

/** how much of a line lies in the voice's range as written (0…1) */
const fits0 = (l: LineInfo, v: Voice): number => {
  const r = VOICE_INFO[v];
  return l.hi === l.lo ? (l.lo >= r.lo && l.lo <= r.hi ? 1 : 0) : Math.max(0, Math.min(l.hi, r.hi) - Math.max(l.lo, r.lo)) / (l.hi - l.lo);
};

/** how well a line sits on an instrument: in range (after its best octave move), near the middle of
 *  the instrument's register, and not moved far. A keyboard has every register: neutral. */
function rangeScore(l: LineInfo, v: Voice): number {
  if (isKeyboard(v)) return 1;
  const k = fitShift(l, v);
  return 2 * fits(l, v) - Math.abs(l.median + k - VOICE_INFO[v].centre) / 12 - (2.5 * Math.abs(k)) / 12;
}

/**
 * The voice a line would have on its own (no lineup): each candidate scores its register fit plus
 * what the file says: a track name (written by a person: "Viola") counts most, an instrument name (a
 * notation program's default, often wrong) less, the General MIDI program least; a name counts only
 * when that instrument can play the line as written (a "violin" track going below the G string is
 * not a violin part). The violin, viola and cello are always candidates, the double bass for a line
 * that goes below the cello; the winds and the piano when named, the piano also for chords.
 */
export function guessVoice(l: LineInfo): Voice {
  const hints: [Voice | null, number][] = [
    [voiceFromName(l.name), 3],
    [voiceFromName(l.instrument), 1.5],
    [voiceFromProgram(l.program), 1],
  ];
  const cands = new Map<Voice, number>([
    ['violin', 0],
    ['viola', 0],
    ['cello', 0],
  ]);
  // a line below the cello's C: a bass line, the double bass's
  if (l.lo < VOICE_INFO.cello.lo) cands.set('bass', 0);
  for (const [v, w] of hints) if (v && (isKeyboard(v) || fits0(l, v) >= 0.9)) cands.set(v, (cands.get(v) ?? 0) + w);
  // chords: four notes at once are a keyboard's; three may be a string's triple stop
  if (l.poly >= 3) cands.set('grand', (cands.get('grand') ?? 0) + (l.poly >= 4 ? 2.5 : 0.6));
  let best: Voice = 'grand';
  let bs = -Infinity;
  for (const [v, bonus] of cands) {
    if (!holds(l, v)) continue;
    const sc = rangeScore(l, v) + bonus;
    if (sc > bs) {
      bs = sc;
      best = v;
    }
  }
  return best;
}

// ---------------------------------------------------------------- plans
type Sized = Pick<LineInfo, 'notes' | 'median' | 'poly'>;
const shiftFor = (l: LineInfo, v: Voice) => (isKeyboard(v) ? 0 : fitShift(l, v));

/**
 * The instruments a voice per line puts on the stage: one per keyboard voice (all its lines), one per
 * other line, in the file's order. With more than `cap` instruments the smallest lines join a like
 * bowed instrument (a section, nearest in register) or the piano (made if there is none).
 */
export function partsOf(voices: (Voice | null)[], lines: Sized[], cap: number): Part[] {
  const parts: Part[] = [];
  const kb = new Map<Voice, Part>();
  voices.forEach((v, i) => {
    if (!v) return;
    if (isKeyboard(v)) {
      let p = kb.get(v);
      if (!p) {
        kb.set(v, (p = { voice: v, lines: [] }));
        parts.push(p);
      }
      p.lines.push(i);
    } else parts.push({ voice: v, lines: [i] });
  });
  return capParts(parts, lines, cap);
}

/** fit a set of instruments to the stage (see partsOf); the parts are changed in place */
export function capParts(parts: Part[], lines: Sized[], cap: number): Part[] {
  const size = (p: Part) => p.lines.reduce((s, i) => s + lines[i].notes, 0);
  const med = (p: Part) => lines[p.lines[0]].median;
  const bowed = (p: Part) => !isKeyboard(p.voice) && VOICE_INFO[p.voice].poly > 1;
  const over = () => parts.length > Math.max(1, cap);
  // 1. sections: the smallest bowed instrument joins another of its kind, nearest in register
  while (over()) {
    let k = -1;
    let into = -1;
    for (let i = 0; i < parts.length; i++) {
      if (!bowed(parts[i]) || (k >= 0 && size(parts[i]) >= size(parts[k]))) continue;
      let t = -1;
      for (let j = 0; j < parts.length; j++) if (j !== i && parts[j].voice === parts[i].voice && (t < 0 || Math.abs(med(parts[j]) - med(parts[i])) < Math.abs(med(parts[t]) - med(parts[i])))) t = j;
      if (t >= 0) [k, into] = [i, t];
    }
    if (k < 0) break;
    parts[into].lines.push(...parts[k].lines);
    parts.splice(k, 1);
  }
  // 2. a piano takes the rest, bowed lines before winds, the smallest first; with no piano on the
  //    stage the lowest bowed instrument becomes one (a continuo), else the smallest instrument
  while (over()) {
    let kb = parts.findIndex((q) => isKeyboard(q.voice));
    if (kb < 0) {
      let c = -1;
      for (let i = 0; i < parts.length; i++) if (bowed(parts[i]) && (c < 0 || med(parts[i]) < med(parts[c]))) c = i;
      if (c < 0) for (let i = 0; i < parts.length; i++) if (c < 0 || size(parts[i]) < size(parts[c])) c = i;
      parts[c].voice = 'grand';
      kb = c;
      continue;
    }
    let k = -1;
    const rank = (q: Part) => (bowed(q) ? 0 : 1e9) + size(q);
    for (let i = 0; i < parts.length; i++) if (i !== kb && (k < 0 || rank(parts[i]) < rank(parts[k]))) k = i;
    if (k < 0) break;
    parts[kb].lines.push(...parts[k].lines);
    parts[kb].lines.sort((x, y) => x - y);
    parts.splice(k, 1);
  }
  return parts;
}

/** octave moves kept from a plan (a piece's own correction, `line:voice` → semitones): a line moved
 *  to, or doubled on, an instrument of the same voice keeps them */
export type Shifts = Map<string, number>;
export const shiftKey = (line: number, v: Voice): string => `${line}:${v}`;
export function shiftsOf(plan: Plan): Shifts {
  const out: Shifts = new Map();
  plan.lines.forEach((rs, li) => rs.forEach((r) => plan.parts[r.part] && out.set(shiftKey(li, plan.parts[r.part].voice), r.shift)));
  return out;
}

/** the plan for a set of parts: each line's routes (part index, octave shift on that instrument) */
export function planOf(parts: Part[], lines: LineInfo[], shifts?: Shifts): Plan {
  const out: Route[][] = lines.map(() => []);
  parts.forEach((p, k) => {
    p.lines = [...new Set(p.lines.filter((i) => i >= 0 && i < lines.length))].sort((a, b) => a - b);
    for (const i of p.lines) out[i].push({ part: k, shift: shifts?.get(shiftKey(i, p.voice)) ?? shiftFor(lines[i], p.voice) });
  });
  return { parts, lines: out };
}

/**
 * Auto-assign the lines of a file. With `lineup` (instruments picked by hand) the lines are matched
 * to it by register; without, each line gets its own guess. `cap`: the most instruments on stage.
 */
export function autoPlan(lines: LineInfo[], opts: { cap: number; lineup?: Voice[] }): Plan {
  const lineup = (opts.lineup ?? []).filter((v) => VOICE_INFO[v]).slice(0, Math.max(1, opts.cap));
  if (!lineup.length) {
    // a file that names no instrument anywhere (no names, no programs) and plays chords is a keyboard
    // piece: its single-note lines are a left hand, not a cello
    const named = lines.some((l) => voiceFromName(l.name) ?? voiceFromName(l.instrument) ?? (l.program >= 0 ? true : null));
    if (!named && lines.some((l) => l.poly >= 3)) return planOf(partsOf(lines.map(() => 'grand' as Voice), lines, opts.cap), lines);
    return planOf(partsOf(lines.map(guessVoice), lines, opts.cap), lines);
  }
  return matchLineup(lines, lineup);
}

/** lines onto a hand-picked lineup, by register: each instrument (high to low) leads one line, chosen
 *  in order from the lines (high to low) so the registers match and busy lines lead (a DP over both
 *  orders; with fewer lines than instruments some instruments wait); the other lines join the
 *  instrument nearest their register that holds more than one note */
export function matchLineup(lines: LineInfo[], lineup: Voice[]): Plan {
  const parts: Part[] = lineup.map((v) => ({ voice: v, lines: [] }));
  const ls = lines.map((_, i) => i).sort((a, b) => lines[b].median - lines[a].median || a - b);
  const slots = lineup.map((_, i) => i).sort((a, b) => VOICE_INFO[lineup[b]].centre - VOICE_INFO[lineup[a]].centre || a - b);
  const n = ls.length;
  const m = slots.length;
  const busiest = Math.max(1, ...lines.map((l) => l.notes));
  const cost = (i: number, j: number) => {
    const l = lines[ls[i]];
    const v = lineup[slots[j]];
    return Math.abs(l.median - VOICE_INFO[v].centre) / 12 + (1 - fits(l, v)) * 3 + (holds(l, v) ? 0 : 4) - l.notes / busiest;
  };
  // E[i][j]: the first i lines and the first j instruments; a line may join another instrument only
  // when there are more lines than instruments, an instrument may wait only when there are fewer
  const wait = n < m ? 0 : 1e6;
  const follow = n > m ? 0 : 1e6;
  const E: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
  const how: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  E[0][0] = 0;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue;
      let best = Infinity;
      let h = 0;
      if (i > 0 && E[i - 1][j] + follow < best) [best, h] = [E[i - 1][j] + follow, 1];
      if (j > 0 && E[i][j - 1] + wait < best) [best, h] = [E[i][j - 1] + wait, 2];
      if (i > 0 && j > 0 && E[i - 1][j - 1] + cost(i - 1, j - 1) < best) [best, h] = [E[i - 1][j - 1] + cost(i - 1, j - 1), 3];
      E[i][j] = best;
      how[i][j] = h;
    }
  const led = new Set<number>();
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const h = how[i][j];
    if (h === 3) {
      parts[slots[j - 1]].lines.push(ls[i - 1]);
      led.add(ls[i - 1]);
      i--;
      j--;
    } else if (h === 2) j--;
    else i--;
  }
  for (let li = 0; li < lines.length; li++) {
    if (led.has(li)) continue;
    const l = lines[li];
    let best = 0;
    const key = (k: number) => (VOICE_INFO[parts[k].voice].poly > 1 ? 0 : 100) + Math.abs(l.median - VOICE_INFO[parts[k].voice].centre);
    for (let k = 1; k < parts.length; k++) if (key(k) < key(best)) best = k;
    parts[best].lines.push(li);
  }
  for (const p of parts) p.lines.sort((a, b) => a - b);
  return planOf(parts, lines);
}

/** a plan of instruments without a file (live play) */
export const lineupPlan = (lineup: Voice[]): Plan => ({ parts: lineup.map((v) => ({ voice: v, lines: [] })), lines: [] });

/** the lineup a plan puts on the stage */
export const lineupOf = (plan: Plan): Voice[] => plan.parts.map((p) => p.voice);

/** the voices a line plays on (none: silent) */
export const voicesOfLine = (plan: Plan, li: number): Voice[] => (plan.lines[li] ?? []).map((r) => plan.parts[r.part].voice);

/** a copy of a plan's parts (to change) */
const partsCopy = (plan: Plan): Part[] => plan.parts.map((p) => ({ voice: p.voice, lines: [...p.lines] }));

/**
 * Move one line to another instrument, and only that one (null: mute it). A keyboard voice joins its
 * piano if there is one; another voice takes over the line's own instrument when the line is its only
 * one, else gets an instrument of its own, or (the stage full) joins one of that voice. Instruments
 * left with no line leave the stage. Returns null when the stage has no room for it.
 */
export function reassign(plan: Plan, lines: LineInfo[], li: number, voice: Voice | null, cap: number): Plan | null {
  const parts: Part[] = plan.parts.map((p) => ({ voice: p.voice, lines: p.lines.filter((i) => i !== li) }));
  const was = (plan.lines[li] ?? []).map((r) => r.part);
  if (voice) {
    // the line's own instrument: one that played it and nothing else
    const alone = was.find((k) => plan.parts[k].lines.length === 1);
    const same = parts.findIndex((p) => p.voice === voice && (isKeyboard(voice) || p.lines.length === 0));
    if (isKeyboard(voice) && same >= 0) parts[same].lines.push(li);
    else if (alone !== undefined) {
      parts[alone].voice = voice;
      parts[alone].lines.push(li);
    } else if (same >= 0) parts[same].lines.push(li);
    else if (parts.filter((p) => p.lines.length).length < cap) parts.push({ voice, lines: [li] });
    else {
      // full: join an instrument of that voice that holds more than one note
      const like = parts.findIndex((p) => p.voice === voice && VOICE_INFO[voice].poly > 1);
      if (like < 0) return null;
      parts[like].lines.push(li);
    }
  }
  const kept = parts.filter((p) => p.lines.length > 0);
  for (const p of kept) p.lines.sort((a, b) => a - b);
  // keep the stage in the file's order (by each instrument's first line)
  kept.sort((a, b) => a.lines[0] - b.lines[0]);
  return planOf(kept, lines, shiftsOf(plan));
}

/** would moving this line to `voice` fit on the stage? */
export const canReassign = (plan: Plan, lines: LineInfo[], li: number, voice: Voice | null, cap: number): boolean => reassign(plan, lines, li, voice, cap) !== null;

// ---------------------------------------------------------------- routing by hand (many to many)
// These keep every instrument where it sits, even with no line left (it waits, silent, until it is
// given one or taken off): a routing grid's rows do not jump about while it is being set.

/** line `li` on part `k` as well (on), or no longer (off) */
export function setRoute(plan: Plan, lines: LineInfo[], li: number, k: number, on: boolean): Plan {
  const parts = partsCopy(plan);
  const p = parts[k];
  if (!p || li < 0 || li >= lines.length) return plan;
  p.lines = on ? [...p.lines, li] : p.lines.filter((i) => i !== li);
  return planOf(parts, lines, shiftsOf(plan));
}

/** part `k` plays exactly these lines (all of them: the whole file; none: it waits) */
export function setPartLines(plan: Plan, lines: LineInfo[], k: number, lis: number[]): Plan {
  const parts = partsCopy(plan);
  if (!parts[k]) return plan;
  parts[k].lines = [...lis];
  return planOf(parts, lines, shiftsOf(plan));
}

/** where a new instrument of `voice` sits: after the last of its own voice (two cellos side by side),
 *  else before the first that sits lower (the stage runs high to low, the pianos last) */
function seatFor(parts: Part[], voice: Voice): number {
  for (let k = parts.length - 1; k >= 0; k--) if (parts[k].voice === voice) return k + 1;
  if (isKeyboard(voice)) return parts.length;
  const c = VOICE_INFO[voice].centre;
  const k = parts.findIndex((p) => isKeyboard(p.voice) || VOICE_INFO[p.voice].centre < c);
  return k < 0 ? parts.length : k;
}

/** a new instrument on the stage (another of a voice already there is its own engine and seat),
 *  playing `lis` (a line, the whole file, or none yet); null when the stage is full */
export function addPart(plan: Plan, lines: LineInfo[], voice: Voice, lis: number[], cap: number): Plan | null {
  if (plan.parts.length >= cap) return null;
  const parts = partsCopy(plan);
  parts.splice(seatFor(parts, voice), 0, { voice, lines: [...lis] });
  return planOf(parts, lines, shiftsOf(plan));
}

/** an instrument taken off the stage (its lines that no other plays fall silent) */
export function removePart(plan: Plan, lines: LineInfo[], k: number): Plan {
  if (!plan.parts[k]) return plan;
  const parts = partsCopy(plan);
  parts.splice(k, 1);
  return planOf(parts, lines, shiftsOf(plan));
}

/** an instrument changed for another (it keeps its seat and its lines, each moved into the new
 *  instrument's range) */
export function setPartVoice(plan: Plan, lines: LineInfo[], k: number, voice: Voice): Plan {
  if (!plan.parts[k] || plan.parts[k].voice === voice) return plan;
  const parts = partsCopy(plan);
  parts[k].voice = voice;
  return planOf(parts, lines, shiftsOf(plan));
}

/**
 * Each part's player: 0, or, for a part that doubles a line already played by an earlier part of the
 * same voice, how many such parts come before it. Two violins on one tune are two players (each its
 * own vibrato and bow noise, see the engine's `player` option), not one violin twice as loud; two
 * violins on two lines (a quartet) are left exactly as they were.
 */
export function playersOf(plan: Plan): number[] {
  return plan.parts.map((p, k) => {
    let n = 0;
    for (let j = 0; j < k; j++) if (plan.parts[j].voice === p.voice && plan.parts[j].lines.some((i) => p.lines.includes(i))) n++;
    return n;
  });
}
