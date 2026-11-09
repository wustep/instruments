// The Boehm flute's standard fingerings, shared by the 2D stage (stage-draw.ts) and the 3D model
// (gl/winds3d.ts), so both close the same keys for the engine's note.
//
// The fingers (bits): the left thumb on the B lever or on the Briccialdi B♭ lever; the left hand's
// three fingers and its little finger (the G♯ spatula); the right hand's three fingers, and its little
// finger on the E♭ (D♯) key or the C♯ or C roller.
export const TB = 1;
export const TBB = 2;
export const L1 = 4;
export const L2 = 8;
export const L3 = 16;
export const GS = 32;
export const R1 = 64;
export const R2 = 128;
export const R3 = 256;
export const EB = 512;
export const CS = 1024;
export const CC = 2048;
export const LH = TB | L1 | L2 | L3;
export const RH = R1 | R2 | R3;
/** the standard Boehm fingerings, C4–C7, first choices (The Woodwind Fingering Guide,
 *  wfg.woodwind.org/flute; fluteinfo.com's chart): the second octave overblows the first's from E5,
 *  D5 and D♯5 vent through the C♯ key (L1 up), the third octave is cross-fingered */
export const FINGERING: number[] = (() => {
  const t: Record<number, number> = {
    60: LH | RH | CC, 61: LH | RH | CS, 62: LH | RH, 63: LH | RH | EB, 64: LH | R1 | R2 | EB, 65: LH | R1 | EB, 66: LH | R3 | EB,
    67: LH | EB, 68: LH | GS | EB, 69: TB | L1 | L2 | EB, 70: TBB | L1 | EB, 71: TB | L1 | EB, 72: L1 | EB, 73: EB,
    74: TB | L2 | L3 | RH, 75: TB | L2 | L3 | RH | EB,
    86: TB | L2 | L3 | EB, 87: LH | GS | RH | EB, 88: TB | L1 | L2 | R1 | R2 | EB, 89: TB | L1 | L3 | R1 | EB, 90: TB | L1 | L3 | R3 | EB,
    91: L1 | L2 | L3 | EB, 92: L2 | L3 | GS | EB, 93: TB | L2 | R1 | EB, 94: TB | R1 | EB, 95: TB | L1 | L3 | R2 | CC, 96: L1 | L2 | L3 | GS | R1,
  };
  for (let m = 76; m <= 85; m++) t[m] = t[m - 12];
  return Array.from({ length: 37 }, (_, i) => t[60 + i]);
})();
/** the fingers down for a note (the chart's range, C4–C7, held at its ends) */
export const fingersFor = (m: number) => FINGERING[Math.max(0, Math.min(36, Math.round(m) - 60))];
/** the note the bore sounds, from its length (the engine's own c / 2f) */
export const boreNote = (lengthM: number) => Math.round(69 + 12 * Math.log2(343 / (2 * lengthM * 440)));
