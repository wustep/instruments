// Which instrument plays which line of a MIDI file. Pure (no DOM, no audio), so it is tested fast.
//
// A voice is one of the twelve instruments on the stage. Keyboard voices (the grand, the upright) take
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

export type Voice = 'grand' | 'upright' | 'violin' | 'viola' | 'cello' | 'bass' | 'harp' | 'flute' | 'oboe' | 'clarinet' | 'bassoon' | 'horn' | 'trumpet' | 'trombone' | 'tuba' | 'timpani' | 'glockenspiel';
export const VOICES: Voice[] = ['grand', 'upright', 'violin', 'viola', 'cello', 'bass', 'harp', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'tuba', 'timpani', 'glockenspiel'];

export interface VoiceInfo {
  label: string;
  /** the engine's instrument and (pianos) preset */
  instrument: 'piano' | 'violin' | 'viola' | 'cello' | 'bass' | 'harp' | 'flute' | 'oboe' | 'clarinet' | 'bassoon' | 'horn' | 'trumpet' | 'trombone' | 'tuba' | 'timpani' | 'glockenspiel';
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
// bass E1–G3 sounding, flute C4–C7, oboe B♭3–G6 (in C: written as it sounds), B♭ clarinet D3–B♭6 sounding
// (its parts mostly G3–C6), bassoon B♭1–E5 (in C, bass and tenor clef; its parts mostly C2–G4), horn in F
// B♭1–F5 sounding (written F2–C6, a fifth higher; its parts mostly written C4–G5: sounding F3–C5, and a
// classical part for a horn crooked lower, in E♭ or D, sounds lower still), trumpet F#3–D6), the timpani
// C2–A3 (a set of four pedal drums; a classical pair is tuned to the tonic and the dominant, F2–D3, so its
// parts mostly lie G2–D3; two mallets: two drums at once), the trombone C1–G5 (one model in three sizes: the
// bass trombone's pedal C1 to the alto's G5; a tenor's parts mostly lie E2–G4, centre F3; each seat takes the
// size its lines need, tromboneSizeOf), the tuba C1–F4 (the contrabass tuba in C, written at pitch; its parts
// mostly lie F1–F3, centre F2: an octave under the trombones it sits beside), where a part for it mostly lies
export const VOICE_INFO: Record<Voice, VoiceInfo> = {
  grand: { label: 'grand piano', instrument: 'piano', preset: 'grand', lo: 21, hi: 108, centre: 60, poly: 88 },
  upright: { label: 'upright piano', instrument: 'piano', preset: 'upright', lo: 21, hi: 108, centre: 60, poly: 88 },
  violin: { label: 'violin', instrument: 'violin', lo: 55, hi: 100, centre: 74, poly: 4 },
  viola: { label: 'viola', instrument: 'viola', lo: 48, hi: 88, centre: 63, poly: 4 },
  cello: { label: 'cello', instrument: 'cello', lo: 36, hi: 81, centre: 52, poly: 4 },
  bass: { label: 'double bass', instrument: 'bass', lo: 28, hi: 67, centre: 40, poly: 4 },
  harp: { label: 'harp', instrument: 'harp', lo: 24, hi: 103, centre: 64, poly: 47 },
  flute: { label: 'flute', instrument: 'flute', lo: 60, hi: 96, centre: 79, poly: 1 },
  oboe: { label: 'oboe', instrument: 'oboe', lo: 58, hi: 93, centre: 74, poly: 1 },
  clarinet: { label: 'clarinet', instrument: 'clarinet', lo: 50, hi: 94, centre: 70, poly: 1 },
  bassoon: { label: 'bassoon', instrument: 'bassoon', lo: 34, hi: 76, centre: 50, poly: 1 },
  horn: { label: 'horn', instrument: 'horn', lo: 34, hi: 77, centre: 60, poly: 1 },
  trumpet: { label: 'trumpet', instrument: 'trumpet', lo: 52, hi: 86, centre: 68, poly: 1 },
  trombone: { label: 'trombone', instrument: 'trombone', lo: 24, hi: 79, centre: 53, poly: 1 },
  tuba: { label: 'tuba', instrument: 'tuba', lo: 24, hi: 65, centre: 41, poly: 1 },
  timpani: { label: 'timpani', instrument: 'timpani', lo: 36, hi: 57, centre: 46, poly: 2 },
  glockenspiel: { label: 'glockenspiel', instrument: 'glockenspiel', lo: 79, hi: 108, centre: 93, poly: 30 },
};
export const isKeyboard = (v: Voice): boolean => v === 'grand' || v === 'upright';
/** one player takes every line of the voice: a piano's staves, a harp's two hands (often two tracks) */
export const takesAll = (v: Voice): boolean => isKeyboard(v) || v === 'harp';
/** a bowed instrument: a line may join another's as a section's desk */
const isBowed = (v: Voice): boolean => VOICE_INFO[v].poly === 4;

/** what each instrument costs the audio thread, per cent of one core's real time at 48 kHz (an M-series
 *  Mac, offline: scripts/stage-cost.ts, the busier of its own piece and idle, rounded up; a piano with 32
 *  voices, as two on the stage have): what decides how many instruments a piece or an address may seat
 *  (fitLineup) */
export const VOICE_COST: Record<Voice, number> = { grand: 16, upright: 17, violin: 2, viola: 2, cello: 2.6, bass: 2.9, harp: 3.7, flute: 1.3, oboe: 1.3, clarinet: 1.3, bassoon: 1.3, horn: 1.2, trumpet: 1.2, trombone: 1.8, tuba: 1.2, timpani: 2, glockenspiel: 1.3 };
/** a lineup's cost (VOICE_COST summed) */
export const lineupCost = (lineup: Voice[]): number => lineup.reduce((s, v) => s + (VOICE_COST[v] ?? 0), 0);
/** the heaviest lineup of `n` instruments the stage was sized for by count: two pianos (the most it takes)
 *  and double basses, the heaviest of the others when it was measured on the devices. (A harp left to ring
 *  costs more than a bass: it is counted at its own cost, and does not raise what the stage may hold.) */
export const heaviestCost = (n: number): number => {
  const kb = Math.max(...VOICES.filter(isKeyboard).map((v) => VOICE_COST[v]));
  return Math.min(2, n) * kb + Math.max(0, n - 2) * VOICE_COST.bass;
};
/** the most seats an Orchestra has (an address is read for no more: address.ts) */
export const MAX_SEATS = 24;
/**
 * The seats of a lineup the stage takes, in order: any lineup of up to `cap` instruments (ensemble.ts
 * stageCap), and a longer one as far as it costs no more than the heaviest of `cap` (heaviestCost): an
 * orchestra of winds and strings seats twenty where two pianos and six double basses were the most. The
 * same for a piece, an address and a lineup made by hand, so what is made by hand reopens from its address.
 */
export function fitLineup(lineup: Voice[], cap: number): Voice[] {
  if (lineup.length <= cap) return lineup;
  const budget = heaviestCost(cap);
  let sum = 0;
  let n = 0;
  while (n < lineup.length && n < MAX_SEATS && sum + VOICE_COST[lineup[n]] <= budget + 1e-9) sum += VOICE_COST[lineup[n++]];
  return lineup.slice(0, Math.max(cap, n));
}
/** does the stage take the whole of this lineup (fitLineup keeps every seat)? */
export const fitsStage = (lineup: Voice[], cap: number): boolean => lineup.length <= MAX_SEATS && fitLineup(lineup, cap).length === lineup.length;
/** may a lineup become another by hand? Always when it seats no more and costs no more (taking an
 *  instrument off, a flute for an oboe); else only when the stage takes the new one (fitsStage) */
export const mayBecome = (from: Voice[], to: Voice[], cap: number): boolean => (to.length <= from.length && lineupCost(to) <= lineupCost(from) + 1e-9) || fitsStage(to, cap);

/** the score's order (woodwinds, brass, timpani, strings, then the keyboards): a new instrument's place in
 *  a lineup, and the order of a lineup picked by hand (the seats from the audience's left) */
export const SCORE_ORDER: Voice[] = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'tuba', 'timpani', 'glockenspiel', 'harp', 'violin', 'viola', 'cello', 'bass', 'grand', 'upright'];

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
  /** the range of all but the outermost 2 % of its notes, when known (midi-file.ts MidiLine.core): a part's
   *  rare extremes (a horn's pedal notes) do not decide its instrument or its octave; they fold by octaves
   *  into the instrument's compass as they play (placeNote) */
  core?: [number, number];
  /** notes per pitch class (C = 0 … B = 11), when known (midi-file.ts MidiLine.pcs): a transposing part
   *  typed at its written pitch is told from one at its sounding pitch by it (concertShift) */
  pcs?: number[];
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
 *  orchestra's bass line; a bass guitar's too) and the contrabassoon (the lowest line);
 *  the cello keeps "Violoncello" and a continuo, and a bass clarinet, bass trombone, bass tuba or bass drum
 *  is not a bass. The contrabassoon is the double bass's until it has an instrument of its own. */
