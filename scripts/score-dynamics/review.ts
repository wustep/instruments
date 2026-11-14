// A piece's marks read back for an editor: for each line, every entry after a rest of `--rest` bars or more
// (default 3), the level in force there and whether the entry has a mark of its own. A staff that comes in
// unmarked plays at whatever it was last told: where that is not the music's, the marks want an entry.
//   npx tsx scripts/score-dynamics/review.ts --piece beethoven5-i [--rest 3]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMarks, timeline, SHAPE } from './dynamics.ts';
import { barOf, isOff, isOn, linesOf, readSmf } from './smf.ts';
import { SCORES } from './marks/index.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const REST = Number(opt('--rest') ?? 3);
const NAMES: [number, string][] = [[-19, 'ppp'], [-15, 'pp'], [-11, 'p'], [-8, 'mp'], [-5.5, 'mf'], [-2.5, 'f'], [0, 'ff'], [1.5, 'fff']];
const name = (db: number) => {
  const n = NAMES.reduce((a, b) => (Math.abs(b[0] - db) < Math.abs(a[0] - db) ? b : a));
  return Math.abs(n[0] - db) < 0.2 ? n[1] : `${n[1]}${db > n[0] ? '+' : '−'}(${db.toFixed(1)})`;
};
for (const m of SCORES) {
  if (opt('--piece') && m.id !== opt('--piece')) continue;
  const smf = readSmf(new Uint8Array(readFileSync(join('apps/web/public/pieces', m.file))));
  const lines = linesOf(smf);
  const bar = barOf(smf).ticks;
  const pickup = Math.round((m.pickup ?? 0) * smf.ppq);
  const place = (b: number, beat: number) => Math.round((b === 0 ? 0 : pickup + (b - 1) * bar) + (beat - 1) * smf.ppq);
  const where = (tick: number) => {
    const b = tick < pickup ? 0 : Math.floor((tick - pickup) / bar) + 1;
    const beat = 1 + (tick - (b ? pickup + (b - 1) * bar : 0)) / smf.ppq;
    return beat === 1 ? `${b}` : `${b}:${+beat.toFixed(2)}`;
  };
  let endTick = 0;
  for (const t of smf.tracks) for (const e of t) endTick = Math.max(endTick, e.tick);
  console.log(`\n${m.id}`);
  for (const [key, who] of Object.entries(m.players)) {
    const li = Number(key);
    const { track, channel } = lines[li];
    const groups = readMarks(`${m.all ?? ''} ${m.lines[li] ?? ''}`, place);
    const tl = timeline(groups, -5.5, bar, endTick, { ...SHAPE, ...m.shape } as typeof SHAPE);
    const marked = new Set(groups.map((g) => g.tick));
    let sounding = 0;
    let silentSince = 0;
    const out: string[] = [];
    for (const e of smf.tracks[track]) {
      if ((e.bytes[0] & 15) !== channel) continue;
      if (isOn(e)) {
        if (!sounding && e.tick - silentSince >= REST * bar) out.push(`${where(e.tick)} ${name(tl.level(e.tick))}${marked.has(e.tick) ? '' : '?'}`);
        sounding++;
      } else if (isOff(e) && sounding && --sounding === 0) silentSince = e.tick;
    }
    console.log(`  ${String(li).padStart(2)} ${who.padEnd(9)} ${out.join('  ')}`);
  }
}
