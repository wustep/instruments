// How many times a period does a double reed shut? On a conical bore the reed's Helmholtz motion shuts once a
// period, for the apex's round trip 2·x₀/c (Ollivier, Dalmont & Kergomard 2004), at a pressure −γ(1−β)/β of the
// closing pressure (β = x₀/(L+x₀): the mean pressure of an open bore is zero). Where the loop cannot hold a
// pulse that deep, the reed shuts several times a period instead, each time less deeply: that state's
// harmonics are still the note's while the closures differ, and it is the note's octave (twelfth) the moment
// two (three) of them are alike. Printed per note at pp/mf/ff: closures a period, the share of the period the
// reed is shut and the deepest pressure in the bore (units of the closing pressure), at three moments of a
// held note, and the ideal single closure's depth beside it.
//   npx tsx scripts/reeds-closures.ts [--only oboe,bassoon] [--engine <old>/packages/engine/src/core/index.ts]
//       [--notes 34,40] [--vels 40,80,120] [--players 3] [--at 0.15,1,4] [--voice '{"zeta":1.85}']
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { noteName } from './reeds-regimes-mc.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
const ONLY = opt('--only', 'oboe,bassoon')!.split(',');
const VELS = opt('--vels', '40,80,120')!.split(',').map(Number);
const PLAYERS = Number(opt('--players', '3'));
const AT = opt('--at', '0.15,1,4')!.split(',').map(Number);
const NOTES = opt('--notes')?.split(',').map(Number);
const VOICE = opt('--voice');
const FS = 48000;
const RANGE: Record<string, [number, number]> = { oboe: [58, 93], bassoon: [34, 76] };
const mod: typeof import('../packages/engine/src/core/index.ts') = await import(pathToFileURL(ENGINE).href);
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
const dur = Math.max(...AT) + 0.3;

for (const inst of ONLY) {
  console.log(`${inst}: closures a period / share of the period shut / deepest pressure, at ${AT.join(', ')} s (median of ${PLAYERS} players); ideal: one closure of β, −γ(1−β)/β deep`);
  for (let m = RANGE[inst][0]; m <= RANGE[inst][1]; m++) {
    if (NOTES && !NOTES.includes(m)) continue;
    const f0 = 440 * 2 ** ((m - 69) / 12);
    const cols: string[] = [];
    for (const vel of VELS) {
      const rows: number[][][] = AT.map(() => []);
      let ideal = '';
      for (let p = 0; p < PLAYERS; p++) {
        const core = mod.createCore({ sampleRate: FS, instrument: inst as never, dry: true, player: p, ...(VOICE ? { params: { voice: JSON.parse(VOICE) } as never } : {}) });
        core.schedule({ type: 'noteOn', midi: m, velocity: vel } as never, Math.round(0.05 * FS));
        // the reed's opening and the pressure at it, from the core's trace
        const c = core as unknown as { trX: Float32Array; trP: Float32Array; trI: number; D1: number; D2: number; gammaNow: number };
        const n = Math.ceil(dur * FS);
        const X = new Float32Array(n + 256);
        const P = new Float32Array(n + 256);
        const bl = new Float32Array(64);
        const br = new Float32Array(64);
        let last = c.trI;
        let k = 0;
        for (let i = 0; i < n; i += 64) {
          core.process(bl, br, 64);
          while (last !== c.trI && k < X.length) {
            X[k] = c.trX[last];
            P[k++] = c.trP[last];
            last = (last + 1) & (c.trX.length - 1);
          }
        }
        const beta = c.D2 / (c.D1 + c.D2);
        ideal = `β ${beta.toFixed(3)}, ideal ${(-(c.gammaNow * (1 - beta)) / beta).toFixed(1)}`;
        AT.forEach((t, j) => {
          const a = Math.round((0.05 + t) * FS);
          const b = a + Math.round(0.2 * FS);
          let cl = 0;
          let shut = 0;
          let lo = 0;
          for (let q = a; q < b; q++) {
            if (X[q] <= 0) {
              shut++;
              if (X[q - 1] > 0) cl++;
            }
            if (P[q] < lo) lo = P[q];
          }
          rows[j].push([cl / (0.2 * f0), shut / (b - a), lo]);
        });
      }
      cols.push(`v${vel}: ${rows.map((r) => `${med(r.map((x) => x[0])).toFixed(1)}/${med(r.map((x) => x[1])).toFixed(2)}/${med(r.map((x) => x[2])).toFixed(1)}`).join('  ')} (${ideal})`);
    }
    console.log(`  ${noteName(m).padEnd(4)} ${cols.join(' | ')}`);
  }
}
