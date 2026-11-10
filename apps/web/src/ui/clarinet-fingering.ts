// The B♭ clarinet's standard fingerings (Boehm system, 17 keys and 6 rings), shared by the 2D stage and
// the 3D model, so both close the same keys for the engine's note. The usual basic chart (Rendall, "The
// Clarinet", 1971; the Woodwind Fingering Guide's Boehm chart, wfg.woodwind.org/clarinet/cl_bas_1–3): the
// chalumeau E3–F♯4 closes holes from the top down with the little fingers' keys below them; the throat
// notes G4–B♭4 open the A and G♯ keys; the clarion B4–C6 is the chalumeau's fingering a twelfth down with
// the register key; the altissimo C♯6–C7 is cross-fingered with the register key and vents (C♯6–G6 the
// WFG's basic fingerings; G♯6–C7 the usual chart's).
//
// The chart is in written pitch (the B♭ clarinet sounds a tone lower: written = concert + 2); the engine
// and the keyboard play concert pitch, so look a note up with clarinetFingersFor(concert midi).
//
// The fingers (bits): the left thumb on its ring (T) and on the register key (REG); the left hand's two
// rings and its third hole (L1–L3: the third finger's hole has no ring, as Yamaha's YCL-CSG III and
// Selmer's Signet show it); the left index on the A key and the G♯ key above the top hole; the left
// little finger on the C♯/G♯, E/B and F♯/C♯ keys; the right hand's three rings (R1–R3), its index on the
// side E♭/B♭ key (the lowest of its four side keys); the right little finger on the F/C, E/B and A♭/E♭
// keys; the B/F♯ sliver between R2 and R3 (WFG's "B").
export const T = 1;
export const REG = 2;
export const L1 = 4;
export const L2 = 8;
export const L3 = 16;
export const LA = 32;
export const LGS = 64;
export const LCS = 128;
export const LE = 256;
export const LFS = 512;
export const R1 = 1024;
export const R2 = 2048;
export const R3 = 4096;
export const RF = 8192;
export const RE = 16384;
export const RAB = 32768;
/** the right index's side key (E♭4 / B♭5) */
export const SEB = 65536;
/** the right hand's B/F♯ sliver key, between R2 and R3 (closes the B/F♯ pad without a ring) */
export const RB = 131072;
export const LH = L1 | L2 | L3;
export const RH = R1 | R2 | R3;

/** the compass at concert pitch: D3 (50) to B♭6 (94), written E3–C7 */
export const CLARINET_LO = 50;
export const CLARINET_HI = 94;

/** the standard fingerings by WRITTEN pitch, E3–C7 (MIDI 52–96) */
const WRITTEN: Record<number, number> = {
  52: T | LH | RH | LE, // E3
  53: T | LH | RH | RF, // F3
  54: T | LH | RH | LFS, // F♯3
  55: T | LH | RH, // G3
  56: T | LH | RH | RAB, // G♯3
  57: T | LH | R1 | R2, // A3
  58: T | LH | R1, // B♭3
  59: T | LH | R2, // B3 (forked)
  60: T | LH, // C4
  61: T | LH | LCS, // C♯4
  62: T | L1 | L2, // D4
  63: T | L1 | L2 | SEB, // E♭4 (D4 and the side key: WFG "T 12-|4---")
  64: T | L1, // E4
  65: T, // F4
  66: L1, // F♯4
  67: 0, // G4 (open)
  68: LGS, // G♯4
  69: LA, // A4
  70: LA | REG, // B♭4
  71: REG | T | LH | RH | LE, // B4: E3 a twelfth up
  72: REG | T | LH | RH | RF, // C5
  73: REG | T | LH | RH | LFS, // C♯5
  74: REG | T | LH | RH, // D5
  75: REG | T | LH | RH | RAB, // E♭5
  76: REG | T | LH | R1 | R2, // E5
  77: REG | T | LH | R1, // F5
  78: REG | T | LH | R2, // F♯5 (forked)
  79: REG | T | LH, // G5
  80: REG | T | LH | LCS, // G♯5
  81: REG | T | L1 | L2, // A5
  82: REG | T | L1 | L2 | SEB, // B♭5 (WFG "RT 12-|4---")
  83: REG | T | L1, // B5
  84: REG | T, // C6
  // (C♯6–G6: the WFG's basic fingerings, cl_bas_3; each sounds the fifth resonance of the tube ending at
  // its first run of open holes: C♯6 at R3, D6 at R2, E6 at the B/F♯ pad)
  85: REG | T | L2 | L3 | R1 | R2, // C♯6 ("RT -23|12-")
  86: REG | T | L2 | L3 | R1 | RAB, // D6 ("RT -23|1--G#")
  87: REG | T | L2 | L3 | R1 | RB | RAB, // E♭6 ("RT -23|1-B-G#")
  88: REG | T | L2 | L3 | RAB, // E6 ("RT -23|---G#")
  89: REG | T | L2 | L3 | LCS | RAB, // F6 ("RT -23C#|---G#")
  90: REG | T | L2 | RAB, // F♯6 ("RT -2-|---G#")
  91: REG | T | L2 | R1 | R2 | RAB, // G6 ("RT -2-|12-G#")
  92: REG | T | L1 | L3 | R1 | R2, // G♯6
  93: REG | T | L1 | L3 | R1, // A6
  94: REG | T | L1 | L3 | RH | RAB, // B♭6
  95: REG | T | L1 | L3 | R1 | R2 | RAB, // B6
  96: REG | T | L1 | L3 | R2 | R3 | RAB, // C7
};

/** the standard fingerings by concert pitch, D3–B♭6 (index m − 50) */
export const CLARINET_FINGERING: number[] = Array.from({ length: CLARINET_HI - CLARINET_LO + 1 }, (_, i) => WRITTEN[CLARINET_LO + i + 2]);

/** the keys down for a note at concert pitch (the chart's range, held at its ends) */
export const clarinetFingersFor = (m: number): number => CLARINET_FINGERING[Math.max(0, Math.min(CLARINET_HI - CLARINET_LO, Math.round(m) - CLARINET_LO))];

/** which register a note (concert pitch) is played in: 1 the chalumeau and the throat notes (written
 *  E3–B♭4), 2 the clarion (B4–C6: the register key, the twelfth), 3 the altissimo (C♯6 up) */
export const clarinetRegister = (m: number): 1 | 2 | 3 => (m <= 68 ? 1 : m <= 82 ? 2 : 3);
