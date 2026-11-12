// Where an ensemble's instruments sit on the stage, in metres: x across (negative at the audience's
// left), z upstage (away from the audience), y the riser a seat stands on. The 3D stage draws them there
// (ui/gl/scenes3d.ts), the 2D stage keeps their rows (ui/ensemble-draw.ts), and each engine is heard from
// there (its room's seat, engine core/post.ts). The sound takes a computer's wide stage whatever the view
// (a phone held upright seats the players in more, shorter rows; the sound does not move when the view
// changes).
//
// A few players (a quartet, a trio with a piano) sit on one arc, in the lineup's order. Five or more sit as
// an orchestra does (the American seating that Stokowski set in the 1920s and most orchestras keep, the
// Beethoven-era back row of horns, timpani and trumpets): the strings in front round the conductor, first
// violins at the audience's left, then the seconds, the violas and the cellos at the right, the basses
// standing behind the cellos; the woodwinds behind them in two rows (flutes and oboes, then clarinets and
// bassoons, the principals in the middle); the brass behind those (horns at the left, trumpets, then
// trombones at the right), the timpani at the back's left end; the rows behind the strings each a riser
// higher (the stage's own steps, about 18 cm each). A section's desks sit together, two abreast, the
// next pair behind, rather than one long row. A keyboard stands at the back on the left, where an
// orchestra's piano, celesta and harps go.

export type Inst = 'violin' | 'viola' | 'cello' | 'bass' | 'harp' | 'flute' | 'oboe' | 'clarinet' | 'bassoon' | 'horn' | 'trumpet' | 'trombone' | 'tuba' | 'timpani' | 'grand' | 'upright';

/** what decides a seat */
export interface SeatKind {
  family: 'piano' | 'bowed' | 'plucked' | 'wind' | 'reed' | 'brass' | 'percussion';
  kind: 'grand' | 'upright';
  cello: boolean;
  /** a double bass: it stands, bigger than a cello, so it takes more room beside its neighbours and
   *  stands a little upstage of the arc (as the basses stand behind the cellos) */
  bass?: boolean;
  /** the instrument (when missing, the family's: a violin, the cello or bass by their flags, a flute, an
   *  oboe, a trumpet, timpani, the piano by its kind) */
  inst?: Inst;
}

/** a seat: the instrument's footprint centre (x, z), the way the melodic ones face (radians), and the
 *  height of the riser it stands on (m; 0 on the stage's floor) */
export interface Place {
  x: number;
  z: number;
  face: number;
  y: number;
}

/** the instrument a seat's kind names */
export function instOf(p: SeatKind): Inst {
  if (p.inst) return p.inst;
  switch (p.family) {
    case 'piano':
      return p.kind;
    case 'bowed':
      return p.bass ? 'bass' : p.cello ? 'cello' : 'violin';
    case 'plucked':
      return 'harp';
    case 'wind':
      return 'flute';
    case 'reed':
      return 'oboe';
    case 'brass':
      return 'trumpet';
    default:
      return 'timpani';
  }
}
const isKeys = (i: Inst) => i === 'grand' || i === 'upright';
/** the players (not the keyboards, not the timpani): five or more sit as an orchestra */
export const ORCHESTRA_FROM = 5;
export function isOrchestral(parts: SeatKind[]): boolean {
  return parts.filter((p) => !isKeys(instOf(p)) && instOf(p) !== 'timpani').length >= ORCHESTRA_FROM;
}

/** where each part sits; `aspect`, the stage's width over its height: under TALL (a phone held upright)
 *  the rows are shorter and more of them */
export const TALL = 1.1;
export function seatPlaces(parts: SeatKind[], aspect = 2): Place[] {
  return isOrchestral(parts) ? orchestraLayout(parts, aspect < TALL).places : chamberPlaces(parts, aspect);
}

/** the risers an orchestra's rows stand on: each an arc of the stage round the podium (centre z: the front
 *  ring's middle is at z = 0) from radius r0 to r1 and angle a0 to a1 (radians from straight upstage,
 *  positive towards the audience's right), `y` high; none for a few players */
export interface Riser {
  zc: number;
  r0: number;
  r1: number;
  a0: number;
  a1: number;
  y: number;
}
export function seatRisers(parts: SeatKind[], aspect = 2): Riser[] {
  return isOrchestral(parts) ? orchestraLayout(parts, aspect < TALL).risers : [];
}

