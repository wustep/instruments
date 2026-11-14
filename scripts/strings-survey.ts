// How a file's string lines are written: for each line, its notes' lengths and how each meets the next
// (a rest, end to end, an overlap), the figures the bow's planning turns on.
//   npx tsx scripts/strings-survey.ts [file.mid …]   (default: every bundled piece; --all: every line)
import { readFileSync, readdirSync } from 'node:fs';
import { parseMidi } from '../apps/web/src/midi-file.ts';

const dir = 'apps/web/public/pieces';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const all = process.argv.includes('--all');
const files = args.length ? args : readdirSync(dir).filter((f) => f.endsWith('.mid')).map((f) => `${dir}/${f}`);
const isString = (name: string, prog: number | undefined) => /viol|cell|bass|vln|vla|vc|cb|string|contrab|alto/i.test(name) || (prog !== undefined && prog >= 40 && prog <= 51);
const q = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN);
for (const f of files) {
  const b = readFileSync(f);
  const song = parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  console.log(`\n${f.split('/').pop()}  (${song.duration.toFixed(0)} s, ${song.lines.length} lines)`);
  song.lines.forEach((ln, i) => {
    const l = ln as unknown as { name?: string; instrument?: string; program?: number };
    const name = `${l.name ?? ''} ${l.instrument ?? ''}`.trim();
    if (!all && !isString(name, l.program)) return;
    const notes: { t: number; off: number; midi: number }[] = [];
    const open = new Map<number, { t: number; off: number; midi: number }[]>();
    for (const e of song.events) {
      if (e.line !== i) continue;
      if (e.kind === 'on') {
        const n = { t: e.t, off: NaN, midi: e.midi };
        notes.push(n);
        open.set(e.midi, [...(open.get(e.midi) ?? []), n]);
      } else if (e.kind === 'off') {
        const n = open.get(e.midi)?.shift();
        if (n) n.off = e.t;
      }
    }
    let rest = 0, joined = 0, over = 0, chord = 0, gapS = 0;
    const lens: number[] = [];
    const jl: number[] = [];
    const step: number[] = [];
    for (let k = 0; k < notes.length; k++) {
      const n = notes[k];
      lens.push(n.off - n.t);
      const nx = notes[k + 1];
      if (!nx) continue;
      const gap = nx.t - n.off;
      if (nx.t - n.t < 0.005) chord++;
      else if (gap > 0.12) rest++;
      else if (gap > 0.012) gapS++;
      else if (gap >= -0.012) {
        joined++;
        jl.push(n.off - n.t);
        step.push(Math.abs(nx.midi - n.midi));
      } else over++;
    }
    const n = Math.max(1, notes.length - 1);
    const pc = (x: number) => `${Math.round((100 * x) / n)}%`.padStart(4);
    console.log(
      `  ${String(i).padStart(2)} ${name.slice(0, 26).padEnd(26)} p${String(l.program ?? '-').padStart(3)} ${String(notes.length).padStart(5)} notes  len q10/50/90 ${q(lens, 0.1).toFixed(2)}/${q(lens, 0.5).toFixed(2)}/${q(lens, 0.9).toFixed(2)}  joined ${pc(joined)} (≤0.25 s: ${pc(jl.filter((x) => x <= 0.25).length)}, steps≤2: ${pc(step.filter((x, k) => x <= 2 && x > 0 && jl[k] <= 0.25).length)})  short gap ${pc(gapS)}  rest ${pc(rest)}  overlap ${pc(over)}  chord ${pc(chord)}`,
    );
  });
}
