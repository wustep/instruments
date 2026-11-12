// The page's address (address.ts): every tab its own path, the Orchestra's setup in a short, readable,
// versioned query that round-trips, old addresses still opening where they did, and anything that
// cannot be read left out rather than failing.
import { describe, expect, it } from 'vitest';
import { emptyAddress, formatAddress, ownSetup, parseAddress, PIECE_PATHS, tabOf, type Address } from '../src/address.ts';
import type { LineRule } from '../src/orchestra/rules.ts';
import { ELEVEN, QUINTET, THIRTEEN } from './presets.ts';

const at = (url: string, hash = '') => {
  const u = new URL(url, 'https://instruments-wustep.vercel.app');
  return parseAddress(u.pathname, u.search, hash || u.hash);
};

describe('the address', () => {
  it('round-trips an Orchestra setup: duplicates, many to many, by name, program or place, silent lines, the keys, the look, the expression', () => {
    const a: Address = {
      ...emptyAddress(),
      orchestra: {
        seats: ['flute', 'violin', 'violin', 'viola', 'cello', 'cello', 'bass', 'grand'],
        lines: [
          { name: 'Violin I', program: 40, seats: [1] },
          // (the tune doubled on the flute)
          { name: 'Violin II', program: 40, seats: [0, 2] },
          { name: '', program: 41, seats: [3] },
          // a line known only by its place, on both cellos
          { name: '', program: -1, seats: [4, 5] },
          { name: 'Contrabass', program: 43, seats: [6] },
          // the characters the format uses, in a name
          { name: 'Piano, r.h. (8va) ~ 1:2 + ½', program: 0, seats: [7] },
          { name: 'Oboe', program: 68, seats: [] },
        ],
        keys: [0, 7],
      },
      look: '3d',
      expr: false,
      rest: ['debug'],
    };
    const url = formatAddress(a);
    expect(url).toBe(
      '/orchestra?v=1&seats=flute,violin,violin,viola,cello,cello,bass,grand' +
        '&lines=Violin+I~40:2,Violin+II~40:1.3,~41:4,:5.6,Contrabass~43:7,Piano%2C+r.h.+%288va%29+%7E+1%3A2+%2B+%C2%BD~0:8,Oboe~68:-' +
        '&keys=1.8&view=3d&expr=off&debug',
    );
    expect(at(url)).toEqual(a);
    // the split keys too
    const b: Address = { ...a, orchestra: { ...a.orchestra!, keys: 'split' } };
    expect(at(formatAddress(b))).toEqual(b);
  });

  it('the horn: /horn and /french-horn open it; four horns seated and routed by name in the Orchestra round-trip', () => {
    for (const path of ['/horn', '/french-horn']) expect(at(path).instrument, path).toBe('horn');
    expect(formatAddress({ ...emptyAddress(), instrument: 'horn' })).toBe('/horn');
    const a: Address = {
      ...emptyAddress(),
      orchestra: {
        seats: ['horn', 'horn', 'horn', 'horn', 'violin', 'viola', 'cello'],
        lines: [
          { name: 'Corno I in Es', program: 60, seats: [0, 2] },
          { name: 'Corno II in Es', program: 60, seats: [1, 3] },
          { name: 'Violino', program: 40, seats: [4] },
          { name: 'Viola', program: 41, seats: [5] },
          { name: 'Basso', program: 42, seats: [6] },
        ],
        keys: null,
      },
    };
    const url = formatAddress(a);
    expect(url).toContain('seats=horn,horn,horn,horn,violin,viola,cello');
    expect(at(url)).toEqual(a);
  });

  it('the quintet preset reads as five seats, each line on its own by name and program', () => {
    const a = at(QUINTET);
    expect(a.page).toBe('stage');
    expect(a.orchestra).toEqual({
      seats: ['violin', 'violin', 'viola', 'cello', 'bass'],
      lines: [
        { name: 'Violin I', program: 40, seats: [0] },
        { name: 'Violin II', program: 40, seats: [1] },
        { name: 'Viola', program: 41, seats: [2] },
        { name: 'Cello', program: 42, seats: [3] },
        { name: 'Contrabass', program: 43, seats: [4] },
      ],
      keys: null,
    });
    // (the look and the expression are left to the device)
    expect([a.look, a.expr]).toEqual([null, null]);
    expect(formatAddress(a)).toBe(QUINTET);
  });

  it('every tab has a path: the instruments, the piano’s kind, the Orchestra, the measurements, the notes', () => {
    for (const id of ['violin', 'viola', 'cello', 'bass', 'flute', 'trumpet'] as const) {
      const a = at(`/${id}`);
      expect([a.page, a.instrument, a.preset]).toEqual(['stage', id, null]);
      expect(formatAddress(a)).toBe(`/${id}`);
    }
    expect(at('/piano')).toMatchObject({ instrument: 'piano', preset: 'grand' });
    expect(at('/piano/upright')).toMatchObject({ instrument: 'piano', preset: 'upright' });
    expect(formatAddress(at('/piano/upright'))).toBe('/piano/upright');
    expect(formatAddress(at('/upright'))).toBe('/piano/upright');
    expect(at('/orchestra').orchestra).toEqual({ seats: [], lines: null, keys: null });
    expect(at('/measurements').page).toBe('measurements');
    expect(at('/notes/').page).toBe('notes');
    // the home page: the instrument this device last had
    expect(at('/')).toMatchObject({ page: 'stage', instrument: null, orchestra: null });
    // tabs: a change of any of these is a new entry in the history
    expect(['/violin', '/piano', '/piano/upright', QUINTET, '/notes'].map((u) => tabOf(at(u)))).toEqual(['violin', 'piano/grand', 'piano/upright', 'orchestra', 'notes']);
  });

  it('an instrument’s address shows the look only when it is not the plain stage; the pages none', () => {
    expect(formatAddress({ ...emptyAddress(), instrument: 'cello', look: '2d' })).toBe('/cello');
    expect(formatAddress({ ...emptyAddress(), instrument: 'cello', look: 'vector', expr: true })).toBe('/cello?view=vector');
    expect(formatAddress({ ...emptyAddress(), page: 'notes', instrument: 'cello', look: '3d' })).toBe('/notes');
    expect(at('/flute?view=3d').look).toBe('3d');
  });

  it('old addresses open where they did: #/notes, #/measurements, #/, #/play, #/inside, ?style=', () => {
    expect(at('/', '#/notes').page).toBe('notes');
    expect(at('/', '#/measurements?style=vector')).toMatchObject({ page: 'measurements', look: 'vector' });
    for (const h of ['#/', '#/play', '#/inside']) expect(at('/', h)).toMatchObject({ page: 'stage', instrument: null });
    expect(at('/?style=vector').look).toBe('vector');
    expect(at('/', '#/?style=classic').look).toBe('2d');
    expect(formatAddress({ ...at('/?style=vector'), instrument: 'piano', preset: 'grand' })).toBe('/piano?view=vector');
    // (a hash that is not an old route is not one)
    expect(at('/violin', '#top').instrument).toBe('violin');
  });

  it('keeps parameters that are not the app’s, and leaves out what it cannot read', () => {
    expect(at('/violin?debug&utm_source=x%20y').rest).toEqual(['debug', 'utm_source=x%20y']);
    expect(formatAddress(at('/?debug'))).toBe('/?debug');
    // an unknown instrument is left out (the seats after it keep their numbers), seat numbers past
    // the stage and malformed ones are dropped, a program out of range is none
    const a = at('/orchestra?seats=violin,kazoo,cello&lines=A:1.2.9,B~999:x,%E0%A4%A:3,~42&keys=0.2.7&view=4d&expr=maybe');
    expect(a.orchestra).toEqual({
      seats: ['violin', 'cello'],
      lines: [
        { name: 'A', program: -1, seats: [0] },
        { name: 'B', program: -1, seats: [] },
        { name: '%E0%A4%A', program: -1, seats: [1] },
        { name: '', program: 42, seats: [] },
      ],
      keys: null,
    });
    expect([a.look, a.expr]).toEqual([null, null]);
    // another format: the Orchestra opens as it was
    expect(at('/orchestra?v=2&seats=violin&lines=x:1').orchestra).toEqual({ seats: [], lines: null, keys: null });
    // the Orchestra's parameters on an instrument's address mean nothing there
    expect(formatAddress(at('/violin?seats=cello&lines=A:1'))).toBe('/violin');
    // a path it does not know: the stage
    expect(at('/kazoo/x')).toMatchObject({ page: 'stage', instrument: null, orchestra: null });
    // nothing throws, whatever comes
    const junk = ['%', '%%', '=&=&', '?seats=,,,&lines=:::,~~~,', '?v=&seats=%ZZ', `?lines=${'a:1,'.repeat(500)}`, '?keys=split.1', '?seats=violin&keys=1e9'];
    for (const j of junk) expect(() => formatAddress(at(`/orchestra${j.startsWith('?') ? j : `?${j}`}`))).not.toThrow();
    expect(at(`/orchestra?seats=violin&lines=${'a:1,'.repeat(500)}`).orchestra!.lines!.length).toBe(128);
  });
});

