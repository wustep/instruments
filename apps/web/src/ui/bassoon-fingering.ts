// The bassoon's standard fingerings (Heckel system, the German bassoon played in orchestras everywhere but
// France), shared by the 2D stage and the 3D model, so both close the same keys for the engine's note.
// The Woodwind Fingering Guide's basic chart for the Heckel-system bassoon (Timothy Reichard,
// wfg.woodwind.org/bassoon/basn_bas_1–3, the first fingering of each note; B4–E5 from its alternate
// chart basn_alt_3, the first one listed). The bassoon is in C: the chart's notes are as they sound, the
// engine's MIDI numbers.
//
// The fingers (bits), as the WFG's fingering scheme (basn_fing) names them:
//   left thumb, lower row (the long joint): the low B♭, B, C and D keys (each closes its pad on the long
//     joint or bell; a lower one closes those above it by its linkage);
//   left thumb, upper row (the wing joint): the D, B and A flick keys (vents, for the second and third
//     octaves), the C♯ thumb key, the whisper key (W: closes the wing's small vent, the "piano" key);
//   left hand: the first two finger holes (L1, L2: open holes in the wing joint; L1's half-hole, uncovered by
//     rolling the finger down, is HALF), the third finger's key with its ring (L3), the E♭ and E slivers
//     (the E sliver is not in any basic fingering), the little finger's E♭ and C♯ keys;
//   right thumb (the boot): the B♭, E, F♯ and G♯ keys;
//   right hand: the first two finger holes (R1, R2), the third finger's key with its ring (R3), the B♭
//     sliver between R2 and R3 (not in any basic fingering); the little finger's F, F♯ and G♯ keys.
// A set bit is a finger on its key or hole (closing a hole, pressing a key); what a key does to its pad
// (closes a normally open one: the low keys, the thumb's E, F♯ and B♭; opens a normally closed vent: the
// flicks, the C♯ keys, the E♭ keys, the G♯ keys) is the drawing's to show.
export const LBB = 1 << 0;
export const LB = 1 << 1;
export const LC = 1 << 2;
export const LD = 1 << 3;
export const FD = 1 << 4;
export const FB = 1 << 5;
export const FA = 1 << 6;
export const TCS = 1 << 7;
export const W = 1 << 8;
export const L1 = 1 << 9;
export const HALF = 1 << 10;
export const L2 = 1 << 11;
export const L3 = 1 << 12;
export const SEB = 1 << 13;
export const SE = 1 << 14;
export const LEB = 1 << 15;
export const LCS = 1 << 16;
export const RBB = 1 << 17;
export const RE = 1 << 18;
export const RFS = 1 << 19;
export const RGS = 1 << 20;
export const R1 = 1 << 21;
export const R2 = 1 << 22;
export const R3 = 1 << 23;
export const SBB = 1 << 24;
export const PF = 1 << 25;
export const PFS = 1 << 26;
export const PGS = 1 << 27;
export const LH = L1 | L2 | L3;
export const RH = R1 | R2 | R3;

/** the compass the chart covers: B♭1 (34) to E5 (76), as it sounds (the bassoon is in C) */
export const BASSOON_LO = 34;
export const BASSOON_HI = 76;

/** the standard fingerings, B♭1–E5 (WFG's notation in each comment: left thumb keys, left hand | right
 *  thumb keys, right hand, little fingers) */