export function voiceFromName(s: string): Voice | null {
  const t = s.toLowerCase();
  if (!t.trim()) return null;
  if (/contra-?bassoon|kontrafagott|contrafagotto|contrebasson/.test(t)) return 'bass';
  if (/upright(?! ?bass)|honky/.test(t)) return 'upright';
  // the timpani: timpani/timpano, kettledrum(s), Pauke(n), timbales (French, Spanish), timballes, "Timp.",
  // "Timb.", "Tmp.", "Pk." (a score's "Percussion (Timpani)" too; a plain "Percussion" or a drum kit is not
  // a timpani part)
  if (/timpan|kettle ?drum|\bpauken?\b|timbales|timballes|\btimp\.?(?![a-z])|\btimb\.?(?![a-z])|\btmp\.?(?![a-z])|\bpk\.(?![a-z])/.test(t)) return 'timpani';
  // the bassoon: bassoon(s), fagotto/-i, Fagott, basson(s), fagot (Spanish), bajón, "Bn.", "Bsn.", "Fg.",
  // "Fag." (the contrabassoon is caught above: it is not this instrument)
  if (/bassoon|fagott|\bfagot\b|\bbassons?\b|baj[oó]n|\bbsns?\.?(?![a-z])|\bbns?\.?(?![a-z])|\bfg\.?(?![a-z])|\bfag\.?(?![a-z])/.test(t)) return 'bassoon';
  // the horn: horn(s), French horn, Waldhorn, Hörner, corno/corni, cor(s) (cor d'harmonie, cor en fa),
  // trompa(s), the mellophone, "Hn.", "Hns", "Hr.", in any key ("Horn in F", "Corno in Es", "Corni in B
  // basso", "Horn in B♭ alto": before the double bass's "basso" and the viola's "alto"). Its namesakes are
  // not: the English horn (cor anglais, corno inglese: the oboe's), the basset horn (corno di bassetto: the
  // clarinet's), the flugelhorn and the post horn (small trumpets), the cornet and cornetto
  if (
    /horn|h[oö]rner|hoerner|\bcorn[oi]\b|\bcors?\b|\btrompas?\b|mellophon|\bhns?\.?(?![a-z])|\bhrs?\.?(?![a-z])/.test(t) &&
    !/english|englisch|anglais|inglese|basset|fl[uü]gel|post ?horn/.test(t)
  )
    return 'horn';
  // the trombone: trombone(s), tromboni, trombón, Posaune(n), the sackbut (saqueboute), "Tbn.", "Tbns", "Trb.",
  // "Tromb.", "Pos.", and its sizes (alto, tenor, bass trombone; Alt-, Tenor-, Bassposaune: before the double
  // bass's "bass" and the viola's "alto"). The tromba is the trumpet's
  if (/trombon|posaun|sackbut|saqueboute|\btbns?\.?(?![a-z])|\btrbs?\.?(?![a-z])|\btromb\.?(?![a-z])|\bpos\.(?![a-z])/.test(t)) return 'trombone';
  // the tuba: tuba(s), Tuben, the bass and contrabass tuba (Basstuba, Kontrabasstuba: before the double
  // bass's "bass" and "contrabass"), "Tba.", "Tb." after a trombone's "Tbn." has been taken, and its kin, played
  // on it today or of its family: the sousaphone, the helicon, the bombardon, the ophicleide, the cimbasso,
  // the euphonium and the tenor tuba (a tuba's part when it lies in a tuba's range). The Wagner tuba is a
  // horn player's (the horn's rule has no "tuba": named here)
  if (/wagner ?-?tub/.test(t)) return 'horn';
  if (/\btub(a|as|en)\b|[a-z]tuba\b|\btbas?\.?(?![a-z])|\btb\.(?![a-z])|sousaphon|helicon|bombardon|o(ph|f)icleide|cimbasso|euphoni|eufoni/.test(t)) return 'tuba';
  if (/cello|violoncell|violincell|\bvc\.?\b|\bvlc\b|continuo/.test(t)) return 'cello';
  if (
    /contra-? ?b?bass|contrebasse|kontrabass|contrabajo|double ?bass|upright ?bass|string ?bass|acoustic ?bass|violone|\bcb\.?(?![a-z])|\bcbs\b|\bkb\.?(?![a-z])|\bd\. ?b\.|\bbass(o|e|i|es)?\b/.test(t) &&
    !/clarinet|klarinett|clarinette|trombone|posaune|drum/.test(t)
  )
    return 'bass';
  if (/viola|\bvla?\.?\b|bratsche|\balto\b/.test(t) && !/viola da gamba/.test(t)) return 'viola';
  if (/viol|vln|fiddle|geige|violon\b/.test(t)) return 'violin';
  // the oboe: oboe, oboi, hautbois, Hoboe/Oboe, oboe d'amore, "Ob.", and the cor anglais (English horn,
  // corno inglese, Englischhorn: the alto oboe, a fifth lower, moved by octaves into the oboe's range)
  if (/\boboe|\boboi\b|hautbois|hoboe|\bob\.?(?![a-z])|\bobs?\b|cor anglais|english ?horn|corno inglese|englisch ?horn/.test(t)) return 'oboe';
  // the clarinet: clarinet(s), clarinetto/-i, Klarinette, clarinette, "Cl.", "Clar.", "Kl.", and its kin (the
  // bass clarinet, the basset horn, the chalumeau: moved by octaves into the B♭ clarinet's range)
  if (/clarinet|klarinett|\bcl\.?(?![a-z])|\bcls\b|\bclar\.?(?![a-z])|\bkl\.?(?![a-z])|basset|chalumeau/.test(t)) return 'clarinet';
  // (the Flügelhorn's "fl" before an umlaut would read as the flute's abbreviation)
  if (/fl[uü]gel|post ?horn/.test(t)) return 'trumpet';
  if (/flute|flauto|fl[oö]te|flûte|piccolo|recorder|\bfl\.?\b|sax/.test(t)) return 'flute';
  if (/trumpet|tromba|trompete|trompette|cornet|brass|\btpt?\.?\b/.test(t)) return 'trumpet';
  // the glockenspiel: Glockenspiel, Glock., Glsp., orchestra bells, campanelli, jeu de timbres (tubular bells
  // and a celesta are not it)
  if (/glockenspiel|\bglock\.?(?![a-z])|\bglsp\.?(?![a-z])|\borch(estral?|\.)? ?bells\b|campanelli|jeu de timbres/.test(t)) return 'glockenspiel';
  // the harp: harp(s), Harfe(n), arpa/arpe, harpe(s), "Hp.", "Hrp." (the harpsichord is a keyboard's: below)
  if (/\bharps?\b|\bharfen?\b|\barp[ae]\b|\bharpes?\b|\bhp\.(?![a-z])|\bhrp\.?(?![a-z])/.test(t)) return 'harp';
  if (/piano|klavier|cembalo|harpsichord|clavecin|keyboard|organ|orgel|continuo|clavichord|celesta|guitar|lute/.test(t)) return 'grand';
  return null;
}