describe('a piece’s own address: /symphony', () => {
  const tm = PIECE_PATHS.symphony;
  const seats = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass'];
  /** the piece's lines as the ensemble knows them once its file is loaded: each on its own seat */
  const lines: LineRule[] = ['Flute~73', 'Oboe~68', 'Clarinet~71', 'Bassoon~70', 'Horn~60', 'Trumpet~56', 'Trombone~57', 'Timpani~47', 'Violin I~40', 'Violin II~40', 'Viola~41', 'Cello~42', 'Double Bass~43'].map((x, i) => ({ name: x.split('~')[0], program: Number(x.split('~')[1]), seats: [i] }));

  it('opens Toward Morning’s orchestra, thirteen seats, with the piece named; the look, the expression and the keys are still the address’s', () => {
    expect(tm.id).toBe('toward-morning');
    const a = at('/symphony');
    expect(a).toEqual({ ...emptyAddress(), piece: 'toward-morning', orchestra: { seats, lines: null, keys: null } });
    expect(tabOf(a)).toBe('orchestra');
    // as loosely as any path: a capital, a slash after it
    expect(at('/Symphony/')).toEqual(a);
    const b = at('/symphony?view=3d&expr=off&keys=9.10&debug');
    expect(b).toEqual({ ...a, look: '3d', expr: false, orchestra: { seats, lines: null, keys: [8, 9] }, rest: ['debug'] });
    expect(formatAddress(b)).toBe('/symphony?keys=9.10&view=3d&expr=off&debug');
    // seats in its query are not read: the address is the piece's orchestra
    expect(at('/symphony?v=1&seats=violin,cello').orchestra!.seats).toEqual(seats);
    // an Orchestra address names no piece
    expect(at('/orchestra').piece).toBe(null);
    expect(at(THIRTEEN).piece).toBe(null);
  });

  it('is written for as long as the piece is on its own orchestra as it came: before its file has come, once loaded, with the keys chosen; reorganised, the Orchestra’s own address', () => {
    const own = (o: Partial<Address> = {}): Address => ({ ...emptyAddress(), piece: 'toward-morning', orchestra: { seats: seats as never, lines: null, keys: null }, ...o });
    expect(formatAddress(own())).toBe('/symphony');
    expect(formatAddress(own({ orchestra: { seats: seats as never, lines, keys: null }, look: '2d', expr: true }))).toBe('/symphony?view=2d&expr=on');
    expect(formatAddress(own({ orchestra: { seats: seats as never, lines, keys: 'split' } }))).toBe('/symphony?keys=split');
    expect(ownSetup({ seats: seats as never, lines, keys: [0] }, tm)).toBe(true);
    // the same orchestra with no piece, or another's: the Orchestra's address (it is THIRTEEN, the preset)
    const general = formatAddress({ ...own({ orchestra: { seats: seats as never, lines, keys: null } }), piece: null });
    expect(general).toBe(THIRTEEN);
    expect(formatAddress({ ...own({ orchestra: { seats: seats as never, lines, keys: null } }), piece: 'beethoven5-i' })).toBe(THIRTEEN);
    // a line moved to another seat, a line silenced, an instrument off the stage: no longer the piece's own
    const moved = lines.map((r, i) => (i === 0 ? { ...r, seats: [1] } : r));
    expect(formatAddress(own({ orchestra: { seats: seats as never, lines: moved, keys: null } }))).toMatch(/^\/orchestra\?v=1&seats=flute,oboe,.*&lines=Flute~73:2,/);
    const silent = lines.map((r, i) => (i === 7 ? { ...r, seats: [] } : r));
    expect(formatAddress(own({ orchestra: { seats: seats as never, lines: silent, keys: null } }))).toMatch(/Timpani~47:-/);
    expect(formatAddress(own({ orchestra: { seats: seats.slice(0, 12) as never, lines: null, keys: null } }))).toBe(`/orchestra?v=1&seats=${seats.slice(0, 12).join(',')}`);
    expect(ownSetup({ seats: [...seats.slice(1), 'flute'] as never, lines: null, keys: null }, tm)).toBe(false);
    expect(ownSetup({ seats: seats as never, lines: lines.slice(0, 12), keys: null }, tm)).toBe(false);
  });
});