// ---------------------------------------------------------------- an orchestra
/** the arc a seat takes along its row (m): a player's chair and stand, a bass's room to stand and bow, the
 *  four drums of a timpani set (2.6 m across) and the player behind them, a grand side-on */
export const SEAT_W: Record<Inst, number> = { violin: 0.8, viola: 0.82, cello: 0.92, bass: 1.1, harp: 1.3, flute: 0.82, oboe: 0.72, clarinet: 0.74, bassoon: 0.8, horn: 0.88, trumpet: 0.8, trombone: 0.98, tuba: 1.0, timpani: 2.8, grand: 2.9, upright: 1.7 };
/** a row's longest arc (m): a computer's stage, and a phone's held upright */
const ROW_MAX = { wide: 9.6, tall: 4.3 };
/** each riser's step (m) */
export const RISE = 0.18;
/** from one ring of string desks to the next; from the strings to the woodwinds, from one woodwind row to
 *  the next, to the brass (the trombones' slides reach a metre forward), to a row of timpani alone (m) */
const DEPTH = { desk: 1.0, winds: 1.2, wind: 1.08, brass: 1.28, drums: 1.55 };
/** the front ring's least radius (m), and the most it turns either side of the middle (radians) */
const R0_MIN = 2.1;
const HALF_MAX = 0.74;

/**
 * An orchestra's plan, by sections: the strings' sections in front (left to right: first violins, seconds,
 * violas, cellos; each its desks), the basses, the woodwinds' rows and the brass's (front to back, each left
 * to right), the timpani, the harps and the keyboards. The first half of the violins (one more when odd) are the
 * firsts. The timpani stand past the brass row's left end (`drumsBehind` false: beyond the woodwinds, clear
 * of them), or on a row of their own behind the brass when that row would be too long. `tall`: a phone's
 * stage, its rows shorter (a long row parts at a section's end).
 */
export interface OrchestraPlan {
  strings: number[][];
  basses: number[];
  winds: number[][];
  brass: number[][];
  drums: number[];
  drumsBehind: boolean;
  /** the harps: at the left end of the first row behind the strings (by the violins) */
  harps: number[];
  keys: number[];
}
export function orchestraPlan(parts: SeatKind[], tall = false): OrchestraPlan {
  const inst = parts.map(instOf);
  const of = (...want: Inst[]) => inst.flatMap((v, i) => (want.includes(v) ? [i] : []));
  const vln = of('violin');
  const firsts = Math.ceil(vln.length / 2);
  let strings = [vln.slice(0, firsts), vln.slice(firsts), of('viola'), of('cello')].filter((s) => s.length);
  let basses = of('bass');
  // (basses and no other strings: the basses are the strings in front)
  if (!strings.length && basses.length) [strings, basses] = [[basses], []];
  const max = tall ? ROW_MAX.tall : ROW_MAX.wide;
  const len = (r: number[]) => r.reduce((s, i) => s + SEAT_W[inst[i]], 0);
  /** sections into rows of at most `max` (a section longer than a row parts into rows of its own) */
  const wrap = (groups: number[][]): number[][] => {
    const out: number[][] = [];
    for (const g of groups.filter((x) => x.length)) {
      const last = out[out.length - 1];
      if (last && len(last) + len(g) <= max) {
        last.push(...g);
        continue;
      }
      let cur: number[] = [];
      for (const i of g) {
        if (cur.length && len(cur) + SEAT_W[inst[i]] > max) {
          out.push(cur);
          cur = [];
        }
        cur.push(i);
      }
      out.push(cur);
    }
    return out;
  };
  // the woodwinds: flutes and oboes, then clarinets and bassoons (a few, one row)
  const wa = [of('flute'), of('oboe')];
  const wb = [of('clarinet'), of('bassoon')];
  const nw = [...wa, ...wb].reduce((s, g) => s + g.length, 0);
  const winds = nw <= 4 ? wrap([...wa, ...wb]) : [...wrap(wa), ...wrap(wb)];
  const drums = of('timpani');
  const brass = wrap([of('horn'), of('trumpet'), of('trombone'), of('tuba')]);
  const drumsBehind = brass.length > 0 && drums.length > 0 && (brass.length > 1 || len([...drums, ...brass[0]]) > max);
  return { strings, basses, winds, brass, drums, drumsBehind, harps: of('harp'), keys: of('grand', 'upright') };
}
/** the rows behind the strings, front to back (the timpani at the brass row's left end, or a row behind) */
export function rowsOf(plan: OrchestraPlan): number[][] {
  const back = plan.brass.map((r) => r.slice());
  if (plan.drums.length) {
    if (!back.length || plan.drumsBehind) back.push(plan.drums.slice());
    else back[0].unshift(...plan.drums);
  }
  const rows = [...plan.winds.map((r) => r.slice()), ...back];
  // the harps: at the left end of the first row behind the strings, or (no such row) a row of their own
  if (plan.harps.length) {
    if (rows.length) rows[0].unshift(...plan.harps);
    else rows.push(plan.harps.slice());
  }
  return rows;
}

