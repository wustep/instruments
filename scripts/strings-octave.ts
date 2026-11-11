// Notes that sound an octave low (audio audit 3): how often, for how long, and where it comes from, on
// this checkout's engine or another's. Two readings of every note, every 5 ms (scripts/strings-lib.ts):
//   the string  its own velocity under the bow: octave low (period-doubled: the octave below's harmonics
//               within 12 dB of the note's and 6 dB over what lies between them) or rough (no pitch);
//   the sound   the same of what is heard (dry), where anything else still ringing counts as well.
// A note is counted when the reading holds for a quarter of it (30 ms at least). A sound reading with
// the string in Helmholtz motion is a ring: it is told apart by whether it was there before the note
// began (the 40 ms before it, on the same frequencies, within 6 dB of what the note has of them).
//   npx tsx scripts/strings-octave.ts [violin] [--engine <repo>/packages/engine/src/core/index.ts]
//       [--grid] [--pieces beethoven5-i,toward-morning,haydn] [--list] [--json out.json]
// --grid: single notes A4–A5 as a file plays them (the bow planned ahead), pp/mf/ff (v40/80/115), 0.15, 0.3,
//   0.6 and 1 s, three players: after a rest (alone); inside a line (the third of three detached notes,
//   55 ms between them, the two before it a fifth and a third above: the fifth's fundamental lies on the
//   third harmonic of the measured note's octave below, so whatever of it still rings reads as that
//   octave); slurred from the note a step above. With the bow's force over Schelleng's maximum for the
//   note's speed and contact point, its speed and its contact point, 30 ms into the note.
// --pieces: the instrument's parts of the bundled pieces as the browser plays them, note by note, single
//   notes only (no other note of the part within 20 ms of it: double stops are not faults).
import { writeFileSync } from 'node:fs';
import { engine, et, filed, name, readNote, shares, stringParts, trace, type Ev } from './strings-lib.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const inst = args.find((a) => ['violin', 'viola', 'cello', 'bass'].includes(a)) ?? 'violin';
const eng = await engine(opt('--engine', ''));
const FS = 48000;
const LIST = args.includes('--list');
const json: Record<string, unknown> = {};

interface Read {
  /** the string: octave low, rough */
  sLow: boolean;
  sRough: boolean;
  /** the sound: octave low; and of those, there before the note began (a ring) */
  xLow: boolean;
  ring: boolean;
  /** when the string settles into the note's own motion, s */
  settled: number;
  /** the sound's octave-below harmonics over the note's, its second half, dB */
  subDb: number;
}

function read(t: ReturnType<typeof trace>, t0: number, t1: number, midi: number): Read {
  const f0 = et(midi);
  const d = t1 - t0;
  const v = readNote(t.v, FS, t0, t1, f0);
  const x = readNote(t.x, FS, t0, t1, f0);
  const hold = (s: number) => s >= 0.03 && s >= 0.25 * d;
  const xLow = hold(x.low);
  let ring = false;
  if (xLow) {
    // what was on the octave below's harmonics as the note began, against what is there in its first half
    const W = Math.round(0.04 * FS);
    const before = shares(t.x, FS, Math.round(t0 * FS) - W, W, f0).S;
    const during = shares(t.x, FS, Math.round((t0 + Math.min(0.1, 0.25 * d)) * FS), W, f0).S;
    ring = before > during / 4;
  }
  return { sLow: hold(v.low), sRough: hold(v.rough), xLow, ring, settled: v.settled, subDb: x.subDb };
}

const pct = (a: number, n: number) => `${a} (${((100 * a) / Math.max(1, n)).toFixed(1)} %)`;

