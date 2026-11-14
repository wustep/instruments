// Does a quick note speak? A scale of joined notes on each bowed instrument, told ahead as a file's are,
// and every note read against the same note held alone (the instruments' own notes differ by 10 dB and
// more, so a run is judged note by note): its level less the held note's (dB), and how far it is from its
// pitch (cents). Printed per note, with the RMS of the level differences over the run.
//   npx tsx scripts/strings-speak.ts [--engine <core/index.ts>] [--len 0.12,0.2,0.3] [--human 1,0]
//     [--instrument violin,viola,cello,bass] [--vel 80] [--steps 2,2,1,2,2,2,1]
import { resolve } from 'node:path';
import type * as Engine from '../packages/engine/src/core/index.ts';

const arg = (k: string, d = ''): string => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : (process.argv[i + 1] ?? '');
};
const { BowedCore } = (await import(arg('engine') ? resolve(arg('engine')) : '../packages/engine/src/core/index.ts')) as typeof Engine;
const FS = 48000;
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);
const ids = arg('instrument', 'violin,viola,cello,bass').split(',') as Engine.BowedId[];
const lens = arg('len', '0.12,0.2,0.3').split(',').map(Number);
const humans = arg('human', '1,0').split(',').map(Number);
const vel = Number(arg('vel', '80'));
const steps = arg('steps', '2,2,1,2,2,2,1').split(',').map(Number);
// (from A♭ and E♭: no note the octave of an open string)
const START: Record<string, number> = { violin: 68, viola: 63, cello: 51, bass: 39 };

const lev = (x: Float32Array, t0: number, t1: number) => {
  let s = 0;
  const a = Math.round(t0 * FS);
  const b = Math.round(t1 * FS);
  for (let k = a; k < b; k++) s += x[k] * x[k];
  return 10 * Math.log10(s / (b - a) + 1e-20);
};
function cents(x: Float32Array, a: number, w: number, f: number): number {
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i < w; i++) s += x[a + i] * x[a + i + lag];
    return s;
  };
  let best = -Infinity;
  let bl = 0;
  for (let lag = Math.floor(FS / (f * 1.06)); lag <= Math.ceil(FS / (f * 0.94)); lag++) {
    const v = ac(lag);
    if (v > best) {
      best = v;
      bl = lag;
    }
  }
  const p = ac(bl - 1);
  const q = ac(bl);
  const r = ac(bl + 1);
  return 1200 * Math.log2(FS / (bl + (0.5 * (p - r)) / (p - 2 * q + r)) / f);
}
const render = (inst: Engine.BowedId, human: number, sched: (core: Engine.BowedCore) => void, dur: number) => {
  const core = new BowedCore({ sampleRate: FS, instrument: inst, dry: true, params: { vibrato: 0, human } as never });
  sched(core);
  const x = new Float32Array(Math.round(dur * FS));
  const L = new Float32Array(48);
  const R = new Float32Array(48);
  for (let i = 0; i + 48 <= x.length; i += 48) {
    core.process(L, R, 48);
    x.set(L, i);
  }
  return { x, core };
};

for (const inst of ids) {
  let m = START[inst];
  const ms = [m, ...steps.map((s) => (m += s))];
  const held = ms.map((mm) => lev(render(inst, 0, (c) => c.schedule({ type: 'noteOn', midi: mm, velocity: vel }, 4800), 1.2).x, 0.6, 1.1));
  console.log(`${inst}: ${ms.join(' ')} at velocity ${vel}; held alone ${held.map((v) => v.toFixed(1)).join(' ')} dB`);
  for (const len of lens)
    for (const human of humans) {
      const r = render(
        inst,
        human,
        (core) => {
          ms.forEach((mm, i) => {
            const f = Math.round((0.3 + len * i) * FS);
            core.schedule({ type: 'foresee', midi: mm, velocity: vel, dur: len }, f);
            if (i) core.schedule({ type: 'noteOff', midi: ms[i - 1] }, f);
            core.schedule({ type: 'noteOn', midi: mm, velocity: vel }, f);
          });
          core.schedule({ type: 'noteOff', midi: ms[ms.length - 1] }, Math.round((0.3 + ms.length * len) * FS));
        },
        0.6 + ms.length * len,
      );
      const d = ms.map((_, i) => lev(r.x, 0.3 + len * i + 0.3 * len, 0.3 + len * (i + 1)) - held[i]);
      const c = ms.map((mm, i) => cents(r.x, Math.round((0.3 + len * i + 0.45 * len) * FS), Math.round((0.5 * len - 1 / et(mm) - 0.004) * FS), et(mm)));
      const rms = Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length);
      console.log(`  ${len.toFixed(2)} s human ${human}: level − held ${d.map((v) => v.toFixed(1).padStart(6)).join('')}  RMS ${rms.toFixed(1)} dB · cents ${c.map((v) => v.toFixed(0).padStart(4)).join('')} · ${r.core.plan.strokes} bows`);
    }
}
