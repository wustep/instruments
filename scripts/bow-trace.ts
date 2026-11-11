// The bow's path through a passage, measured offline: one line of a MIDI file played on a bowed
// instrument's engine (dry, as the file player would send it), the bow's place along the hair, its
// direction and its changes sampled every 10 ms, with the notes under them.
//   npx tsx scripts/bow-trace.ts --file <mid> --line <n|all> --instrument violin --from 0 --to 30 \
//     [--plan] --out <trace.json>
//   npx tsx scripts/bow-trace.ts --plot <before.json> <after.json> --out <picture.svg> [--title "…"] [--flat]
// (--flat: the notes as lengths only, on one level: for a score that is not ours to print)
// --plan tells the engine the notes to come as the file player does (the lookahead of bowed.ts: each
// note's start, strength and length, LOOK seconds before it sounds); without it the engine hears each
// note only as it begins, as from the keys. The numbers printed: strokes, changes of bow inside a note
// (not at a note's start), strokes that could not alternate (the same way twice), the share of the
// bowed time spent within 4 % of the frog or the tip, the level (dB RMS of the dry output).
import { readFileSync, writeFileSync } from 'node:fs';
import { BowedCore } from '../packages/engine/src/core/index.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { placeNote } from '../apps/web/src/orchestra/assign.ts';

const arg = (k: string, d = ''): string => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : (process.argv[i + 1] ?? '');
};
const has = (k: string) => process.argv.includes(`--${k}`);

interface Trace {
  title: string;
  plan: boolean;
  dt: number;
  pos: number[];
  dir: number[];
  changing: number[];
  bowing: number[];
  speed: number[];
  notes: { t: number; dur: number; midi: number; vel: number }[];
  metrics: Record<string, number>;
}

if (has('plot')) {
  const i = process.argv.indexOf('--plot');
  const a = JSON.parse(readFileSync(process.argv[i + 1], 'utf8')) as Trace;
  const b = JSON.parse(readFileSync(process.argv[i + 2], 'utf8')) as Trace;
  writeFileSync(arg('out'), plot([a, b], ['before', 'after'], arg('title', a.title), has('flat')));
  process.exit(0);
}

const FS = 48000;
const inst = arg('instrument', 'violin') as 'violin' | 'viola' | 'cello' | 'bass';
const from = Number(arg('from', '0'));
const to = Number(arg('to', '30'));
const lineArg = arg('line', 'all');
const buf = readFileSync(arg('file'));
const song = parseMidi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
const wanted = (l?: number) => lineArg === 'all' || l === Number(lineArg);
const ev = song.events.filter((e) => (e.kind === 'on' || e.kind === 'off') && wanted(e.line) && e.t >= from && e.t < to);
// each note's length: to its own off (the last ones end with the passage)
const notes: Trace['notes'] = [];
const open = new Map<number, Trace['notes'][number][]>();
for (const e of ev) {
  if (e.kind !== 'on' && e.kind !== 'off') continue;
  const m = placeNote(e.midi, 0, inst);
  if (e.kind === 'on') {
    const n = { t: e.t - from, dur: to - e.t, midi: m, vel: e.vel };
    notes.push(n);
    open.set(m, [...(open.get(m) ?? []), n]);
  } else {
    const n = open.get(m)?.shift();
    if (n) n.dur = e.t - from - n.t;
  }
}
const core = new BowedCore({ sampleRate: FS, instrument: inst, dry: true });
const plan = has('plan');
const T0 = 0.1;
// (in the order the file has them: a note let go as the next begins is let go first)
const sent = new Set<object>();
for (const e of ev) {
  if (e.kind !== 'on' && e.kind !== 'off') continue;
  const m = placeNote(e.midi, 0, inst);
  const f = Math.round((T0 + e.t - from) * FS);
  if (e.kind === 'on') {
    const n = notes.find((q) => !sent.has(q) && q.midi === m && Math.abs(q.t - (e.t - from)) < 1e-9);
    if (n) sent.add(n);
    if (plan && n) core.schedule({ type: 'foresee', midi: m, velocity: e.vel, dur: n.dur }, f);
    core.schedule({ type: 'noteOn', midi: m, velocity: e.vel }, f);
  } else core.schedule({ type: 'noteOff', midi: m }, f);
}
const dur = to - from + 0.6;
const L = new Float32Array(480);
const R = new Float32Array(480);
const tr: Trace = { title: `${arg('file').split('/').pop()} line ${lineArg} on the ${inst}, ${from}–${to} s`, plan, dt: 0.01, pos: [], dir: [], changing: [], bowing: [], speed: [], notes: notes.map((n) => ({ ...n, t: n.t + T0 })), metrics: {} };
let sq = 0;
let nsq = 0;
for (let i = 0; i < Math.round(dur * 100); i++) {
  core.process(L, R, 480);
  for (let k = 0; k < 480; k++) sq += L[k] * L[k];
  nsq += 480;
  const v = core.getVisual(8) as { bow: { dir: number; pos: number; changing: boolean; speed: number } };
  tr.pos.push(Math.round(v.bow.pos * 1e4) / 1e4);
  tr.dir.push(v.bow.dir);
  tr.changing.push(v.bow.changing ? 1 : 0);
  tr.bowing.push(core.strings.some((s) => s.bowing) ? 1 : 0);
  tr.speed.push(Math.round(Math.max(...core.strings.map((s) => (s.bowing ? s.vBow : 0))) * 1e4) / 1e4);
}
// ---- the numbers
const onsets = tr.notes.map((n) => n.t);
const nearOnset = (t: number) => onsets.some((o) => Math.abs(o - t) < 0.08);
let strokes = 0;
let mid = 0;
let same = 0;
let ends = 0;
let bowed = 0;
let lastDir = 0;
for (let i = 1; i < tr.pos.length; i++) {
  const t = i * tr.dt;
  if (tr.bowing[i]) {
    bowed++;
    if (tr.pos[i] < 0.04 || tr.pos[i] > 0.96) ends++;
  }
  const began = tr.bowing[i] && !tr.bowing[i - 1];
  const turned = tr.bowing[i] && tr.bowing[i - 1] && tr.dir[i] !== tr.dir[i - 1];
  if (began || turned) {
    strokes++;
    if (turned && !nearOnset(t)) mid++;
    if (began && lastDir === tr.dir[i] && strokes > 1) same++;
    lastDir = tr.dir[i];
  }
}
tr.metrics = { notes: tr.notes.length, strokes, midNoteChanges: mid, sameWayTwice: same, atAnEndPct: Math.round((1000 * ends) / Math.max(1, bowed)) / 10, rmsDb: Math.round(100 * 10 * Math.log10(sq / nsq + 1e-20)) / 100 };
if (arg('out')) writeFileSync(arg('out'), JSON.stringify(tr));
console.log(tr.title, plan ? '(lookahead)' : '(as from the keys)', JSON.stringify(tr.metrics));

