// The page's address. Every tab has a path of its own (/piano, /piano/upright, /violin, /viola,
// /cello, /bass, /harp, /flute, /oboe, /clarinet, /bassoon, /horn, /trumpet, /trombone, /tuba, /timpani, /glockenspiel, /orchestra, /symphony, /everything, /passiton, /measurements, /notes), and the Orchestra's
// carries its whole setup in a short, readable, versioned query, so the address itself is a preset; nav.ts keeps
// it in step with the page. Pure (no DOM), tested fast.
//
//   /orchestra?v=1&seats=violin,violin,viola,cello,bass
//             &lines=Violin+I~40:1,Violin+II~40:2,Viola~41:3,Cello~42:4,Contrabass~43:5
//             &keys=1.3&view=3d&expr=on
//
//   v      the format: 1 (absent: 1; any other: the setup is not read, the Orchestra opens as it was)
//   seats  the instruments on the stage, seat 1 first: a few players sit on an arc in this order (seat 1 at the
//          audience's left), five or more where an orchestra seats them (orchestra/seats.ts), each kind in this
//          order (the first half of the violins are the firsts): grand upright violin viola cello bass harp flute oboe
//          clarinet bassoon horn trumpet trombone tuba timpani glockenspiel, any of them more than once
//   lines  a file's lines in the file's order, each name~program:seats: its track name (+ for a
//          space), its General MIDI program, the seats that play it (1.3: seats 1 and 3; -: none,
//          silent); the name or the program may be left out. A file dropped in later is matched by
//          name, then program, then place (orchestra/rules.ts); with no lines, by register
//   keys   the seats the keys play (1.3), or split (absent: the piano, else the leading instrument); a 0
//          among them (keys=0, keys=0.1.3, on any address): no keys on the screen, the stage has their room.
//          On an instrument's address (one instrument, or a page: no seats to count) keys=1 (or on): the keys
//          on the screen with ui=0 too; a piano in 2D or vector lines keeps them there unasked (look.ts)
//   view   2d, vector or 3d (absent: as this device last had it)
//   expr   automatic expression, on or off (absent: as this device has it)
//   ui     0 (on any address): the stage and nothing else, for looking, listening and filming: no bar, no
//          band, no file player; no keys, but under a piano in 2D or vector lines (its strings stand over
//          them) or as keys=1 asks. What it would have pressed is asked of the page (the address sets the
//          piece up; window.__player plays it)
//
// A piece with an address of its own (orchestra/pieces.ts `path`: /symphony, "Toward Morning";
// /everything, "Everything So Far"; /passiton, "Pass It On") stands for its orchestra and its routing, with the piece loaded:
// /symphony?view=3d. It is written so for as long as the piece is on its own orchestra as it came;
// reorganised, the address is the Orchestra's.
//
// An instrument's path carries ?view= too when the stage is not the plain 2D one. Old addresses still
// open where they did: #/, #/notes, #/measurements (and #/play, #/inside), ?style=vector. Anything
// that cannot be read is left out, never an error; parameters that are not the app's are kept.

import { INSTRUMENT_IDS, type InstrumentId } from '@piano-model/engine';
import { MAX_SEATS, VOICES, type Voice } from './orchestra/assign.ts';
import { PIECES, type Piece } from './orchestra/pieces.ts';
import type { LineRule, Setup } from './orchestra/rules.ts';

export type Page = 'stage' | 'measurements' | 'notes';
/** the stage's look: 2D as drawn, 2D in vector lines, 3D */
export type Look = '2d' | 'vector' | '3d';
export const LOOKS: Look[] = ['2d', 'vector', '3d'];
/** the Orchestra's address format */
export const FORMAT = 1;

export interface Address {
  page: Page;
  /** the stage's single instrument (null: the one this device last had) */
  instrument: InstrumentId | null;
  /** the piano's kind (null: as it is) */
  preset: 'grand' | 'upright' | null;
  /** the stage's Orchestra (seats empty: the one it last had, or the quartet) */
  orchestra: Setup | null;
  /** the built-in piece loaded on it (its id), when that piece has an address of its own */
  piece: string | null;
  look: Look | null;
  expr: boolean | null;
  /** no keys on the screen (keys=0): the stage takes the room of the fallboard and the keyboard */
  keysOff: boolean;
  /** the keys on the screen with ui=0 too (keys=1 on an instrument's address; on the Orchestra's, 1 is a seat) */
  keysOn: boolean;
  /** the stage and nothing else (ui=0): no bar, no band, no file player; the keys only where look.ts has them */
  uiOff: boolean;
  /** the address's other parameters, as written (?debug) */
  rest: string[];
}

export const emptyAddress = (): Address => ({ page: 'stage', instrument: null, preset: null, orchestra: null, piece: null, look: null, expr: null, keysOff: false, keysOn: false, uiOff: false, rest: [] });

/** the most of anything an address is read for (a longer one is cut there) */
const MAX_LINES = 128;
const MAX_NAME = 80;