describe('a piece’s own address: /everything', () => {
  const es = PIECE_PATHS.everything;
  const seats = ['flute', 'clarinet', 'horn', 'glockenspiel', 'harp', 'grand', 'violin', 'violin', 'viola', 'cello', 'bass'];
  /** the piece's lines as the ensemble knows them once its file is loaded: each on its own seat */
  const lines: LineRule[] = ['Flute~73', 'Clarinet~71', 'Horn~60', 'Glockenspiel~9', 'Harp~46', 'Grand Piano~0', 'Violin I~40', 'Violin II~40', 'Viola~41', 'Cello~42', 'Double Bass~43'].map((x, i) => ({ name: x.split('~')[0], program: Number(x.split('~')[1]), seats: [i] }));

  it('opens Everything So Far’s orchestra, eleven seats, with the piece named; the look, the expression and the keys are still the address’s', () => {
    expect(es.id).toBe('everything-so-far');
    const a = at('/everything');
    expect(a).toEqual({ ...emptyAddress(), piece: 'everything-so-far', orchestra: { seats, lines: null, keys: null } });
    expect(tabOf(a)).toBe('orchestra');
    expect(at('/Everything/')).toEqual(a);
    const b = at('/everything?view=3d&expr=off&keys=6&debug');
    expect(b).toEqual({ ...a, look: '3d', expr: false, orchestra: { seats, lines: null, keys: [5] }, rest: ['debug'] });
    expect(formatAddress(b)).toBe('/everything?keys=6&view=3d&expr=off&debug');
    // seats in its query are not read: the address is the piece's orchestra
    expect(at('/everything?v=1&seats=violin,cello').orchestra!.seats).toEqual(seats);
    // the other piece's address is still its own
    expect(at('/symphony').piece).toBe('toward-morning');
    expect(at(ELEVEN).piece).toBe(null);
  });

  it('is written for as long as the piece is on its own orchestra as it came; reorganised, the Orchestra’s own address', () => {
    const own = (o: Partial<Address> = {}): Address => ({ ...emptyAddress(), piece: 'everything-so-far', orchestra: { seats: seats as never, lines: null, keys: null }, ...o });
    expect(formatAddress(own())).toBe('/everything');
    expect(formatAddress(own({ orchestra: { seats: seats as never, lines, keys: null }, look: '2d', expr: true }))).toBe('/everything?view=2d&expr=on');
    expect(formatAddress(own({ orchestra: { seats: seats as never, lines, keys: 'split' } }))).toBe('/everything?keys=split');
    expect(ownSetup({ seats: seats as never, lines, keys: [5] }, es)).toBe(true);
    // the same orchestra with no piece, or another's: the Orchestra's address (it is ELEVEN, the preset)
    expect(formatAddress({ ...own({ orchestra: { seats: seats as never, lines, keys: null } }), piece: null })).toBe(ELEVEN);
    expect(formatAddress({ ...own({ orchestra: { seats: seats as never, lines, keys: null } }), piece: 'toward-morning' })).toBe(ELEVEN);
    // a line moved to another seat, a line silenced, an instrument off the stage: no longer the piece's own
    const moved = lines.map((r, i) => (i === 0 ? { ...r, seats: [1] } : r));
    expect(formatAddress(own({ orchestra: { seats: seats as never, lines: moved, keys: null } }))).toMatch(/^\/orchestra\?v=1&seats=flute,clarinet,.*&lines=Flute~73:2,/);
    const silent = lines.map((r, i) => (i === 3 ? { ...r, seats: [] } : r));
    expect(formatAddress(own({ orchestra: { seats: seats as never, lines: silent, keys: null } }))).toMatch(/Glockenspiel~9:-/);
    expect(formatAddress(own({ orchestra: { seats: seats.slice(0, 10) as never, lines: null, keys: null } }))).toBe(`/orchestra?v=1&seats=${seats.slice(0, 10).join(',')}`);
    expect(ownSetup({ seats: [...seats.slice(1), 'flute'] as never, lines: null, keys: null }, es)).toBe(false);
    expect(ownSetup({ seats: seats as never, lines: lines.slice(0, 10), keys: null }, es)).toBe(false);
    // Toward Morning's thirteen are not this piece's orchestra
    expect(ownSetup({ seats: PIECE_PATHS.symphony.parts.map((q) => q.voice), lines: null, keys: null }, es)).toBe(false);
  });
});

