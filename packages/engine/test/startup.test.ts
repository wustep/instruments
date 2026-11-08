// Start-up cost guard. The piano's filter designs are computed ahead of time (at build
// time for the web app) and handed to the core, so creating the instrument on the
// audio thread takes milliseconds instead of ~0.4 s here (and 5–10 s on a slow machine).
import { describe, expect, it } from 'vitest';
import { PianoCore, computeDesigns, type DesignEntry } from '../src/core/index.ts';
import { FS, on, render } from './helpers.ts';

describe('start-up', () => {
  it('precomputed designs cover every string and make the core cheap to create', async () => {
    const designs = await computeDesigns('grand', {}, FS);
    // the shipped form is JSON
    const shipped = JSON.parse(JSON.stringify(designs)) as DesignEntry[];
    const t0 = performance.now();
    const core = new PianoCore({ sampleRate: FS, designs: shipped });
    const ms = performance.now() - t0;
    // nothing was designed on the (audio) thread that created the core
    expect(core.dispCache.size).toBe(shipped.length);
    expect(ms).toBeLessThan(100); // ~5–10 ms on an M-series Mac; ~350 ms without designs
  });

  it('a core built from shipped designs sounds identical to one that designed its own', async () => {
    const shipped = JSON.parse(JSON.stringify(await computeDesigns('grand', {}, FS))) as DesignEntry[];
    const a = render([on(0.01, 45, 90), on(0.02, 64, 70)], 0.4, { designs: shipped });
    const b = render([on(0.01, 45, 90), on(0.02, 64, 70)], 0.4);
    let d = 0;
    let pk = 0;
    for (let i = 0; i < a.x.length; i++) {
      d = Math.max(d, Math.abs(a.x[i] - b.x[i]));
      pk = Math.max(pk, Math.abs(b.x[i]));
    }
    expect(pk).toBeGreaterThan(1e-3);
    expect(d).toBe(0);
  });
});
