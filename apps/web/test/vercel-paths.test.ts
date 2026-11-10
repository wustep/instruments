// The production host serves only the files it built plus the rewrites in vercel.json: a path the app
// writes into the address bar (address.ts) but vercel.json does not rewrite is a 404 on a reload or a
// shared link (the oboe's /oboe was, after #30: Vite's own server answers every path, so nothing local
// saw it). Every instrument path and alias, and the other tabs' paths, must reach the page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSTRUMENT_IDS } from '@piano-model/engine';
import { INSTRUMENT_PATHS, formatAddress, emptyAddress } from '../src/address.ts';

const vercel = JSON.parse(readFileSync(join(import.meta.dirname, '../../../vercel.json'), 'utf8')) as { rewrites: { source: string; destination: string }[] };
/** does a rewrite to the page match this path (Vercel's path-to-regexp sources: here plain groups) */
const served = (path: string) => vercel.rewrites.some((r) => r.destination === '/index.html' && new RegExp(`^${r.source}$`).test(path));

describe('vercel.json serves every address the app writes', () => {
  it('every instrument and alias, alone and with a sub-path; the Orchestra, measurements and notes', () => {
    const paths = [...Object.keys(INSTRUMENT_PATHS), 'orchestra', 'ensemble', 'measurements', 'notes'];
    for (const id of INSTRUMENT_IDS) expect(paths, id).toContain(id);
    // (the horn: its path and its alias, named so that a rename cannot drop them unseen)
    for (const p of ['horn', 'french-horn']) expect(paths, p).toContain(p);
    // (the timpani: their path and their alias)
    for (const p of ['timpani', 'kettledrums']) expect(paths, p).toContain(p);
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
  });
});