/** before over after: the notes as bars (by pitch), the bow's place on the hair over them (0 the frog,
 *  1 the tip), down-bows and up-bows in two inks, a dot at each change inside a note */
function plot(trs: Trace[], names: string[], title: string, flat = false): string {
  const W = 1600;
  const H = 300;
  const M = { l: 70, r: 20, t: 46, b: 30 };
  const n = Math.max(...trs.map((t) => t.pos.length));
  const X = (i: number) => M.l + ((W - M.l - M.r) * i) / n;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H * trs.length + 30}" viewBox="0 0 ${W} ${H * trs.length + 30}" font-family="Menlo, monospace" font-size="13">`;
  out += `<rect width="100%" height="100%" fill="#14110f"/><text x="${M.l}" y="20" fill="#e8e0d0">${title.replace(/&/g, '&amp;')}</text>`;
  trs.forEach((t, k) => {
    const y0 = 30 + k * H + M.t;
    const h = H - M.t - M.b;
    const Y = (p: number) => y0 + h * (1 - p);
    const lo = Math.min(...t.notes.map((q) => q.midi));
    const hi = Math.max(...t.notes.map((q) => q.midi));
    out += `<text x="${M.l}" y="${y0 - 12}" fill="#b8ae9c">${names[k]}: ${Object.entries(t.metrics).map(([a, b]) => `${a} ${b}`).join(' · ')}</text>`;
    out += `<rect x="${M.l}" y="${y0}" width="${W - M.l - M.r}" height="${h}" fill="#1c1815" stroke="#3a332c"/>`;
    out += `<text x="8" y="${Y(0) + 4}" fill="#8a8072">frog</text><text x="8" y="${Y(1) + 4}" fill="#8a8072">tip</text>`;
    for (const q of t.notes) {
      const x = X(q.t / t.dt);
      const w = Math.max(1, X((q.t + q.dur) / t.dt) - x - 1);
      const y = flat ? y0 + h - 8 : y0 + h - 6 - ((h - 12) * (q.midi - lo)) / Math.max(1, hi - lo);
      out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="5" fill="#6b5f50" opacity="0.75"/>`;
      out += `<line x1="${x.toFixed(1)}" y1="${y0}" x2="${x.toFixed(1)}" y2="${y0 + h}" stroke="#3a332c" stroke-width="0.6"/>`;
    }
    // the bow's path, a run per direction
    let seg = '';
    let d = 0;
    const flush = () => {
      if (seg) out += `<polyline points="${seg}" fill="none" stroke="${d > 0 ? '#e8e0d0' : '#e2573a'}" stroke-width="2"/>`;
      seg = '';
    };
    for (let i = 0; i < t.pos.length; i++) {
      if (!t.bowing[i]) {
        flush();
        continue;
      }
      if (t.dir[i] !== d) {
        const last = seg.split(' ').pop() ?? '';
        flush();
        seg = last;
        d = t.dir[i];
      }
      seg += `${seg ? ' ' : ''}${X(i).toFixed(1)},${Y(t.pos[i]).toFixed(1)}`;
    }
    flush();
    const ons = t.notes.map((q) => q.t);
    for (let i = 1; i < t.pos.length; i++)
      if (t.bowing[i] && t.bowing[i - 1] && t.dir[i] !== t.dir[i - 1] && !ons.some((o) => Math.abs(o - i * t.dt) < 0.08)) out += `<circle cx="${X(i).toFixed(1)}" cy="${Y(t.pos[i]).toFixed(1)}" r="5" fill="none" stroke="#f2c14e" stroke-width="2"/>`;
    for (let s = 0; s * 100 < n; s += n > 3000 ? 5 : 1) out += `<text x="${X(s * 100)}" y="${y0 + h + 16}" fill="#8a8072" text-anchor="middle">${s}s</text>`;
  });
  out += `<text x="${W - M.r}" y="20" fill="#8a8072" text-anchor="end">white: down-bow · red: up-bow · ring: a change inside a note</text></svg>`;
  return out;
}
