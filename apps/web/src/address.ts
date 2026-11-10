// The page's address. Every tab has a path of its own (/piano, /piano/upright, /violin, /viola,
// /cello, /bass, /flute, /oboe, /clarinet, /bassoon, /horn, /trumpet, /orchestra, /measurements, /notes), and the Orchestra's
// carries its whole setup in a short, readable, versioned query, so the address itself is a preset; nav.ts keeps
// it in step with the page. Pure (no DOM), tested fast.
//
//   /orchestra?v=1&seats=violin,violin,viola,cello,bass
//             &lines=Violin+I~40:1,Violin+II~40:2,Viola~41:3,Cello~42:4,Contrabass~43:5
//             &keys=1.3&view=3d&expr=on
//
//   v      the format: 1 (absent: 1; any other: the setup is not read, the Orchestra opens as it was)
//   seats  the instruments on the stage in seating order, seat 1 first (the audience's left):
//          grand upright violin viola cello bass flute oboe clarinet bassoon horn trumpet, any of them more
//          than once
//   lines  a file's lines in the file's order, each name~program:seats: its track name (+ for a
//          space), its General MIDI program, the seats that play it (1.3: seats 1 and 3; -: none,
//          silent); the name or the program may be left out. A file dropped in later is matched by
//          name, then program, then place (orchestra/rules.ts); with no lines, by register
//   keys   the seats the keys play (1.3), or split (absent: the piano, else the leading instrument)
//   view   2d, vector or 3d (absent: as this device last had it)
//   expr   automatic expression, on or off (absent: as this device has it)
//
// An instrument's path carries ?view= too when the stage is not the plain 2D one. Old addresses still
// open where they did: #/, #/notes, #/measurements (and #/play, #/inside), ?style=vector. Anything
// that cannot be read is left out, never an error; parameters that are not the app's are kept.

import { INSTRUMENT_IDS, type InstrumentId } from '@piano-model/engine';
import { VOICES, type Voice } from './orchestra/assign.ts';
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
  look: Look | null;
  expr: boolean | null;
  /** the address's other parameters, as written (?debug) */
  rest: string[];
}

export const emptyAddress = (): Address => ({ page: 'stage', instrument: null, preset: null, orchestra: null, look: null, expr: null, rest: [] });

/** the most of anything an address is read for (a longer one is cut there) */
const MAX_SEATS = 16;
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
};
for (const id of INSTRUMENT_IDS) INSTRUMENT_PATHS[id] ??= [id];

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
  else if (INSTRUMENT_PATHS[route]) {
    const [id, preset] = INSTRUMENT_PATHS[route];
    a.instrument = id;
    a.preset = id === 'piano' ? (sub === 'upright' ? 'upright' : sub === 'grand' ? 'grand' : (preset ?? null)) : null;
  }
  const q = [...splitQuery(search), ...splitQuery(old?.[2] ?? '')];
  const get = (k: string) => q.find((x) => x[0] === k)?.[1];
  const mine = new Set(['v', 'seats', 'lines', 'keys', 'view', 'style', 'expr']);
  a.rest = q.filter((x) => !mine.has(x[0])).map((x) => x[2]);
  const view = dec(get('view') ?? '').toLowerCase();
  const style = dec(get('style') ?? '').toLowerCase();
  a.look = (LOOKS as string[]).includes(view) ? (view as Look) : style === 'vector' ? 'vector' : style === 'classic' ? '2d' : null;
  const expr = dec(get('expr') ?? '').toLowerCase();
  a.expr = expr === 'on' || expr === '1' ? true : expr === 'off' || expr === '0' ? false : null;
  const v = get('v');
  if (a.orchestra && (v === undefined || v === String(FORMAT))) {
    const at: number[] = [];
    const seats: Voice[] = [];
    for (const s of (get('seats') ?? '').split(',').slice(0, MAX_SEATS)) {
      const voice = dec(s).trim().toLowerCase() as Voice;
      at.push(VOICES.includes(voice) ? seats.push(voice) - 1 : -1);
    }
    const lines = get('lines');
    const keys = dec(get('keys') ?? '').trim().toLowerCase();
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
  if (a.page !== 'stage') path = `/${a.page}`;
  else if (a.orchestra) {
    path = '/orchestra';
    const s = a.orchestra;
    if (s.seats.length) {
      q.push(`v=${FORMAT}`, `seats=${s.seats.join(',')}`);
      if (s.lines?.length) q.push(`lines=${s.lines.map(formatLine).join(',')}`);
      if (s.keys) q.push(`keys=${s.keys === 'split' ? 'split' : s.keys.map((k) => k + 1).join('.')}`);
    }
  } else if (a.instrument) path = a.instrument === 'piano' && a.preset === 'upright' ? '/piano/upright' : `/${a.instrument}`;
  if (a.page === 'stage') {
    // (an instrument's address shows the look only when it is not the plain stage; the Orchestra's
    // always, as it does the expression: a setup is all there)
    if (a.look && (a.orchestra || a.look !== '2d')) q.push(`view=${a.look}`);
    if (a.orchestra && a.expr !== null) q.push(`expr=${a.expr ? 'on' : 'off'}`);
  }
  q.push(...a.rest);
  return q.length ? `${path}?${q.join('&')}` : path;
}

/** the tab an address is on: a new tab is a new entry in the history, the rest rewrites the entry */
export const tabOf = (a: Address): string =>
  a.page !== 'stage' ? a.page : a.orchestra ? 'orchestra' : a.instrument === 'piano' ? `piano/${a.preset ?? 'grand'}` : (a.instrument ?? '');

/** the Orchestra's setup as written (to compare two) */
export const setupKey = (s: Setup | null): string => (s ? formatAddress({ ...emptyAddress(), orchestra: s }) : '');