const CHART: Record<number, number> = {
  // first octave: the long tube, holes closed from the top, the thumbs' keys below them
  34: LBB | LB | LC | LD | LH | RE | RH | PF, // B♭1  Bb B C D 123|E 123 F
  35: LB | LC | LD | LH | RE | RH | PF, // B1  B C D 123|E 123 F
  36: LC | LD | LH | RE | RH | PF, // C2  C D 123|E 123 F
  37: LC | LD | LH | LCS | RE | RH | PF, // C♯2  C D 123 C#|E 123 F
  38: LD | LH | RE | RH | PF, // D2  D 123|E 123 F
  39: LD | LH | LEB | RE | RH | PF, // E♭2  D 123 Eb|E 123 F
  40: W | LH | RE | RH | PF, // E2  W 123|E 123 F
  41: W | LH | RH | PF, // F2  W 123|123 F
  42: W | LH | RFS | RH | PF, // F♯2  W 123|F# 123 F
  43: W | LH | RH, // G2  W 123|123
  44: W | LH | RH | PGS, // G♯2  W 123|123 G#
  45: W | LH | R1 | R2, // A2  W 123|12-
  46: W | LH | RBB | R1 | R2, // B♭2  W 123|Bb 12-
  47: W | LH | R1, // B2  W 123|1--
  48: W | LH, // C3  W 123|---
  49: LD | TCS | W | LH, // C♯3  D C# W 123|---
  50: W | L1 | L2, // D3  W 12-|---
  51: W | L1 | L3, // E♭3  W 1-3|---
  52: W | L1, // E3  W 1--|---
  53: W, // F3  W ---|---
  // second octave: the half-hole (F♯3–G♯3), then the whisper key off (the flick keys only for slurs)
  54: W | HALF | L2 | L3 | RFS | RH | PF, // F♯3  W ½23|F# 123 F
  55: W | HALF | L2 | L3 | LEB | RH, // G3  W ½23 Eb|123
  56: W | HALF | L2 | L3 | RH | PGS, // G♯3  W ½23|123 G#
  57: LH | R1 | R2, // A3  123|12-
  58: LH | RBB | R1 | R2, // B♭3  123|Bb 12-
  59: LH | R1, // B3  123|1--
  60: LH, // C4  123|---
  61: LD | TCS | LH, // C♯4  D C# 123|---
  62: L1 | L2, // D4  12-|---
  63: L1 | L2 | RH, // E♭4  12-|123
  64: L1 | L3 | LEB | RH, // E4  1-3 Eb|123
  65: L1 | L3 | LEB | R1 | R2, // F4  1-3 Eb|12-
  // third octave: cross-fingered, the flick keys venting (A4 up)
  66: L2 | L3 | LEB | RBB | R1 | R2, // F♯4  -23 Eb|Bb 12-
  67: W | HALF | L2 | L3 | LEB | R1 | PF, // G4  W ½23 Eb|1-- F
  68: W | HALF | L2 | L3 | LEB | R3, // G♯4  W ½23 Eb|--3
  69: FA | TCS | LH | LEB | R3, // A4  a C# 123 Eb|--3
  70: FA | TCS | LH | LEB | R1 | R2 | PF, // B♭4  a C# 123 Eb|12- F
  71: FB | L1 | L2 | LEB | RBB | R1 | R2 | PF, // B4  b 12- Eb|Bb 12- F
  72: FB | L1 | LEB | RBB | R1 | R2 | PF, // C5  b 1-- Eb|Bb 12- F
  73: FD | FB | L1 | L3 | LEB | R1 | R3, // C♯5  d b 1-3 Eb|1-3
  74: FD | L2 | L3 | LEB | RBB | R3 | PGS, // D5  d -23 Eb|Bb --3 G# (the chart's second: its first half-holes L2)
  75: FD | SEB | L3 | LEB | RBB | R3 | PGS, // E♭5  d - eb -3 Eb|Bb --3 G#
  76: TCS | HALF | L2 | L3 | RGS | RH | PF, // E5  C# ½23|G# 123 F
};

/** the standard fingerings, B♭1–E5 (index m − 34) */
export const BASSOON_FINGERING: number[] = Array.from({ length: BASSOON_HI - BASSOON_LO + 1 }, (_, i) => CHART[BASSOON_LO + i]);

/** the fingers down for a note (clamped into the compass) */
export const bassoonFingersFor = (m: number): number => BASSOON_FINGERING[Math.max(0, Math.min(BASSOON_HI - BASSOON_LO, Math.round(m) - BASSOON_LO))];

/** which octave of the chart a note is in (the engine's register, core/bassoon.ts bassoonRegister):
 *  1 B♭1–F3, 2 F♯3–F4, 3 F♯4–E5 */
export const bassoonOctave = (m: number): 1 | 2 | 3 => (m <= 53 ? 1 : m <= 65 ? 2 : 3);
