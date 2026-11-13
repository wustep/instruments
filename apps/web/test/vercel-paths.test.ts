// The production host serves only the files it built plus the rewrites in vercel.json: a path the app
// writes into the address bar (address.ts) but vercel.json does not rewrite is a 404 on a reload or a
// shared link (the oboe's /oboe was, after #30: Vite's own server answers every path, so nothing local
// saw it). Every instrument path and alias, and the other tabs' paths, must reach the page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSTRUMENT_IDS } from '@piano-model/engine';
import { INSTRUMENT_PATHS, PIECE_PATHS, formatAddress, emptyAddress } from '../src/address.ts';

const vercel = JSON.parse(readFileSync(join(import.meta.dirname, '../../../vercel.json'), 'utf8')) as { rewrites: { source: string; destination: string }[] };
/** does a rewrite to the page match this path (Vercel's path-to-regexp sources: here plain groups) */
const served = (path: string) => vercel.rewrites.some((r) => r.destination === '/index.html' && new RegExp(`^${r.source}$`).test(path));

describe('vercel.json serves every address the app writes', () => {
  it('every instrument and alias, alone and with a sub-path; the Orchestra, measurements and notes', () => {
    const paths = [...Object.keys(INSTRUMENT_PATHS), ...Object.keys(PIECE_PATHS), 'orchestra', 'ensemble', 'measurements', 'notes'];
    // (the pieces' own addresses: Toward Morning's, Everything So Far's and Pass It On's)
    for (const p of ['symphony', 'everything', 'passiton']) expect(paths, p).toContain(p);
    for (const id of INSTRUMENT_IDS) expect(paths, id).toContain(id);
    // (the horn: its path and its alias, named so that a rename cannot drop them unseen)
    for (const p of ['horn', 'french-horn']) expect(paths, p).toContain(p);
    // (the timpani: their path and their alias)
    for (const p of ['timpani', 'kettledrums']) expect(paths, p).toContain(p);
    // (the trombone: its path)
    for (const p of ['trombone']) expect(paths, p).toContain(p);
    for (const p of paths) {
      expect(served(`/${p}`), `/${p}`).toBe(true);
      expect(served(`/${p}/x`), `/${p}/x`).toBe(true);
    }
    // and the addresses formatAddress writes for each instrument
    for (const id of INSTRUMENT_IDS) {
      const url = formatAddress({ ...emptyAddress(), instrument: id });
      const path = new URL(url, 'https://instruments-wustep.vercel.app').pathname;
      if (path !== '/') expect(served(path), path).toBe(true);
    }
    // and a piece's, on its own orchestra
    for (const pc of Object.values(PIECE_PATHS)) {
      const url = formatAddress({ ...emptyAddress(), piece: pc.id, orchestra: { seats: pc.parts.map((q) => q.voice), lines: null, keys: null } });
      expect(url).toBe(`/${pc.path}`);
      expect(served(url), url).toBe(true);
    }
  });
});

// An address that is none of the app's gets the host's 404, and the host serves 404.html with it (a
// static deployment's own: the file at the root of what was built). So no rewrite may catch every path,
// and the page that says so must list the places that do exist.
describe('an address that is none of the app’s is a 404, with the page that says so', () => {
  const web = join(import.meta.dirname, '..');
  it('no rewrite answers an unknown path; 404.html is built, and links every instrument, the Orchestra, the pieces’ own addresses and the two pages', () => {
    for (const p of ['/sympony', '/everythings', '/pass-it-on', '/pianos', '/x/y', '/favicon.png', '/orchestras']) expect(served(p), p).toBe(false);
    const html = readFileSync(join(web, '404.html'), 'utf8');
    const config = readFileSync(join(web, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/input:\s*\{[^}]*'404':\s*'404\.html'/);
    expect(html).toContain('<title>Not Found · Instruments</title>');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    const links = [...html.matchAll(/<a href="\/([a-z-]+)">([a-z]+)<\/a>/g)].map((m) => m[1]);
    expect(links).toEqual([...INSTRUMENT_IDS, 'orchestra', ...Object.keys(PIECE_PATHS), 'measurements', 'notes']);
    for (const l of links) expect(served(`/${l}`), l).toBe(true);
  });
});

// The icons (scripts/icons.mjs draws them from favicon.svg): whatever asks for /favicon.ico or
// /apple-touch-icon.png, as browsers, link previews and iOS do unasked, gets one.
describe('the page’s icons', () => {
  const pub = join(import.meta.dirname, '../public');
  it('favicon.ico holds 16, 32 and 48 px; the Apple icon is 180 px square and opaque; both pages link them; the title is in title case', () => {
    const ico = readFileSync(join(pub, 'favicon.ico'));
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
    const n = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < n; i++) {
      const o = 6 + 16 * i;
      sizes.push(ico.readUInt8(o));
      const at = ico.readUInt32LE(o + 12);
      // each a PNG of that size, whole in the file
      expect(ico.subarray(at, at + 8).toString('latin1')).toBe('\x89PNG\r\n\x1a\n');
      expect(ico.readUInt32BE(at + 16)).toBe(sizes[i]);
      expect(at + ico.readUInt32LE(o + 8)).toBeLessThanOrEqual(ico.length);
    }
    expect(sizes).toEqual([16, 32, 48]);
    const png = readFileSync(join(pub, 'apple-touch-icon.png'));
    expect(png.subarray(0, 8).toString('latin1')).toBe('\x89PNG\r\n\x1a\n');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
    // (colour type 2: RGB, no alpha: iOS would show a transparent corner black)
    expect(png.readUInt8(25)).toBe(2);
    expect(readFileSync(join(pub, 'favicon.svg'), 'utf8')).toContain('viewBox="0 0 32 32"');
    for (const page of ['index.html', '404.html']) {
      const html = readFileSync(join(pub, '..', page), 'utf8');
      expect(html, page).toContain('<link rel="icon" href="/favicon.ico" sizes="48x48" />');
      expect(html, page).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
      expect(html, page).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    }
    expect(readFileSync(join(pub, '../index.html'), 'utf8')).toContain('<title>Instruments</title>');
  });
});
