// The double reeds' registers by Monte Carlo: how often does a note speak on another regime of its bore
// (its octave, its twelfth) instead of its fundamental? Both bores are bistable on some notes: the regime a
// note lands on is seeded by the reed's noise, so one render says nothing. Every note of the compass at
// pp/mf/ff, from silence and in context, each played by several players (the engine's `player`: its own
// noise and intonation) at several start times (the noise runs from the engine's first sample):
//   hand      from silence, nothing foreseen (a key in the hand: the long tone the recordings were fitted on)
//   long      from silence, a file's note of 1 s (its length told ahead, as the file player does)
//   short     from silence, a file's note of 0.28 s
//   up        tongued over the breath after a note a fourth lower (a file's notes that touch)
//   down      tongued after a note a fourth higher
//   slur-up   slurred from a fourth lower (the notes overlap by 30 ms)
//   slur-down slurred from a fourth higher
//   repeat    its own pitch struck again (touching)
//   rest      after a note a third lower and a rest of 60 ms (the tongue holds it, the breath kept)
// A note is on another regime if its own harmonics that are not that regime's hold under 1 % of its power
// (scripts/winds-midi-measure.ts `modeOf`, over 40–90 % of the note).
//   npx tsx scripts/reeds-regimes-mc.ts [--only oboe,bassoon] [--engine <old>/packages/engine/src/core/index.ts]
//       [--players 4] [--starts 4] [--vels 40,80,120] [--ctx hand,long,…] [--notes 49,50] [--jobs 4]
//       [--voice '{"zeta":1.1}'] [--json out.json] [--list]
// Prints, per instrument: wrong notes of all by context and dynamic, then each pitch that ever went wrong
// with its share. --list: each cell. --json: every cell's count, to compare two engines (--diff a.json b.json).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { modeOf } from './winds-midi-measure.ts';

type Inst = 'oboe' | 'bassoon';
export interface Cell {
  inst: Inst;
  ctx: string;
  midi: number;
  vel: number;
  n: number;
  bad: number;
  /** which regimes the wrong ones were on (2: the octave, 3: the twelfth, 4) */
  modes: Record<string, number>;
}
const RANGE: Record<Inst, [number, number]> = { oboe: [58, 93], bassoon: [34, 76] };
export const CONTEXTS = ['hand', 'long', 'short', 'up', 'down', 'slur-up', 'slur-down', 'repeat', 'rest'];
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

type Ev = { time: number; event: never };
/** the events of one trial and the measured note's start and length (s) */
export function trial(inst: Inst, ctx: string, m: number, vel: number, t0: number): { events: Ev[]; at: number; len: number; dur: number } {
  const [lo, hi] = RANGE[inst];
  const on = (t: number, midi: number) => ({ time: t, event: { type: 'noteOn', midi, velocity: vel } as never });
  const off = (t: number, midi: number) => ({ time: t, event: { type: 'noteOff', midi } as never });
  const see = (t: number, midi: number, dur: number) => ({ time: t, event: { type: 'foresee', midi, velocity: vel, dur } as never });
  const other = (d: number) => (m + d >= lo && m + d <= hi ? m + d : m - d);
  const PRE = 0.4;
  if (ctx === 'hand') return { events: [on(t0, m), off(t0 + 1.2, m)], at: t0, len: 1.2, dur: t0 + 1.3 };
  if (ctx === 'long' || ctx === 'short') {
    const len = ctx === 'long' ? 1 : 0.28;
    return { events: [see(t0, m, len), on(t0, m), off(t0 + len, m)], at: t0, len, dur: t0 + len + 0.1 };
  }
  const len = ctx === 'repeat' ? 0.28 : 0.45;
  const prev = ctx === 'up' || ctx === 'slur-up' ? other(-5) : ctx === 'down' || ctx === 'slur-down' ? other(5) : ctx === 'rest' ? other(-4) : m;
  const over = ctx.startsWith('slur') ? 0.03 : 0;
  const gap = ctx === 'rest' ? 0.06 : 0;
  const at = t0 + PRE + gap;
  const prevLen = PRE + over;
  // (as the file player sends them: every note told ahead, the offs before the ons of one instant)
  const events = [see(t0, prev, prevLen), see(at, m, len), on(t0, prev), ...(over ? [on(at, m), off(t0 + prevLen, prev)] : [off(t0 + prevLen, prev), on(at, m)]), off(at + len, m)];
  events.sort((a, b) => a.time - b.time);
  return { events, at, len, dur: at + len + 0.1 };
}

const args = process.argv.slice(2);
const has = (k: string) => args.includes(k);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);

