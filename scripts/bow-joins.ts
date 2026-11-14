// How the strings' notes meet, measured offline: a line of joined notes (each ends as the next begins,
// as a typed file has them) told ahead as the file player tells it, and for every join the hole in the
// sound (the lowest 10 ms of level about the join, under the level the note before held) and how long
// after the join the new note has spoken (within 3 dB of the level it comes to hold).
//   npx tsx scripts/bow-joins.ts [--engine <core/index.ts>] [--instrument violin,cello] [--len 0.17,0.3,0.6]
//     [--vel 45,80,110] [--steps 2,2,1,-3,7,-2,-2] [--human 0] [--hand] [--gap 0]
// --hand: nothing told ahead (the keys). --gap: seconds of rest between the notes.
import { resolve } from 'node:path';
import * as here from '../packages/engine/src/core/index.ts';

const arg = (k: string, d = ''): string => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : (process.argv[i + 1] ?? '');
};
const has = (k: string) => process.argv.includes(`--${k}`);
const eng = (arg('engine') ? await import(resolve(arg('engine'))) : here) as typeof here;
const FS = 48000;
const ids = arg('instrument', 'violin,viola,cello,bass').split(',') as here.BowedId[];
const lens = arg('len', '0.12,0.17,0.3,0.6').split(',').map(Number);
const vels = arg('vel', '45,80,110').split(',').map(Number);
const steps = arg('steps', '2,2,1,-3,7,-2,-2,5,-1').split(',').map(Number);
const gap = Number(arg('gap', '0'));
const START: Record<string, number> = { violin: 69, viola: 62, cello: 50, bass: 38 };
const params = { vibrato: 0, ...(arg('human') ? { human: Number(arg('human')) } : {}) };

const rms = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  for (let i = Math.max(0, a); i < Math.min(x.length, b); i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

console.log(`joined notes${gap ? ` ${gap} s apart` : ''}, ${has('hand') ? 'by hand' : 'told ahead'}: hole dB (median, worst) · spoken after ms (median, worst) · level dB`);
for (const id of ids) {
  for (const len of lens)
    for (const vel of vels) {
      const core = new eng.BowedCore({ sampleRate: FS, instrument: id, dry: true, params });
      let m = START[id];
      let t = 0.3;
      const joins: number[] = [];
      const notes = [m, ...steps.map((s) => (m += s))];
      notes.forEach((p, i) => {
        if (!has('hand')) core.schedule({ type: 'foresee', midi: p, velocity: vel, dur: len }, Math.round(t * FS));
        if (i) joins.push(t);
        t += len + gap;
      });
      t = 0.3;
      notes.forEach((p, i) => {
        core.schedule({ type: 'noteOn', midi: p, velocity: vel }, Math.round(t * FS));
        core.schedule({ type: 'noteOff', midi: p }, Math.round((t + len) * FS));
        t += len + gap;
      });
      // (a noteOff and a noteOn on one frame: the off first, as a file has them)
      const n = Math.round((t + 0.3) * FS);
      const x = new Float32Array(n);
      const L = new Float32Array(128);
      const R = new Float32Array(128);
      for (let i = 0; i + 128 <= n; i += 128) {
        core.process(L, R, 128);
        x.set(L, i);
      }
      const hole: number[] = [];
      const spoke: number[] = [];
      const W = Math.round(0.01 * FS);
      for (const j of joins) {
        const j0 = Math.round(j * FS);
        // the level the note before held (its second half) and the one this note comes to (its last 40 %)
        const prev = rms(x, j0 - Math.round(0.5 * (len + gap) * FS) - Math.round(gap * FS), j0 - Math.round(gap * FS));
        const held = rms(x, j0 + Math.round(0.6 * len * FS), j0 + Math.round(len * FS));
        let lo = Infinity;
        for (let k = j0 - 2 * W; k < j0 + Math.round(Math.min(len, 0.15) * FS); k += W >> 1) lo = Math.min(lo, rms(x, k, k + W));
        hole.push(db(lo) - db(Math.min(prev, held)));
        let sp = len;
        for (let k = j0; k < j0 + Math.round(len * FS); k += W >> 2)
          if (db(rms(x, k, k + W)) >= db(held) - 3) {
            sp = (k - j0) / FS;
            break;
          }
        spoke.push(sp * 1000);
      }
      const lvl = db(rms(x, Math.round(0.3 * FS), Math.round(t * FS)));
      console.log(`${id.padEnd(6)} ${len.toFixed(2)} s vel ${String(vel).padStart(3)}: hole ${med(hole).toFixed(1).padStart(6)} ${Math.min(...hole).toFixed(1).padStart(6)} · spoken ${med(spoke).toFixed(0).padStart(4)} ${Math.max(...spoke).toFixed(0).padStart(4)} · ${lvl.toFixed(1)} dB · strokes ${core.plan.strokes} changes ${core.bow.changes}`);
    }
}