/** a query's parts as written (`k=v`, the key decoded, the value raw) */
function splitQuery(q: string): [string, string, string][] {
  return q
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf('=');
      return [dec(i < 0 ? s : s.slice(0, i)), i < 0 ? '' : s.slice(i + 1), s];
    });
}
/** a value decoded ("+" is a space); one that cannot be is left as written */
function dec(s: string): string {
  const t = s.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}
/** a name written into a value: readable ("+" for a space), with the characters the lines use to
 *  part it (, ~ : and parentheses, which a Markdown link would end on) escaped */
export function encName(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/[~()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** every instrument's path and its aliases (vercel.json rewrites each of them to the page: a test keeps
 *  the two in step) */
export const INSTRUMENT_PATHS: Record<string, [InstrumentId, ('grand' | 'upright')?]> = {
  piano: ['piano', 'grand'],
  grand: ['piano', 'grand'],
  upright: ['piano', 'upright'],
  'double-bass': ['bass'],
  contrabass: ['bass'],
  'french-horn': ['horn'],
  kettledrums: ['timpani'],
  glock: ['glockenspiel'],
};
for (const id of INSTRUMENT_IDS) INSTRUMENT_PATHS[id] ??= [id];

/** the pieces with a path of their own, by that path (/symphony, /everything, /passiton; vercel.json rewrites each to the page) */
export const PIECE_PATHS: Record<string, Piece> = Object.fromEntries(PIECES.filter((p) => p.path).map((p) => [p.path!, p]));
/** a piece's own orchestra: its instruments, one to a seat, in its order */
const pieceSeats = (p: Piece): Voice[] => p.parts.map((q) => q.voice);
/** Is a setup a piece's own, as the piece comes: its seats, and its lines each on the seats the piece
 *  gives them (no lines yet: the piece is still on its way)? The keys are the page's, not the piece's. */
export function ownSetup(s: Setup, p: Piece): boolean {
  const seats = pieceSeats(p);
  if (s.seats.length !== seats.length || s.seats.some((v, k) => v !== seats[k])) return false;
  if (!s.lines) return true;
  const n = Math.max(...p.parts.flatMap((q) => q.lines)) + 1;
  if (s.lines.length !== n) return false;
  return s.lines.every((r, i) => {
    const want = p.parts.flatMap((q, k) => (q.lines.includes(i) ? [k] : []));
    return r.seats.length === want.length && r.seats.every((k, j) => k === want[j]);
  });
}

/** seats as written (1-based, "1.3") into the lineup's indices: `at` maps a seat number to where
 *  it now is (−1: a seat that was left out) */
const seatList = (s: string, at: number[]): number[] =>
  [
    ...new Set(
      s
        .split(/[.,]/)
        .map((x) => (/^\d{1,3}$/.test(x.trim()) ? at[Number(x) - 1] ?? -1 : -1))
        .filter((k) => k >= 0),
    ),
  ].sort((a, b) => a - b);

function parseLines(raw: string, at: number[]): LineRule[] {
  return raw
    .split(',')
    .slice(0, MAX_LINES)
    .map((e) => {
      const c = e.indexOf(':');
      const head = c < 0 ? e : e.slice(0, c);
      const t = head.indexOf('~');
      const p = t < 0 ? '' : head.slice(t + 1);
      const program = /^\d{1,3}$/.test(p) && Number(p) <= 127 ? Number(p) : -1;
      return { name: dec(t < 0 ? head : head.slice(0, t)).trim().slice(0, MAX_NAME), program, seats: c < 0 ? [] : seatList(e.slice(c + 1), at) };
    });
}

/** read an address (its path, query and hash) */
export function parseAddress(path: string, search: string, hash = ''): Address {
  const a = emptyAddress();
  // an old address: #/notes, #/measurements?style=vector
  const old = /^#\/([a-z-]*)(?:\?(.*))?$/i.exec(hash);
  const segs = path
    .replace(/\/index\.html$/, '/')
    .split('/')
    .filter(Boolean)
    .map((s) => dec(s).toLowerCase());
  const [route, sub] = old ? [old[1].toLowerCase(), ''] : [segs[0] ?? '', segs[1] ?? ''];
  if (route === 'measurements' || route === 'notes') a.page = route;
  else if (route === 'orchestra' || route === 'ensemble') a.orchestra = { seats: [], lines: null, keys: null };
  else if (PIECE_PATHS[route]) {
    // a piece's address: its orchestra (the lines are the piece's own, set when it has loaded)
    a.piece = PIECE_PATHS[route].id;
    a.orchestra = { seats: pieceSeats(PIECE_PATHS[route]), lines: null, keys: null };
  }
  else if (INSTRUMENT_PATHS[route]) {
    const [id, preset] = INSTRUMENT_PATHS[route];
    a.instrument = id;
    a.preset = id === 'piano' ? (sub === 'upright' ? 'upright' : sub === 'grand' ? 'grand' : (preset ?? null)) : null;
  }
  const q = [...splitQuery(search), ...splitQuery(old?.[2] ?? '')];
  const get = (k: string) => q.find((x) => x[0] === k)?.[1];
  const mine = new Set(['v', 'seats', 'lines', 'keys', 'view', 'style', 'expr', 'ui']);
  a.rest = q.filter((x) => !mine.has(x[0])).map((x) => x[2]);
  const view = dec(get('view') ?? '').toLowerCase();
  const style = dec(get('style') ?? '').toLowerCase();
  a.look = (LOOKS as string[]).includes(view) ? (view as Look) : style === 'vector' ? 'vector' : style === 'classic' ? '2d' : null;
  const expr = dec(get('expr') ?? '').toLowerCase();
  a.expr = expr === 'on' || expr === '1' ? true : expr === 'off' || expr === '0' ? false : null;
  // keys: a 0 among the seats hides the keys on the screen (seats count from 1), on any address
  const keyParts = dec(get('keys') ?? '')
    .toLowerCase()
    .split(/[.,]/)
    .map((x) => x.trim())
    .filter(Boolean);
  a.keysOff = keyParts.includes('0');
  // (keys=1 on an instrument's address or a page's: the Orchestra's and a piece's count their seats from 1)
  a.keysOn = !a.keysOff && !a.orchestra && keyParts.some((x) => x === '1' || x === 'on');
  a.uiOff = ['0', 'off'].includes(dec(get('ui') ?? '').trim().toLowerCase());
  const keys = keyParts.filter((x) => x !== '0').join('.');
  const v = get('v');
  if (a.orchestra && a.piece) {
    // (its seats are the piece's; the keys may still be chosen)
    const ks = keys === 'split' ? 'split' : seatList(keys, a.orchestra.seats.map((_, k) => k));
    a.orchestra.keys = ks.length ? ks : null;
  } else if (a.orchestra && (v === undefined || v === String(FORMAT))) {
    const at: number[] = [];
    const seats: Voice[] = [];
    for (const s of (get('seats') ?? '').split(',').slice(0, MAX_SEATS)) {
      const voice = dec(s).trim().toLowerCase() as Voice;
      at.push(VOICES.includes(voice) ? seats.push(voice) - 1 : -1);
    }
    const lines = get('lines');
    const ks = keys === 'split' ? 'split' : seatList(keys, at);
    a.orchestra = { seats, lines: seats.length && lines ? parseLines(lines, at) : null, keys: seats.length && ks.length ? ks : null };
  }
  return a;
}

/** a line as written in the address */
const formatLine = (r: LineRule): string => `${encName(r.name)}${r.program >= 0 ? `~${r.program}` : ''}:${r.seats.length ? r.seats.map((k) => k + 1).join('.') : '-'}`;

/** the address (path and query) for a state of the page */
export function formatAddress(a: Address): string {
  let path = '/';
  const q: string[] = [];
  /** the keys: 0 (none on the screen: kept on every page, the stage comes back as it was), then an Orchestra's
   *  seats; or 1 (on the screen with ui=0 too), where no seats are counted */
  const keys: string[] = a.keysOff ? ['0'] : a.keysOn && !(a.page === 'stage' && a.orchestra) ? ['1'] : [];
  if (a.page !== 'stage') path = `/${a.page}`;
  else if (a.orchestra) {
    path = '/orchestra';
    const s = a.orchestra;
    const own = PIECES.find((p) => p.path && p.id === a.piece && ownSetup(s, p));
    // (a piece on its own orchestra as it came: its short address stands for the seats and the lines)
    if (own) path = `/${own.path}`;
    else if (s.seats.length) {
      q.push(`v=${FORMAT}`, `seats=${s.seats.join(',')}`);
      if (s.lines?.length) q.push(`lines=${s.lines.map(formatLine).join(',')}`);
    }
    if (s.seats.length && s.keys) keys.push(s.keys === 'split' ? 'split' : s.keys.map((k) => k + 1).join('.'));
  } else if (a.instrument) path = a.instrument === 'piano' && a.preset === 'upright' ? '/piano/upright' : `/${a.instrument}`;
  if (keys.length) q.push(`keys=${keys.join('.')}`);
  if (a.page === 'stage') {
    // (an instrument's address shows the look only when it is not the plain stage; the Orchestra's
    // always, as it does the expression: a setup is all there)
    if (a.look && (a.orchestra || a.look !== '2d')) q.push(`view=${a.look}`);
    if (a.orchestra && a.expr !== null) q.push(`expr=${a.expr ? 'on' : 'off'}`);
  }
  if (a.uiOff) q.push('ui=0');
  q.push(...a.rest);
  return q.length ? `${path}?${q.join('&')}` : path;
}

/** the tab an address is on: a new tab is a new entry in the history, the rest rewrites the entry */
export const tabOf = (a: Address): string =>
  a.page !== 'stage' ? a.page : a.orchestra ? 'orchestra' : a.instrument === 'piano' ? `piano/${a.preset ?? 'grand'}` : (a.instrument ?? '');

/** the Orchestra's setup as written (to compare two) */
export const setupKey = (s: Setup | null): string => (s ? formatAddress({ ...emptyAddress(), orchestra: s }) : '');