function orchestraLayout(parts: SeatKind[], tall: boolean): { places: Place[]; risers: Riser[] } {
  const inst = parts.map(instOf);
  const W = (i: number) => SEAT_W[inst[i]];
  const plan = orchestraPlan(parts, tall);
  const out: Place[] = new Array(parts.length);
  const max = tall ? ROW_MAX.tall : ROW_MAX.wide;
  // the front: each string section's first desks side by side (two abreast, or one on a narrow stage
  // when two would not fit), its others behind them, a ring at a time
  const across = plan.strings.reduce((s, sec) => s + Math.min(2, sec.length) * W(sec[0]), 0) <= max ? 2 : 1;
  const lanes: { sec: number; w: number }[] = [];
  plan.strings.forEach((sec, s) => {
    for (let l = 0; l < Math.min(across, sec.length); l++) lanes.push({ sec: s, w: W(sec[0]) });
  });
  // (no strings: the first row behind takes the front, on the floor)
  const rows = rowsOf(plan);
  const lead = lanes.length ? lanes.map((l) => l.w) : (rows[0] ?? []).map(W);
  const span0 = lead.reduce((s, w) => s + w, 0) - (lead[0] + lead[lead.length - 1]) / 2;
  const R0 = Math.max(R0_MIN, span0 / (2 * HALF_MAX));
  // the podium (the arcs' centre) at z = −R0: the front ring's middle at z = 0
  const zc = -R0;
  const at = (R: number, phi: number, y: number, dz = 0): Place => ({ x: R * Math.sin(phi), z: zc + R * Math.cos(phi) + dz, face: phi * 0.5, y });
  /** a row's seats along an arc of radius R, centred on the middle (less the first `hang` metres, which hang
   *  off its left end): each one's angle */
  const along = (ws: number[], R: number, hang = 0): number[] => {
    const L = ws.reduce((s, w) => s + w, 0);
    let s = -(L - hang) / 2 - hang;
    return ws.map((w) => {
      const c = s + w / 2;
      s += w;
      return c / R;
    });
  };
  let depth = 0;
  let cellos: number[] = [];
  if (lanes.length) {
    const phis = along(lanes.map((l) => l.w), R0);
    plan.strings.forEach((sec, s) => {
      const mine = lanes.map((l, k) => (l.sec === s ? phis[k] : NaN)).filter((p) => !Number.isNaN(p));
      sec.forEach((i, d) => {
        const ring = Math.floor(d / across);
        depth = Math.max(depth, ring + 1);
        out[i] = at(R0 + ring * DEPTH.desk, mine[d % mine.length], 0);
      });
      if (s === plan.strings.length - 1) cellos = sec;
    });
  }
  // the rows behind, each a riser higher, centred
  let R = lanes.length ? R0 + (depth - 1) * DEPTH.desk + DEPTH.winds : R0;
  let tier = lanes.length ? 1 : 0;
  const placed: { R: number; lo: number; hi: number; y: number; deep: boolean }[] = [];
  rows.forEach((row, k) => {
    if (k > 0) {
      const prev = rows[k - 1];
      const isBack = (r: number[]) => r.some((i) => ['horn', 'trumpet', 'trombone', 'tuba', 'timpani'].includes(inst[i]));
      const drumsOnly = row.every((i) => inst[i] === 'timpani');
      R += drumsOnly ? DEPTH.drums : isBack(row) && !isBack(prev) ? DEPTH.brass : DEPTH.wind;
    }
    // (the timpani at the brass row's left end hang off it: the brass centred, the drums past the woodwinds)
    const hang = row.length > plan.drums.length && plan.drums.length && row[0] === plan.drums[0] ? plan.drums.reduce((s, i) => s + W(i), 0) : 0;
    const phis = along(row.map(W), R, hang);
    const y = tier * RISE;
    // (a timpani set is deep, its player behind the drums: back from the row's line)
    row.forEach((i, j) => (out[i] = at(R, phis[j], y, inst[i] === 'timpani' ? 0.3 : 0)));
    placed.push({ R, lo: phis[0] - W(row[0]) / 2 / R, hi: phis[phis.length - 1] + W(row[row.length - 1]) / 2 / R, y, deep: row.some((i) => inst[i] === 'timpani') });
    tier++;
  });
  // the basses: behind the cellos, on the floor, a bass's width apart going right, clear of the first
  // row of woodwinds' right end (with no other strings they are the strings, in front)
  if (plan.basses.length) {
    const Rb = R0 + depth * DEPTH.desk + 0.05;
    // (behind the cellos' right edge, so the cellos do not hide them)
    let phi = Math.max(...cellos.map((i) => Math.atan2(out[i].x, out[i].z - zc))) + W(cellos[0]) / 2 / Rb;
    const w1 = placed[0];
    if (w1) phi = Math.max(phi, w1.hi + (W(plan.basses[0]) / 2 + 0.15) / Rb);
    plan.basses.forEach((i, k) => (out[i] = at(Rb, phi + (k * W(i)) / Rb, 0)));
  }
  // the keyboards: at the back on the left, side by side, clear of every seat
  if (plan.keys.length) {
    let x0 = Infinity;
    out.forEach((p) => p && (x0 = Math.min(x0, p.x)));
    if (!Number.isFinite(x0)) x0 = 0;
    const zk = placed[0] ? zc + placed[0].R : zc + R0 + 1;
    plan.keys.forEach((i, k) => (out[i] = { x: x0 - 1.7 - k * SEAT_W.grand, z: zk, face: 0, y: 0 }));
  }
  // the risers: each raised row's arc, from halfway to the row in front (or 0.6 m ahead of it) to halfway
  // to the row behind (or 0.75 m behind it, a timpani set's depth further), 18 cm past its end seats
  const risers: Riser[] = [];
  placed.forEach((r, k) => {
    if (r.y <= 0) return;
    const prev = placed[k - 1];
    const next = placed[k + 1];
    const m = 0.18 / r.R;
    risers.push({ zc, r0: prev ? (prev.R + r.R) / 2 : r.R - 0.6, r1: next ? (r.R + next.R) / 2 : r.R + 0.75 + (r.deep ? 0.3 : 0), a0: r.lo - m, a1: r.hi + m, y: r.y });
  });
  return { places: out, risers };
}

