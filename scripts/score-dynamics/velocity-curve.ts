// Each instrument's loudness against velocity, as played (its room and limiter): a walk through the middle
// of its compass (notes of 0.45 s, 0.5 s apart) at seven velocities, LUFS. What the dynamics' velocities
// (scripts/score-dynamics/build.ts VELOCITY, DB_PER_STEP) were chosen from.
//   npx tsx scripts/score-dynamics/velocity-curve.ts [--only violin,flute]
import { lufs } from '../audio-measure.ts';
import * as E from '../../packages/engine/src/core/index.ts';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const FS = 48000;
const VELS = [30, 45, 60, 75, 90, 105, 120];
console.log(`${'instrument'.padEnd(13)} ${VELS.map((v) => String(v).padStart(6)).join(' ')}   dB/step 45→105`);
for (const id of E.INSTRUMENT_IDS) {
  if (only && !only.includes(id)) continue;
  const info = E.INSTRUMENT_INFO[id];
  const mid = id === 'piano' || id === 'harp' ? 60 : Math.round((info.lo + info.hi) / 2);
  const lo = Math.max(info.lo, mid - 7);
  const hi = Math.min(info.hi, mid + 7);
  const row: number[] = [];
  for (const vel of VELS) {
    const ev: { time: number; event: never }[] = [];
    let t = 0.2;
    for (let m = lo; m <= hi; m += 2) {
      ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: vel } as never }, { time: t + 0.45, event: { type: 'noteOff', midi: m } as never });
      t += 0.5;
    }
    const out = E.renderInstrument({ sampleRate: FS, instrument: id, events: ev, duration: t + 1 });
    row.push(lufs(out.left, out.right, FS));
  }
  console.log(`${id.padEnd(13)} ${row.map((x) => x.toFixed(1).padStart(6)).join(' ')}   ${((row[5] - row[1]) / 60).toFixed(3)}`);
}
