// Seeds (apps/web/src/orchestra/seeds.ts) read as a score, with no sound: what a seed grows into, and how
// it lies over a long time.
//   npx tsx scripts/seeds-survey.ts [--seed kelumo | --seeds 40] [--minutes 30] [--score 120]
// Prints, for a seed: each player's loop, phrase and first entry, the fields' walk; over --minutes: how
// many players sound at once (sustained notes; and with what is left ringing counted 4 s), the share of
// the time nobody does and the longest such silence, each player's share of the time, notes a minute.
// --seeds n: the same numbers for n seeds in a row (the spread). --score s: every entry of the first s
// seconds, written out (* an entry that fills a silence).
import { FIELDS, ROLES, WAYS, entriesBetween, entryOf, newSeed, seedsEvents, seedsSystem } from '../apps/web/src/orchestra/seeds.ts';

const arg = (k: string, d = ''): string => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : (process.argv[i + 1] ?? '');
};
const MIN = Number(arg('minutes', '30'));
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const name = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

function survey(seed: string, verbose: boolean) {
  const sys = seedsSystem(seed);
  const T = MIN * 60;
  const dt = 0.1;
  const N = Math.round(T / dt);
  const held = new Int16Array(N);
  const ringing = new Int16Array(N);
  const share = ROLES.map(() => 0);
  let notes = 0;
  let first = Infinity;
  let fills = 0;
  for (const { p, e, fill } of entriesBetween(sys, 0, T)) {
    first = Math.min(first, e.t);
    notes += e.notes.length;
    if (fill) fills++;
    const ring = p.role.kind === 'ring';
    const a = Math.max(0, Math.round(e.t / dt));
    const b = Math.min(N, Math.round((ring ? e.notes[e.notes.length - 1].t + 4 : e.end) / dt));
    for (let k = a; k < b; k++) (ring ? ringing : held)[k]++;
    share[p.line] += Math.max(0, b - a) * dt;
  }
  const hist = [0, 0, 0, 0, 0, 0, 0];
  let silent = 0;
  let run = 0;
  let longest = 0;
  let sum = 0;
  for (let k = 0; k < N; k++) {
    hist[Math.min(6, held[k])]++;
    sum += held[k];
    if (!held[k] && !ringing[k]) {
      silent++;
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  // every on has its off, no pitch begun while a line holds it
  const ev = seedsEvents(sys, 0, T);
  const open = new Map<string, number>();
  let clash = 0;
  for (const e of ev) {
    if (e.kind === 'on') {
      const k = `${e.line}:${e.midi}`;
      if (open.get(k)) clash++;
      open.set(k, (open.get(k) ?? 0) + 1);
    } else if (e.kind === 'off') open.set(`${e.line}:${e.midi}`, (open.get(`${e.line}:${e.midi}`) ?? 0) - 1);
  }
  const row = { seed, fills: fills / MIN, mean: sum / N, silent: silent / N, longest: longest * dt, perMin: notes / MIN, first, events: ev.length / T, clash, hist: hist.map((x) => x / N) };
  if (verbose) {
    console.log(`seed "${seed}": the loops come round together after ${sys.years.toExponential(2)} years`);
    for (const p of sys.players) {
      const e = entryOf(sys, p, Math.ceil(p.grow * p.gesture.length));
      console.log(
        `  ${p.role.name.padEnd(13)} loop ${p.loop.toFixed(2).padStart(6)} s  first ${p.first.toFixed(1).padStart(6)} s  ${p.gesture.length} notes × ${p.len.toFixed(2)} s  steps [${p.gesture.join(' ')}]  stay ${Math.round(p.stay * (1 - WAYS.away))} s of ${Math.round(p.stay)}  grows every ${p.grow}  lag ${p.lag.toFixed(0)} s  on its loop ${((100 * share[p.line]) / T).toFixed(0)} %  e.g. ${e ? e.notes.map((x) => name(x.midi)).join(' ') : '—'}`,
      );
    }
    const walk: string[] = [];
    for (let t = 0, last = -1; t < T; t += 1) {
      const f = sys.fieldAt(t);
      if (f.from !== last) walk.push(`${Math.round(f.from)} s ${FIELDS[f.field].name}`);
      last = f.from;
    }
    console.log(`  fields: ${walk.join(' → ')}`);
    console.log(`  over ${MIN} min: ${row.mean.toFixed(2)} held at once on average (0: ${(100 * row.hist[0]).toFixed(0)} %, 1: ${(100 * row.hist[1]).toFixed(0)} %, 2: ${(100 * row.hist[2]).toFixed(0)} %, 3: ${(100 * row.hist[3]).toFixed(0)} %, 4: ${(100 * row.hist[4]).toFixed(0)} %, 5+: ${(100 * (row.hist[5] + row.hist[6])).toFixed(0)} %); nothing sounding ${(100 * row.silent).toFixed(1)} % of the time, ${row.longest.toFixed(1)} s at the longest; ${row.perMin.toFixed(1)} notes a minute; ${row.fills.toFixed(2)} silences filled a minute; ${row.events.toFixed(0)} events a second; ${clash} notes begun on a pitch still held`);
  }
  return row;
}

const many = Number(arg('seeds', '0'));
if (many) {
  let s = 12345;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const rows = Array.from({ length: many }, () => survey(newSeed(rnd), false));
  const col = (f: (r: (typeof rows)[number]) => number) => {
    const v = rows.map(f).sort((a, b) => a - b);
    return `${v[0].toFixed(2)} … ${v[v.length >> 1].toFixed(2)} … ${v[v.length - 1].toFixed(2)}`;
  };
  console.log(`${many} seeds, ${MIN} min each (least … median … most):`);
  console.log(`  held at once, mean      ${col((r) => r.mean)}`);
  console.log(`  nothing sounding, share ${col((r) => r.silent)}`);
  console.log(`  longest silence, s      ${col((r) => r.longest)}`);
  console.log(`  notes a minute          ${col((r) => r.perMin)}`);
  console.log(`  first note, s           ${col((r) => r.first)}`);
  console.log(`  silences filled, a min  ${col((r) => r.fills)}`);
  console.log(`  five or more held       ${col((r) => r.hist[5] + r.hist[6])}`);
  console.log(`  pitch begun while held  ${col((r) => r.clash)}`);
} else {
  const seed = arg('seed', 'kelumo');
  survey(seed, true);
  const S = Number(arg('score', '0'));
  if (S) {
    const sys = seedsSystem(seed);
    const rows: { t: number; s: string }[] = [];
    for (const { p, e, fill } of entriesBetween(sys, 0, S))
      rows.push({ t: e.t, s: `${e.t.toFixed(2).padStart(8)}  ${(p.role.name + (fill ? ' *' : '')).padEnd(15)} ${FIELDS[e.field].name.padEnd(8)} ${e.notes.map((x) => `${name(x.midi)} v${x.vel} ${(x.end - x.t).toFixed(1)}s`).join('  ')}` });
    rows.sort((a, b) => a.t - b.t);
    console.log(rows.map((r) => r.s).join('\n'));
  }
}