// Two parameters no control sets (look.ts): keys=0, no keys on the screen; ui=0, the stage and nothing
// else. Each is read on any address and written back on every one, so the page keeps it as it goes.
describe('keys=0 and ui=0: less of the page round the stage', () => {
  it('keys=0 on an instrument, the Orchestra, a piece and a page; with the look, in either order', () => {
    expect(at('/piano').keysOff).toBe(false);
    for (const url of ['/piano?keys=0', '/violin?view=3d&keys=0', '/symphony?view=3d&keys=0', '/symphony?keys=0&view=3d', '/orchestra?keys=0', '/notes?keys=0', '/?keys=0']) expect(at(url).keysOff, url).toBe(true);
    expect(formatAddress(at('/piano?keys=0'))).toBe('/piano?keys=0');
    expect(formatAddress(at('/piano/upright?view=3d&keys=0'))).toBe('/piano/upright?keys=0&view=3d');
    expect(formatAddress(at('/violin?view=vector&keys=0'))).toBe('/violin?keys=0&view=vector');
    expect(formatAddress(at('/notes?keys=0'))).toBe('/notes?keys=0');
    // (a piece's own address stays its own)
    const sym = at('/symphony?view=3d&keys=0');
    expect(sym.piece).toBe('toward-morning');
    expect(sym.orchestra?.keys).toBeNull();
    expect(formatAddress(sym)).toBe('/symphony?keys=0&view=3d');
    // the address is not the app's parameter left over: it is read, not kept as written
    expect(at('/piano?keys=0').rest).toEqual([]);
  });

  it('the Orchestra’s keys are still chosen beside it: a 0 among the seats (they count from 1)', () => {
    const a = at(`${QUINTET}&keys=0.1.3`);
    expect(a.keysOff).toBe(true);
    expect(a.orchestra?.keys).toEqual([0, 2]);
    expect(formatAddress(a).endsWith('&keys=0.1.3')).toBe(true);
    const split = at('/orchestra?v=1&seats=violin,cello&keys=0.split');
    expect(split.keysOff).toBe(true);
    expect(split.orchestra?.keys).toBe('split');
    expect(formatAddress(split)).toBe('/orchestra?v=1&seats=violin,cello&keys=0.split');
    // without the 0 the keys are on the screen, as ever
    const shown = at(`${QUINTET}&keys=1.3`);
    expect(shown.keysOff).toBe(false);
    expect(shown.orchestra?.keys).toEqual([0, 2]);
    expect(formatAddress(shown)).not.toContain('keys=0');
    // a piece's address, its keys chosen
    const sym = at('/symphony?keys=0.9');
    expect(sym.keysOff).toBe(true);
    expect(sym.orchestra?.keys).toEqual([8]);
    expect(formatAddress(sym)).toBe('/symphony?keys=0.9');
  });

  it('ui=0 on any address, beside every other parameter; anything else is not it', () => {
    for (const url of ['/piano?ui=0', '/symphony?view=3d&ui=0', '/orchestra?ui=off', '/notes?ui=0']) expect(at(url).uiOff, url).toBe(true);
    for (const url of ['/piano', '/piano?ui=1', '/piano?ui=', '/piano?ui=on']) expect(at(url).uiOff, url).toBe(false);
    expect(formatAddress(at('/symphony?view=3d&ui=0'))).toBe('/symphony?view=3d&ui=0');
    expect(formatAddress(at('/symphony?ui=0&view=3d&expr=off'))).toBe('/symphony?view=3d&expr=off&ui=0');
    expect(formatAddress(at('/piano/upright?ui=0&view=3d&debug'))).toBe('/piano/upright?view=3d&ui=0&debug');
    expect(formatAddress(at('/cello?ui=0&keys=0'))).toBe('/cello?keys=0&ui=0');
    expect(formatAddress(at('/notes?ui=0'))).toBe('/notes?ui=0');
    expect(at('/piano?ui=0').rest).toEqual([]);
    // the setup of an Orchestra is read as ever beside it
    const q = at(`${QUINTET}&ui=0`);
    expect(q.orchestra?.seats).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
    expect(formatAddress(q).endsWith('&ui=0')).toBe(true);
  });
});