function table(cells: Cell[], list: boolean): string {
  const out: string[] = [];
  for (const inst of ['oboe', 'bassoon'] as Inst[]) {
    const mine = cells.filter((c) => c.inst === inst);
    if (!mine.length) continue;
    const vels = [...new Set(mine.map((c) => c.vel))].sort((a, b) => a - b);
    const ctxs = CONTEXTS.filter((x) => mine.some((c) => c.ctx === x));
    const sum = (f: (c: Cell) => boolean) => {
      const s = mine.filter(f);
      return [s.reduce((a, c) => a + c.bad, 0), s.reduce((a, c) => a + c.n, 0)];
    };
    const pc = ([b, n]: number[]) => `${b}/${n} (${n ? ((100 * b) / n).toFixed(2) : '–'} %)`;
    out.push(`${inst}: wrong regime ${pc(sum(() => true))}`);
    out.push(`  ${'context'.padEnd(10)} ${vels.map((v) => `v${v}`.padStart(11)).join(' ')} ${'all'.padStart(18)}`);
    for (const x of ctxs) out.push(`  ${x.padEnd(10)} ${vels.map((v) => sum((c) => c.ctx === x && c.vel === v).join('/').padStart(11)).join(' ')} ${pc(sum((c) => c.ctx === x)).padStart(18)}`);
    out.push(`  ${'all'.padEnd(10)} ${vels.map((v) => sum((c) => c.vel === v).join('/').padStart(11)).join(' ')}`);
    const pitches = [...new Set(mine.filter((c) => c.bad).map((c) => c.midi))].sort((a, b) => a - b);
    out.push(`  by pitch (wrong/trials; the contexts it went wrong in):`);
    for (const m of pitches) {
      const [b, n] = sum((c) => c.midi === m);
      const where = ctxs.map((x) => [x, sum((c) => c.midi === m && c.ctx === x)[0]] as const).filter((p) => p[1]);
      const modes: Record<string, number> = {};
      for (const c of mine) if (c.midi === m) for (const k in c.modes) modes[k] = (modes[k] ?? 0) + c.modes[k];
      out.push(`    ${noteName(m).padEnd(4)} ${`${b}/${n}`.padStart(9)} ${((100 * b) / n).toFixed(1).padStart(5)} %  ${where.map(([x, k]) => `${x} ${k}`).join(', ')}  [mode ${Object.entries(modes).map(([k, v]) => `${k}: ${v}`).join(', ')}]`);
    }
    if (list) for (const c of mine) if (c.bad) out.push(`    ${c.ctx} ${noteName(c.midi)} v${c.vel}: ${c.bad}/${c.n}`);
  }
  return out.join('\n');
}