/** General MIDI program families (0…127) */
export function voiceFromProgram(p: number): Voice | null {
  if (p < 0) return null;
  if (p === 9) return 'glockenspiel'; // General MIDI 10
  if (p <= 31) return 'grand'; // pianos, chromatic percussion, organs, guitars
  if (p <= 39) return 'bass'; // basses: acoustic (32), electric, fretless, slap, synth
  if (p === 40 || p === 44 || p === 45) return 'violin'; // violin, tremolo and pizzicato strings
  if (p === 41) return 'viola';
  if (p === 42) return 'cello';
  if (p === 43) return 'bass'; // contrabass
  if (p === 46) return 'harp'; // orchestral harp (General MIDI 47)
  if (p === 47) return 'timpani';
  if (p <= 55) return null; // string and voice ensembles: by range
  if (p === 57) return 'trombone';
  if (p === 58) return 'tuba';
  if (p === 60) return 'horn'; // French horn
  if (p <= 63) return 'trumpet'; // brass
  if (p === 68 || p === 69) return 'oboe'; // oboe, English horn
  if (p === 70) return 'bassoon';
  if (p === 71) return 'clarinet';
  if (p <= 79) return 'flute'; // reeds and pipes
  return null;
}

// ---------------------------------------------------------------- transposing parts
// A MIDI file's notes are normally its sounding pitches (a notation program writes a horn in F's part a
// fifth above the sound, and its MIDI at the sound: LilyPond's \transposition, Mutopia's files, MuseScore,
// Sibelius), so a transposing part plays as the file has it. But a part typed into a file as it is read
// (the trumpet in Mutopia's Réjouissance, a tone above the organ) would sound a fifth too high on a horn.
// Its name says what it was written for ("Horn in F", "Corni in Es", "Clarinetto in B", "Cor en Fa",
// "Tromba in D"; a horn named without a key is in F, the usual horn), and its notes say which it is: a part
// at its written pitch is in another key than the rest of the file, and moved to its sounding pitch it is
// in theirs (a natural horn's part in E♭ is written in C: its Cs, Es and Gs are the file's E♭s, Gs and
// B♭s). So the move is made only when the line's pitch classes match the other lines' clearly better once
// moved (concertShift).

