// The page's address (address.ts): every tab its own path, the Orchestra's setup in a short, readable,
// versioned query that round-trips, old addresses still opening where they did, and anything that
// cannot be read left out rather than failing.
import { describe, expect, it } from 'vitest';
import { emptyAddress, formatAddress, parseAddress, tabOf, type Address } from '../src/address.ts';
import { QUINTET } from './presets.ts';

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
