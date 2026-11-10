// Where an ensemble's instruments sit on the stage, in metres: x across (negative at the audience's
// left), z upstage (away from the audience). The 3D stage draws them there (ui/gl/scenes3d.ts) and
// each engine is heard from there (its room's seat, engine core/post.ts): the first violin on the
// left, the cello on the right, the piano behind. The sound takes a computer's wide stage whatever the
// view (a phone held upright seats two rows in 3D; the sound does not move when the view changes).

/** what decides a seat */
export interface SeatKind {
  family: 'piano' | 'bowed' | 'wind' | 'brass';
  kind: 'grand' | 'upright';
  cello: boolean;
}

/** a seat: the instrument's footprint centre (x, z) and the way the melodic ones face (radians) */
export interface Place {
  x: number;
  z: number;
  face: number;
}

/** the melodic instruments on an arc opening towards the audience (the first at the audience's left,
 *  as a quartet sits: first violin, second, viola, cello); the pianos behind. A tall, narrow stage (a
 *  phone held upright) seats them in two rows. */
export function seatPlaces(parts: SeatKind[], aspect = 2): Place[] {
  const mel = parts.map((p, i) => (p.family === 'piano' ? -1 : i)).filter((i) => i >= 0);
  const kb = parts.map((p, i) => (p.family === 'piano' ? i : -1)).filter((i) => i >= 0);
  const out: Place[] = new Array(parts.length);
  // one or two players with a piano stand beside it (a soloist at the piano's curve), more sit in front;
  // two pianos stand side by side, 2.5 m apart, and the players beside the one on the right
  const beside = kb.length > 0 && mel.length <= 2;
  const kbOff = (k: number) => (k - (kb.length - 1) / 2) * (kb.length > 1 ? 2.5 : 2.3);
  const right = kb.length ? kbOff(kb.length - 1) : 0;
  const rows = aspect < 1.1 && mel.length > 3 ? 2 : 1;
  const perRow = Math.ceil(mel.length / rows);
  mel.forEach((i, k) => {
    const row = rows === 2 ? (k < perRow ? 0 : 1) : 0;
    const inRow = row === 0 ? Math.min(perRow, mel.length) : mel.length - perRow;
    const kk = row === 0 ? k : k - perRow;
    const n = inRow;
    // neighbours about 0.8 m apart on an arc (flatter as it grows: its ends would come at the camera)
    const spread = n > 1 ? Math.min(0.72, 0.28 + 0.12 * n) : 0;
    const R = n > 1 ? (0.8 * (n - 1)) / (2 * spread) : 1;
    const u = n > 1 ? kk / (n - 1) : 0.5;
    const phi = -spread * (1 - 2 * u);
    const x = beside ? right + 1.75 + kk * 0.85 : R * Math.sin(phi) + (rows === 2 && row === 1 ? 0.35 : 0);
    const z = beside ? 0.55 - kk * 0.5 : R * (Math.cos(phi) - 1) + (kb.length ? -0.35 : 0) + row * 0.95;
    // each faces the arc's middle
    out[i] = { x, z, face: phi * 0.5 };
  });
  kb.forEach((i, k) => {
    // a grand side-on, its open lid towards the audience; an upright faces them
    out[i] = { x: kbOff(k), z: mel.length > 2 ? 1.55 : 1.1, face: 0 };
  });
  return out;
}

const FAMILY = { piano: 'piano', violin: 'bowed', viola: 'bowed', cello: 'bowed', bass: 'bowed', flute: 'wind', trumpet: 'brass' } as const;

/** each part's seat (x, z) for the sound, by the lineup's instruments (a computer's wide stage) */
export function soundSeats(lineup: { instrument: keyof typeof FAMILY; preset?: string }[]): [number, number][] {
  return seatPlaces(lineup.map((v) => ({ family: FAMILY[v.instrument], kind: v.preset === 'upright' ? 'upright' : 'grand', cello: v.instrument === 'cello' || v.instrument === 'bass' }))).map((p) => [p.x, p.z]);
}