const LETTER: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 10, h: 11 };
const SOLFEGE: Record<string, number> = { do: 0, ut: 0, re: 2, ré: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
/** the key a part's name says it is written in ("in F", "in E♭", "in Es", "in B", "in H", "en Fa", "in
 *  Mi♭", "in B flat"), its pitch class (C = 0), or null. "B" alone is B♭ (German, as transposing parts are
 *  named in scores: "Klarinette in B", "Corni in B basso"); B natural is "H" or "Si" */
export function keyOfName(s: string): number | null {
  const t = s.toLowerCase();
  const m = /(?:^|[^a-z])(?:in|en)\s+(do|ut|ré|re|mi|fa|sol|la|si|[a-h])(\s*(?:♭|b|-?\s?flat|es|s|bemolle|bémol|♯|#|-?\s?sharp|is|diesis|dièse))?(?![a-z])/.exec(t);
  if (!m) return null;
  const name = m[1];
  const acc = (m[2] ?? '').trim();
  let pc = name.length > 1 ? SOLFEGE[name] : LETTER[name];
  if (pc === undefined) return null;
  // (an English "B" with an accidental is B: "B♭" B♭, not A)
  if (name === 'b' && acc) pc = 11;
  if (/^(♭|b|-?\s?flat|es|s|bemolle|bémol)$/.test(acc)) pc -= 1;
  else if (/^(♯|#|-?\s?sharp|is|diesis|dièse)$/.test(acc)) pc += 1;
  return (pc + 12) % 12;
}

/** semitones from a part's written pitch to its sounding pitch, from its name: a horn in X sounds X below
 *  the written C (in F a fifth down, in E♭ a major sixth); the other instruments the nearer way (a clarinet
 *  in B♭ a tone down, in A a minor third down, in E♭ a minor third up; a trumpet in D a tone up). Octaves
 *  are the line's fit to its instrument's (fitShift). A horn named without a key is in F; another
 *  instrument named without one, as it sounds (0) */
export function transpositionOf(l: Pick<LineInfo, 'name' | 'instrument'>): number {
  const v = voiceFromName(l.name) ?? voiceFromName(l.instrument);
  const key = keyOfName(l.name) ?? keyOfName(l.instrument) ?? (v === 'horn' ? 5 : null);
  if (key === null || key === 0) return 0;
  if (v === 'horn') return key - 12;
  return key <= 6 ? key : key - 12;
}

/** how well two pitch-class profiles agree (Pearson's r over the 12 classes) */
function pcCorr(a: number[], b: number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / 12;
  const mb = b.reduce((s, x) => s + x, 0) / 12;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < 12; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}
/** how much better a transposed line must match the rest of the file to be moved (Pearson's r), and the
 *  fewest notes it must have for its key to be told */
const CONCERT_MARGIN = 0.25;
const CONCERT_MIN_NOTES = 16;

/**
 * Semitones to move line `i` by so that it sounds at concert pitch: its name's transposition
 * (transpositionOf) when the line is at its written pitch, 0 when it is already as it sounds (the usual
 * MIDI file) or that cannot be told. Told by its pitch classes against the rest of the file's (each other
 * line counting equally): moved, the line must match them better by CONCERT_MARGIN (Pearson's r).
 */
export function concertShift(lines: LineInfo[], i: number): number {
  const l = lines[i];
  const t = transpositionOf(l);
  if (!t || t % 12 === 0 || !l.pcs || l.notes < CONCERT_MIN_NOTES) return 0;
  const rest = new Array<number>(12).fill(0);
  let others = 0;
  lines.forEach((o, j) => {
    const n = o.pcs?.reduce((s, x) => s + x, 0) ?? 0;
    if (j === i || !o.pcs || n < 1) return;
    for (let k = 0; k < 12; k++) rest[k] += o.pcs[k] / n;
    others++;
  });
  if (!others) return 0;
  const moved = Array.from({ length: 12 }, (_, k) => l.pcs![(((k - t) % 12) + 12) % 12]);
  return pcCorr(moved, rest) > pcCorr(l.pcs, rest) + CONCERT_MARGIN ? t : 0;
}
/** a line as it sounds: moved by its concert shift (its range; the counts move with it) */
const sounding = (l: LineInfo, t: number): LineInfo => (t ? { ...l, lo: l.lo + t, hi: l.hi + t, median: l.median + t, core: l.core && [l.core[0] + t, l.core[1] + t], pcs: l.pcs && Array.from({ length: 12 }, (_, k) => l.pcs![(((k - t) % 12) + 12) % 12]) } : l);

// ---------------------------------------------------------------- fitting a line to an instrument
/** the range a line is judged by: its core (all but its rarest extremes) when known */
const span = (l: Pick<LineInfo, 'lo' | 'hi' | 'core'>): [number, number] => l.core ?? [l.lo, l.hi];

/** octaves to move a line by so most of it lies in the voice's range (ties: the smallest move) */
export function fitShift(l: Pick<LineInfo, 'lo' | 'hi' | 'median' | 'core'>, v: Voice): number {
  const r = VOICE_INFO[v];
  const [l0, l1] = span(l);
  let best = 0;
  let bestScore = -Infinity;
  for (const k of [0, 12, -12, 24, -24]) {
    const lo = l0 + k;
    const hi = l1 + k;
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
  const [l0, l1] = span(l);
  const lo = l0 + k;
  const hi = l1 + k;
  return hi === lo ? (lo >= r.lo && lo <= r.hi ? 1 : 0) : Math.max(0, Math.min(hi, r.hi) - Math.max(lo, r.lo)) / (hi - lo);
};
/** can the voice hold the line's chords? (a bowed string: double stops; a wind: one note) */
const holds = (l: LineInfo, v: Voice): boolean => l.poly <= (VOICE_INFO[v].poly <= 2 ? VOICE_INFO[v].poly : VOICE_INFO[v].poly === 4 ? 3 : 88);

/** how much of a line lies in the voice's range as written (0…1) */
const fits0 = (l: LineInfo, v: Voice): number => {
  const r = VOICE_INFO[v];
  const [lo, hi] = span(l);
  return hi === lo ? (lo >= r.lo && lo <= r.hi ? 1 : 0) : Math.max(0, Math.min(hi, r.hi) - Math.max(lo, r.lo)) / (hi - lo);
};

/** how well a line sits on an instrument: in range (after its best octave move), near the middle of
 *  the instrument's register, and not moved far. A keyboard has every register: neutral. */
function rangeScore(l: LineInfo, v: Voice): number {
  if (isKeyboard(v)) return 1;
  const k = fitShift(l, v);
  // (the harp's six and a half octaves have no middle a line should be near: a left hand is as much its as a right)
  const off = v === 'harp' ? 0 : Math.abs(l.median + k - VOICE_INFO[v].centre) / 12;
  // (a glockenspiel's part is written two octaves under where it sounds, or one, or where it sounds: brought
  // up by octaves it is at home, and the octaves cost it nothing)
  if (v === 'glockenspiel') return 2 * fits(l, v);
  return 2 * fits(l, v) - off - (2.5 * Math.abs(k)) / 12;
}

/** A brass line the file names for no instrument of its own (a track called "Brass" or "Low Brass", a brass
 *  program with no name that says which) and that lies clearly under the trombone is the tuba's: its middle
 *  below the tenor trombone's low E2 and its core reaching under C2 (a tuba's parts mostly lie F1–F3, a bass
 *  trombone's B♭1–F3). A line named for the trombone or the trumpet stays theirs, however low. `said`: the
 *  name the hint was read from (none: a program). */
function lowBrass(l: LineInfo, v: Voice | null, said: string): Voice | null {
  if (v !== 'trumpet' && v !== 'trombone') return v;
  if (said && !(/brass/i.test(said) && voiceFromName(said.replace(/brass/gi, ' ')) === null)) return v;
  // (a program says less than a name: a line a name gives to the trombone or the trumpet keeps it)
  if (!said && [l.name, l.instrument].some((s) => ['trumpet', 'trombone'].includes(voiceFromName(s) ?? '') && !/brass/i.test(s))) return v;
  return l.median < 40 && span(l)[0] < 36 ? 'tuba' : v;
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
  // (a name that is only a register, "alto", "tenor", "bass" — a quartet's voices — says less than an
  // instrument or program that names the instrument: the Air's four trombones are "alto" … "bass")
  const bare = /^\s*(soprano|alto|tenor|bass|basso|basse|baritone)\s*\d*\s*$/i.test(l.name) && (voiceFromName(l.instrument) !== null || l.program >= 0);
  const hints: [Voice | null, number][] = [
    [lowBrass(l, voiceFromName(l.name), l.name), bare ? 1 : 3],
    [lowBrass(l, voiceFromName(l.instrument), l.instrument), 1.5],
    [lowBrass(l, voiceFromProgram(l.program), ''), 1],
  ];
  const cands = new Map<Voice, number>([
    ['violin', 0],
    ['viola', 0],
    ['cello', 0],
  ]);
  // a line below the cello's C: a bass line, the double bass's
  if (l.lo < VOICE_INFO.cello.lo) cands.set('bass', 0);
  for (const [v, w] of hints) if (v && (isKeyboard(v) || v === 'glockenspiel' || fits0(l, v) >= 0.9)) cands.set(v, (cands.get(v) ?? 0) + w);
  // chords: four notes at once are a keyboard's (a harp's, where the file says harp); three may be a
  // string's triple stop
  const chords: Voice = cands.has('harp') ? 'harp' : 'grand';
  if (l.poly >= 3) cands.set(chords, (cands.get(chords) ?? 0) + (l.poly >= 4 ? 2.5 : 0.6));
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
/** a line's move on an instrument: to its sounding pitch (concertShift: `t`), then by octaves into the
 *  instrument's range (a keyboard has them all) */
const shiftFor = (l: LineInfo, v: Voice, t = 0) => t + (isKeyboard(v) ? 0 : fitShift(sounding(l, t), v));

/**
 * The instruments a voice per line puts on the stage: one per keyboard voice (all its lines) and one
 * harp (its two hands, often two tracks, are one player's), one per other line, in the file's order.
 * With more than `cap` instruments the smallest lines join a like bowed instrument (a section, nearest
 * in register) or the piano (made if there is none).
 */
export function partsOf(voices: (Voice | null)[], lines: Sized[], cap: number): Part[] {
  const parts: Part[] = [];
  const kb = new Map<Voice, Part>();
  voices.forEach((v, i) => {
    if (!v) return;
    if (takesAll(v)) {
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
  // (the timpani's two mallets are not a section's desks, nor a harp's strings: a line does not join
  // them to make room, and neither becomes the continuo)
  const bowed = (p: Part) => isBowed(p.voice);
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
  const tr = lines.map((_, i) => concertShift(lines, i));
  parts.forEach((p, k) => {
    p.lines = [...new Set(p.lines.filter((i) => i >= 0 && i < lines.length))].sort((a, b) => a - b);
    for (const i of p.lines) out[i].push({ part: k, shift: shifts?.get(shiftKey(i, p.voice)) ?? shiftFor(lines[i], p.voice, tr[i]) });
  });
  return { parts, lines: out };
}

/**
 * Auto-assign the lines of a file. With `lineup` (instruments picked by hand) the lines are matched
 * to it by register; without, each line gets its own guess. `cap`: the most instruments on stage.
 */
export function autoPlan(lines: LineInfo[], opts: { cap: number; lineup?: Voice[] }): Plan {
  const lineup = (opts.lineup ?? []).filter((v) => VOICE_INFO[v]).slice(0, Math.max(1, opts.cap));
  // (each line judged as it sounds: a horn's part typed at its written pitch is a fifth higher)
  const heard = lines.map((l, i) => sounding(l, concertShift(lines, i)));
  if (!lineup.length) {
    // a file that names no instrument anywhere (no names, no programs) and plays chords is a keyboard
    // piece: its single-note lines are a left hand, not a cello
    const named = lines.some((l) => voiceFromName(l.name) ?? voiceFromName(l.instrument) ?? (l.program >= 0 ? true : null));
    if (!named && lines.some((l) => l.poly >= 3)) return planOf(partsOf(lines.map(() => 'grand' as Voice), lines, opts.cap), lines);
    return planOf(partsOf(heard.map(guessVoice), lines, opts.cap), lines);
  }
  return planOf(matchLineup(heard, lineup).parts, lines);
}

/** lines onto a hand-picked lineup, by register: each instrument (high to low) leads one line, chosen
 *  in order from the lines (high to low) so the registers match and busy lines lead (a DP over both
 *  orders; with fewer lines than instruments some instruments wait); the other lines join the
 *  instrument nearest their register that holds more than one note */
export function matchLineup(lines: LineInfo[], lineup: Voice[]): Plan {
  const parts: Part[] = lineup.map((v) => ({ voice: v, lines: [] }));
  // (a glockenspiel's line where it sounds: written two octaves under, it is still the top of the score)
  const glockAt = lineup.includes('glockenspiel');
  const med = (i: number) => lines[i].median + (glockAt && isGlockLine(lines[i]) ? fitShift(lines[i], 'glockenspiel') : 0);
  const ls = lines.map((_, i) => i).sort((a, b) => med(b) - med(a) || a - b);
  const slots = lineup.map((_, i) => i).sort((a, b) => VOICE_INFO[lineup[b]].centre - VOICE_INFO[lineup[a]].centre || a - b);
  const n = ls.length;
  const m = slots.length;
  const busiest = Math.max(1, ...lines.map((l) => l.notes));
  const harps = lineup.includes('harp');
  const glocks = lineup.includes('glockenspiel');
  const cost = (i: number, j: number) => {
    const l = lines[ls[i]];
    const v = lineup[slots[j]];
    // (the timpani lead a timpani part, named or GM 47, before any other line in their register)
    const drums = v === 'timpani' ? (isTimpaniLine(l) ? -3 : 2) : isTimpaniLine(l) ? 2 : 0;
    // (and a tuba its own part, named or GM 58, before the trombone's or the double bass's beside it)
    const tuba = v === 'tuba' && isTubaLine(l) ? -1.5 : 0;
    // (and a harp its own, named or GM 46, wherever its hands lie: the harp has no register to be far from)
    const harp = !harps ? 0 : v === 'harp' ? (isHarpLine(l) ? -3 : 0) : isHarpLine(l) ? 1 : 0;
    // (and a glockenspiel its own, named or GM 9, wherever it is written)
    const glock = !glocks ? 0 : v === 'glockenspiel' ? (isGlockLine(l) ? -3 : 1.5) : isGlockLine(l) ? 1 : 0;
    const off = (v === 'harp' && isHarpLine(l)) || (v === 'glockenspiel' && isGlockLine(l)) ? 0 : Math.abs(l.median - VOICE_INFO[v].centre) / 12;
    return off + (1 - fits(l, v)) * 3 + (holds(l, v) ? 0 : 4) - l.notes / busiest + drums + tuba + harp + glock;
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
    // (a harp's other hand joins its harp, wherever it lies)
    const key = (k: number) => (parts[k].voice === 'harp' && isHarpLine(l) ? -100 : 0) + (VOICE_INFO[parts[k].voice].poly > 2 ? 0 : 100) + Math.abs(l.median - VOICE_INFO[parts[k].voice].centre);
    for (let k = 1; k < parts.length; k++) if (key(k) < key(best)) best = k;
    parts[best].lines.push(li);
  }
  for (const p of parts) p.lines.sort((a, b) => a - b);
  return planOf(parts, lines);
}

/** a timpani part by its name or its program */
const isTimpaniLine = (l: LineInfo): boolean => voiceFromName(l.name) === 'timpani' || voiceFromName(l.instrument) === 'timpani' || l.program === 47;

/** a tuba part by its name or its program */
const isTubaLine = (l: LineInfo): boolean => voiceFromName(l.name) === 'tuba' || voiceFromName(l.instrument) === 'tuba' || l.program === 58;

/** a glockenspiel part by its name or its program */
const isGlockLine = (l: LineInfo): boolean => voiceFromName(l.name) === 'glockenspiel' || voiceFromName(l.instrument) === 'glockenspiel' || l.program === 9;

/** a harp part by its name or its program */
const isHarpLine = (l: LineInfo): boolean => voiceFromName(l.name) === 'harp' || voiceFromName(l.instrument) === 'harp' || l.program === 46;

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
 * piano if there is one, a harp's line its harp; another voice takes over the line's own instrument when the line is its only
 * one, else gets an instrument of its own, or (the stage full) joins one of that voice. Instruments
 * left with no line leave the stage. Returns null when the stage has no room for it.
 */
export function reassign(plan: Plan, lines: LineInfo[], li: number, voice: Voice | null, cap: number): Plan | null {
  const parts: Part[] = plan.parts.map((p) => ({ voice: p.voice, lines: p.lines.filter((i) => i !== li) }));
  const was = (plan.lines[li] ?? []).map((r) => r.part);
  if (voice) {
    // the line's own instrument: one that played it and nothing else
    const alone = was.find((k) => plan.parts[k].lines.length === 1);
    const same = parts.findIndex((p) => p.voice === voice && (takesAll(voice) || p.lines.length === 0));
    if (takesAll(voice) && same >= 0) parts[same].lines.push(li);
    else if (alone !== undefined) {
      parts[alone].voice = voice;
      parts[alone].lines.push(li);
    } else if (same >= 0) parts[same].lines.push(li);
    else if (fitsStage([...parts.filter((p) => p.lines.length).map((p) => p.voice), voice], cap)) parts.push({ voice, lines: [li] });
    else {
      // full: join an instrument of that voice that holds more than one note
      const like = parts.findIndex((p) => p.voice === voice && VOICE_INFO[voice].poly > 2);
      if (like < 0) return null;
      parts[like].lines.push(li);
    }
  }
  const kept = parts.filter((p) => p.lines.length > 0);
  for (const p of kept) p.lines.sort((a, b) => a - b);
  // keep the stage in the file's order (by each instrument's first line)
  kept.sort((a, b) => a.lines[0] - b.lines[0]);
  // (an instrument changed in its seat may cost the stage more: a flute's line moved to a piano)
  if (!mayBecome(lineupOf(plan), kept.map((p) => p.voice), cap)) return null;
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
 *  else at its place in the score's order (SCORE_ORDER: before the first that comes after it there; the
 *  pianos last) */
export function seatFor(voices: Voice[], voice: Voice): number {
  const k0 = voices.lastIndexOf(voice);
  if (k0 >= 0) return k0 + 1;
  const r = SCORE_ORDER.indexOf(voice);
  const k = voices.findIndex((v) => SCORE_ORDER.indexOf(v) > r);
  return k < 0 ? voices.length : k;
}

/** a new instrument on the stage (another of a voice already there is its own engine and seat),
 *  playing `lis` (a line, the whole file, or none yet); null when the stage has no room for it (fitsStage) */
export function addPart(plan: Plan, lines: LineInfo[], voice: Voice, lis: number[], cap: number): Plan | null {
  if (!fitsStage([...lineupOf(plan), voice], cap)) return null;
  const parts = partsCopy(plan);
  parts.splice(seatFor(lineupOf(plan), voice), 0, { voice, lines: [...lis] });
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

// ---------------------------------------------------------------- a pair on one staff (divisi)
/**
 * The voice of line `li` that part `k` plays (its notes' `div`: midi-file.ts divide), or −1: all of them.
 * A wind or brass instrument holds one note, so on a line that holds two or more at once (two flutes on one
 * staff, as Mutopia's symphonies write them) the line's first instrument of a kind plays its top voice
 * (Flauto I), the second the next (Flauto II), and any more double them in turn (four horns on a staff of
 * two); a single note is the first player's, a unison written twice is both. A line of one voice is
 * played whole by each (two flutes on one tune double it), as are every line on a bowed string, a piano
 * and the timpani (two mallets).
 */
export function deskOf(plan: Plan, lines: Pick<LineInfo, 'poly'>[], li: number, k: number): number {
  const v = plan.parts[k]?.voice;
  const l = lines[li];
  if (!v || !l || VOICE_INFO[v].poly !== 1 || l.poly < 2 || !plan.parts[k].lines.includes(li)) return -1;
  let d = 0;
  for (let j = 0; j < k; j++) if (plan.parts[j].voice === v && plan.parts[j].lines.includes(li)) d++;
  return d % l.poly;
}
/** does a part at desk `desk` (deskOf) play this note? */
export const playsNote = (e: { div?: number }, desk: number): boolean => desk < 0 || (e.div ?? 0) === desk;

// ---------------------------------------------------------------- the trombones' sizes
/** the trombone a seat needs for its lines (one model, three sizes: packages/engine core/trombone.ts): a line
 *  named for one ("alto trombone", "Trombone basso", "Bassposaune", "Trombone I (alto)") is that one; else a
 *  bass trombone for a part that lives low (its core reaches below E2 or its middle is under C3: a bass
 *  trombone's parts sit an octave under the tenor's), an alto for one that stays high (nothing under A2, its
 *  middle at or over E4: the classical alto parts, Mozart's and Beethoven's, lie G3–E♭5), the tenor
 *  otherwise. Many lines: the lowest a bass needs wins, then the alto */
export type TromboneSize = 'alto' | 'tenor' | 'bass';
export function tromboneSizeOf(lines: Pick<LineInfo, 'name' | 'instrument' | 'lo' | 'hi' | 'median' | 'core'>[]): TromboneSize {
  if (!lines.length) return 'tenor';
  const named = (l: Pick<LineInfo, 'name' | 'instrument'>): TromboneSize | null => {
    const t = `${l.name} ${l.instrument}`.toLowerCase();
    if (/\bbass|basso|bassposaune|\bb\.? ?tbn|btbn/.test(t)) return 'bass';
    if (/\balt(o|us|posaune)?\b/.test(t)) return 'alto';
    if (/tenor/.test(t)) return 'tenor';
    return null;
  };
  const sizes = lines.map((l) => {
    const n = named(l);
    if (n) return n;
    const [lo] = l.core ?? [l.lo, l.hi];
    if (lo < 40 || l.median < 48) return 'bass';
    if (lo >= 45 && l.median >= 64) return 'alto';
    return 'tenor';
  });
  return sizes.includes('bass') ? 'bass' : sizes.every((s) => s === 'alto') ? 'alto' : 'tenor';
}
