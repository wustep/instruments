// The oboe's standard fingerings (conservatoire system), shared by the 2D stage and the 3D model, so
// both close the same keys for the engine's note. From the Woodwind Fingering Guide's basic chart
// (wfg.woodwind.org/oboe/ob_bas_1.html … ob_bas_3.html: B♭3–F6, each note's "Basic" fingering) and,
// above F6, the first fingering of its third-octave alternate chart (ob_alt_3.html: F♯6–A6).
//
// The fingers (bits): the left thumb on the first octave key (I) or the left index's side on the second
// octave key (II); the left hand's three rings, its index half-holed (the plate rolled open: C♯5–E♭5
// and the third octave); its little finger on the low B♭, low B, G♯ or E♭ key; the right hand's three
// rings and the F key between its second and third fingers; its little finger on the low C, C♯ or E♭.
export const OCT1 = 1;
export const OCT2 = 2;
export const L1 = 4;
/** the left index half-holed: its plate rolled open (the ring still down) */
export const HALF = 8;
export const L2 = 16;
export const L3 = 32;
export const LBB = 64;
export const LB = 128;
export const LGS = 256;
export const LEB = 512;
export const R1 = 1024;
export const R2 = 2048;
export const R3 = 4096;
/** the right hand's F key (between its second and third fingers) */
export const RF = 8192;
export const RC = 16384;
export const RCS = 32768;
export const REB = 65536;
export const LH = L1 | L2 | L3;
export const RH = R1 | R2 | R3;

/** the compass the chart covers: B♭3 (58) to A6 (93), concert pitch (the oboe is in C) */
export const OBOE_LO = 58;
export const OBOE_HI = 93;

/** the standard fingerings, B♭3–A6 (index m − 58) */
export const OBOE_FINGERING: number[] = (() => {
  const t: Record<number, number> = {
    58: LH | LBB | RH | RC, // B♭3
    59: LH | LB | RH | RC, // B3
    60: LH | RH | RC, // C4
    61: LH | RH | RCS, // C♯4
    62: LH | RH, // D4
    63: LH | RH | REB, // E♭4
    64: LH | R1 | R2, // E4
    65: LH | R1 | R2 | RF, // F4
    66: LH | R1, // F♯4
    67: LH, // G4
    68: LH | LGS, // G♯4
    69: L1 | L2, // A4
    70: L1 | L2 | R1, // B♭4
    71: L1, // B4
    72: L1 | R1, // C5
    73: L1 | HALF | L2 | L3 | RH | RCS, // C♯5
    74: L1 | HALF | L2 | L3 | RH, // D5
    75: L1 | HALF | L2 | L3 | RH | REB, // E♭5
    76: OCT1 | LH | R1 | R2, // E5
    77: OCT1 | LH | R1 | R2 | RF, // F5
    78: OCT1 | LH | R1, // F♯5
    79: OCT1 | LH, // G5
    80: OCT1 | LH | LGS, // G♯5
    81: OCT2 | L1 | L2, // A5
    82: OCT2 | L1 | L2 | R1, // B♭5
    83: OCT2 | L1, // B5
    84: OCT2 | L1 | R1, // C6
    85: L2 | L3 | R1 | RC, // C♯6
    86: L1 | HALF | L2 | L3 | RC, // D6
    87: L1 | HALF | L2 | L3 | LB | R2 | R3, // E♭6
    88: OCT1 | L1 | HALF | L2 | L3 | LGS | LEB | R2 | R3, // E6
    89: OCT1 | L1 | HALF | L2 | LGS | LEB | R2 | R3, // F6
    90: OCT1 | L1 | L2 | R1 | R2 | RF, // F♯6
    91: OCT1 | L1 | L3 | R1, // G6
    92: OCT1 | L1 | L3 | LB | R2 | R3, // G♯6
    93: OCT1 | L1 | HALF | L3 | R2, // A6
  };
  return Array.from({ length: OBOE_HI - OBOE_LO + 1 }, (_, i) => t[OBOE_LO + i]);
})();

/** the keys down for a note (the chart's range, held at its ends) */
export const oboeFingersFor = (m: number): number => OBOE_FINGERING[Math.max(0, Math.min(OBOE_HI - OBOE_LO, Math.round(m) - OBOE_LO))];

/** which register a note is played in: 1 fundamental (B♭3–C5), 2 the octave (C♯5–C6: half-hole, then
 *  the thumb's and the side octave key), 3 the third octave (C♯6 up, cross-fingered) */
export const oboeRegister = (m: number): 1 | 2 | 3 => (m <= 72 ? 1 : m <= 84 ? 2 : 3);