// ---------------------------------------------------------------- a few players
/** the melodic instruments on an arc opening towards the audience (the first at the audience's left,
 *  as a quartet sits: first violin, second, viola, cello); the pianos behind. A tall, narrow stage (a
 *  phone held upright) seats them in two rows. */
function chamberPlaces(parts: SeatKind[], aspect = 2): Place[] {
  const mel = parts.map((p, i) => (p.family === 'piano' || p.family === 'percussion' ? -1 : i)).filter((i) => i >= 0);
  const kb = parts.map((p, i) => (p.family === 'piano' ? i : -1)).filter((i) => i >= 0);
  const drums = parts.map((p, i) => (p.family === 'percussion' ? i : -1)).filter((i) => i >= 0);
  const out: Place[] = new Array(parts.length);
  // one or two players with a piano stand beside it (a soloist at the piano's curve), more sit in front;
  // two pianos stand side by side, 2.5 m apart, and the players beside the one on the right
  const beside = kb.length > 0 && mel.length <= 2;
  const kbOff = (k: number) => (k - (kb.length - 1) / 2) * (kb.length > 1 ? 2.5 : 2.3);
  const right = kb.length ? kbOff(kb.length - 1) : 0;
  const rows = aspect < TALL && mel.length > 3 ? 2 : 1;
  const perRow = Math.ceil(mel.length / rows);
  // a bass is 0.3 m further from each neighbour than the 0.8 m the others keep (its lower bout is
  // 0.67 m across, a cello's 0.44), and 0.35 m upstage; a lineup without one sits as it always has
  // (a harp too: it stands a metre deep on the floor by its player)
  const isBass = (k: number) => !!parts[mel[k]]?.bass || parts[mel[k]]?.inst === 'bass' || parts[mel[k]]?.inst === 'harp';
  const BASS_GAP = 0.3;
  mel.forEach((i, k) => {
    const row = rows === 2 ? (k < perRow ? 0 : 1) : 0;
    const inRow = row === 0 ? Math.min(perRow, mel.length) : mel.length - perRow;
    const kk = row === 0 ? k : k - perRow;
    const k0 = k - kk;
    const n = inRow;
    // (the row's seats along the arc: a bass's gaps wider)
    let along = 0;
    let span = 0;
    let bassRow = false;
    for (let j = 1; j < n; j++) {
      const g = 0.8 + (isBass(k0 + j - 1) || isBass(k0 + j) ? BASS_GAP : 0);
      span += g;
      if (j <= kk) along += g;
      if (g > 0.8) bassRow = true;
    }
    // neighbours about 0.8 m apart on an arc (flatter as it grows: its ends would come at the camera)
    const spread = n > 1 ? Math.min(0.72, 0.28 + 0.12 * n) : 0;
    const R = n > 1 ? (bassRow ? span : 0.8 * (n - 1)) / (2 * spread) : 1;
    const u = n > 1 ? (bassRow ? along / span : kk / (n - 1)) : 0.5;
    const phi = -spread * (1 - 2 * u);
    const x = beside ? right + 1.75 + kk * 0.85 + (bassRow ? (along - 0.8 * kk) * (0.85 / 0.8) : 0) : R * Math.sin(phi) + (rows === 2 && row === 1 ? 0.35 : 0);
    const z = (beside ? 0.55 - kk * 0.5 : R * (Math.cos(phi) - 1) + (kb.length ? -0.35 : 0) + row * 0.95) + (isBass(k) ? 0.35 : 0);
    // each faces the arc's middle
    out[i] = { x, z, face: phi * 0.5, y: 0 };
  });
  kb.forEach((i, k) => {
    // a grand side-on, its open lid towards the audience; an upright faces them
    out[i] = { x: kbOff(k), z: mel.length > 2 ? 1.55 : 1.1, face: 0, y: 0 };
  });
  // the timpani at the back, behind the players (and the pianos), their player facing the audience: a set
  // of four drums is about 2.6 m across, two sets 3.2 m apart; alone, a set stands where a player would
  const back = (mel.length ? 1.45 : 0) + (kb.length ? 1.55 : 0);
  drums.forEach((i, k) => {
    out[i] = { x: (k - (drums.length - 1) / 2) * 3.2, z: back, face: 0, y: 0 };
  });
  return out;
}

const FAMILY = { piano: 'piano', violin: 'bowed', viola: 'bowed', cello: 'bowed', bass: 'bowed', harp: 'plucked', flute: 'wind', oboe: 'reed', clarinet: 'reed', bassoon: 'reed', horn: 'brass', trumpet: 'brass', trombone: 'brass', tuba: 'brass', timpani: 'percussion' } as const;

/** a lineup's instruments as the seating takes them */
export function seatKinds(lineup: { instrument: keyof typeof FAMILY; preset?: string }[]): SeatKind[] {
  return lineup.map((v) => {
    const kind = v.preset === 'upright' ? 'upright' : 'grand';
    return { family: FAMILY[v.instrument], kind, cello: v.instrument === 'cello' || v.instrument === 'bass', bass: v.instrument === 'bass', inst: v.instrument === 'piano' ? kind : v.instrument };
  });
}

/** each part's seat (x, z) for the sound, by the lineup's instruments (a computer's wide stage) */
export function soundSeats(lineup: { instrument: keyof typeof FAMILY; preset?: string }[]): [number, number][] {
  return seatPlaces(seatKinds(lineup)).map((p) => [p.x, p.z]);
}