async function main(): Promise<void> {
  if (has('--diff')) {
    // two surveys' cells side by side: per instrument and context, and the pitches that changed
    const i = args.indexOf('--diff');
    const A: Cell[] = JSON.parse(readFileSync(args[i + 1], 'utf8')).cells;
    const B: Cell[] = JSON.parse(readFileSync(args[i + 2], 'utf8')).cells;
    const key = (c: Cell) => `${c.inst}|${c.ctx}|${c.midi}|${c.vel}`;
    const mb = new Map(B.map((c) => [key(c), c]));
    for (const inst of ['oboe', 'bassoon'] as Inst[]) {
      const a = A.filter((c) => c.inst === inst && mb.has(key(c)));
      if (!a.length) continue;
      const tot = (cs: Cell[]) => [cs.reduce((s, c) => s + c.bad, 0), cs.reduce((s, c) => s + c.n, 0)];
      const row = (name: string, cs: Cell[]) => {
        const [ba, na] = tot(cs);
        const [bb, nb] = tot(cs.map((c) => mb.get(key(c))!));
        return `  ${name.padEnd(10)} ${`${ba}/${na}`.padStart(10)} → ${`${bb}/${nb}`.padEnd(10)} ${((100 * ba) / na).toFixed(2).padStart(6)} % → ${((100 * bb) / nb).toFixed(2)} %`;
      };
      console.log(`${inst}: wrong regime, before → after`);
      for (const x of CONTEXTS) if (a.some((c) => c.ctx === x)) console.log(row(x, a.filter((c) => c.ctx === x)));
      for (const v of [...new Set(a.map((c) => c.vel))].sort((p, q) => p - q)) console.log(row(`v${v}`, a.filter((c) => c.vel === v)));
      console.log(row('all', a));
      const pitches = [...new Set(a.map((c) => c.midi))].sort((p, q) => p - q);
      const worse: string[] = [];
      console.log('  by pitch:');
      for (const m of pitches) {
        const cs = a.filter((c) => c.midi === m);
        const [ba, na] = tot(cs);
        const [bb] = tot(cs.map((c) => mb.get(key(c))!));
        if (ba || bb) console.log(`    ${noteName(m).padEnd(4)} ${`${ba}`.padStart(4)} → ${`${bb}`.padEnd(4)} of ${na}`);
        if (bb > ba) worse.push(`${noteName(m)} +${bb - ba}`);
      }
      console.log(`  pitches with more wrong notes after: ${worse.join(', ') || 'none'}`);
    }
    process.exit(0);
  }

  const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
  const ONLY = (opt('--only', 'oboe,bassoon')!.split(',') as Inst[]).filter((x) => x in RANGE);
  const PLAYERS = Number(opt('--players', '4'));
  const STARTS = Number(opt('--starts', '4'));
  const VELS = opt('--vels', '40,80,120')!.split(',').map(Number);
  const CTX = opt('--ctx', CONTEXTS.join(','))!.split(',');
  const NOTES = opt('--notes')?.split(',').map(Number);
  const VOICE = opt('--voice');
  const JOBS = Number(opt('--jobs', '1'));
  const SHARD = opt('--shard');
  const FS = Number(opt('--fs', '48000'));

  const jobs: { inst: Inst; ctx: string; midi: number; vel: number }[] = [];
  for (const inst of ONLY) for (const ctx of CTX) for (let m = RANGE[inst][0]; m <= RANGE[inst][1]; m++) if (!NOTES || NOTES.includes(m)) for (const vel of VELS) jobs.push({ inst, ctx, midi: m, vel });

  async function run(mine: typeof jobs): Promise<Cell[]> {
    const render: typeof import('../packages/engine/src/core/index.ts').renderInstrument = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
    const voice = VOICE ? JSON.parse(VOICE) : undefined;
    const cells: Cell[] = [];
    for (const j of mine) {
      const cell: Cell = { ...j, n: 0, bad: 0, modes: {} };
      const f0 = 440 * 2 ** ((j.midi - 69) / 12);
      for (let p = 0; p < PLAYERS; p++)
        for (let s = 0; s < STARTS; s++) {
          // (start times a prime number of samples apart: the noise's place in the note differs each time)
          const t0 = 0.05 + (s * 661) / FS;
          const tr = trial(j.inst, j.ctx, j.midi, j.vel, t0);
          const r = render({ sampleRate: FS, instrument: j.inst, events: tr.events, duration: tr.dur, dry: true, player: p, ...(voice ? { params: { voice } as never } : {}) });
          const a = Math.round(tr.at * FS);
          const b = Math.round((tr.at + tr.len) * FS);
          const mode = modeOf(r.left, FS, f0, Math.round(a + 0.4 * (b - a)), Math.round(a + 0.9 * (b - a)));
          cell.n++;
          if (mode !== 1) {
            cell.bad++;
            cell.modes[mode] = (cell.modes[mode] ?? 0) + 1;
          }
        }
      cells.push(cell);
    }
    return cells;
  }

  let cells: Cell[];
  if (SHARD) {
    const [i, n] = SHARD.split('/').map(Number);
    cells = await run(jobs.filter((_, k) => k % n === i));
    writeFileSync(opt('--json')!, JSON.stringify({ cells }));
    process.exit(0);
  } else if (JOBS > 1) {
    const dir = mkdtempSync(join(tmpdir(), 'reeds-mc-'));
    const pass = args.filter((a, k) => !['--jobs', '--json'].includes(a) && !['--jobs', '--json'].includes(args[k - 1]));
    const files = await Promise.all(
      Array.from({ length: JOBS }, (_, i) => {
        const f = join(dir, `${i}.json`);
        return new Promise<string>((ok, no) => {
          const c = spawn(process.execPath, [...process.execArgv, process.argv[1], ...pass, '--shard', `${i}/${JOBS}`, '--json', f], { stdio: ['ignore', 'inherit', 'inherit'] });
          c.on('exit', (code) => (code ? no(new Error(`shard ${i}: ${code}`)) : ok(f)));
        });
      }),
    );
    cells = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).cells as Cell[]);
    const order = new Map(jobs.map((j, k) => [`${j.inst}|${j.ctx}|${j.midi}|${j.vel}`, k]));
    cells.sort((a, b) => order.get(`${a.inst}|${a.ctx}|${a.midi}|${a.vel}`)! - order.get(`${b.inst}|${b.ctx}|${b.midi}|${b.vel}`)!);
  } else cells = await run(jobs);

  console.log(`${ENGINE.includes('audit3-before') || has('--engine') ? `engine ${ENGINE}\n` : ''}${PLAYERS} players × ${STARTS} start times = ${PLAYERS * STARTS} trials a cell; velocities ${VELS.join(', ')}; ${FS} Hz${VOICE ? `; voice ${VOICE}` : ''}`);
  console.log(table(cells, has('--list')));
  if (opt('--json')) writeFileSync(opt('--json')!, JSON.stringify({ engine: ENGINE, players: PLAYERS, starts: STARTS, vels: VELS, fs: FS, cells }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