if (args.includes('--grid')) {
  console.log(`${inst}: single notes A4–A5 as a file plays them (13 pitches × 4 lengths × 3 players per row)`);
  console.log('context      dyn   notes  string: octave low  rough   settles (median, worst) ms   sound: octave low  of them a ring   F/Fmax  v m/s    β');
  const rows: Record<string, unknown>[] = [];
  for (const ctx of ['rest', 'line', 'slur'] as const)
    for (const [dyn, vel] of [['pp', 40], ['mf', 80], ['ff', 115]] as const) {
      let n = 0;
      let sLow = 0;
      let sRough = 0;
      let xLow = 0;
      let ring = 0;
      const set: number[] = [];
      let fr = 0;
      let vb = 0;
      let be = 0;
      for (let m = 69; m <= 81; m++)
        for (const dur of [0.15, 0.3, 0.6, 1])
          for (let player = 0; player < 3; player++) {
            const ev: Ev[] = [];
            let t0 = 0.1;
            if (ctx === 'line') {
              ev.push(...filed(t0, m + 7, vel, dur), ...filed(t0 + dur + 0.055, m + 4, vel, dur));
              t0 += 2 * (dur + 0.055);
            } else if (ctx === 'slur') {
              ev.push(...filed(t0, m + 2, vel, dur + 0.02));
              t0 += dur;
            }
            ev.push(...filed(t0, m, vel, dur));
            const t = trace(eng, { instrument: inst, events: ev, duration: t0 + dur + 0.2, fs: FS, player });
            const r = read(t, t0, t0 + dur, m);
            n++;
            if (r.sLow) sLow++;
            if (r.sRough) sRough++;
            if (r.xLow) xLow++;
            if (r.ring) ring++;
            set.push(r.settled < 0 ? dur : r.settled);
            const b = Math.floor(((t0 + 0.03) * FS) / 128);
            fr += t.ctl.fBow[b] / t.ctl.fMax[b];
            vb += Math.abs(t.ctl.vBow[b]);
            be += t.ctl.beta[b];
            if (LIST && (r.sLow || r.xLow)) console.log(`   ${ctx} ${dyn} ${name(m)} ${dur} s player ${player}: string ${r.sLow ? 'octave low' : 'in the note'}, sound ${r.xLow ? (r.ring ? 'octave low (a ring from before)' : 'octave low') : 'in the note'}; octave below ${r.subDb.toFixed(1)} dB`);
          }
      set.sort((a, b) => a - b);
      const row = { ctx, dyn, n, sLow, sRough, xLow, ring, settleMs: 1000 * set[n >> 1], settleWorstMs: 1000 * set[n - 1] };
      rows.push(row);
      console.log(`${ctx.padEnd(12)} ${dyn}    ${String(n).padStart(4)}   ${pct(sLow, n).padStart(12)}  ${pct(sRough, n).padStart(12)}   ${(1000 * set[n >> 1]).toFixed(0).padStart(4)} ${(1000 * set[n - 1]).toFixed(0).padStart(5)}             ${pct(xLow, n).padStart(12)}  ${String(ring).padStart(5)}           ${(fr / n).toFixed(2)}   ${(vb / n).toFixed(3)}  ${(be / n).toFixed(3)}`);
    }
  json.grid = rows;
}

const pieces = opt('--pieces', args.includes('--grid') ? '' : 'beethoven5-i,toward-morning,haydn').split(',').filter(Boolean);
if (pieces.length) {
  console.log(`\n${inst} parts of the bundled pieces, as the browser plays them: single notes of 80 ms or more`);
  console.log('part                         single  short (< 0.5 s)   string: octave low  rough   sound: octave low  of them a ring   short ones');
  const rows: Record<string, unknown>[] = [];
  for (const p of stringParts([inst as never], pieces)) {
    const t = trace(eng, { instrument: inst, events: p.events, duration: p.duration + 0.5, fs: FS, player: p.player });
    let n = 0;
    let short = 0;
    let sLow = 0;
    let sRough = 0;
    let xLow = 0;
    let xShort = 0;
    let ring = 0;
    p.notes.forEach((q, i) => {
      const d = q.end - q.t;
      if (d < 0.08) return;
      for (let j = Math.max(0, i - 8); j < Math.min(p.notes.length, i + 8); j++) if (j !== i && Math.min(p.notes[j].end, q.end) - Math.max(p.notes[j].t, q.t) > 0.02) return;
      const r = read(t, q.t, q.end, q.midi);
      n++;
      if (d < 0.5) short++;
      if (r.sLow) sLow++;
      if (r.sRough) sRough++;
      if (r.xLow) {
        xLow++;
        if (d < 0.5) xShort++;
        if (r.ring) ring++;
        if (LIST) console.log(`   ${p.name} ${q.t.toFixed(2)} s ${name(q.midi)} v${q.vel} ${d.toFixed(2)} s after ${i ? name(p.notes[i - 1].midi) : '–'}: octave below ${r.subDb.toFixed(1)} dB${r.ring ? ' (a ring from before)' : ''}`);
      }
    });
    rows.push({ part: p.name, n, short, sLow, sRough, xLow, xShort, ring });
    console.log(`${p.name.padEnd(28)} ${String(n).padStart(5)}  ${String(short).padStart(6)}         ${pct(sLow, n).padStart(12)}  ${pct(sRough, n).padStart(12)}   ${pct(xLow, n).padStart(12)}  ${String(ring).padStart(5)}        ${pct(xShort, short).padStart(12)}`);
  }
  json.pieces = rows;
}
if (args.includes('--json')) writeFileSync(opt('--json', ''), JSON.stringify(json, null, 1));
