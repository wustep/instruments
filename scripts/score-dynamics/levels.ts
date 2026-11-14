// A rendered piece's level in time, part by part: the stems of scripts/render-orchestra.ts (--stems --wav)
// read in windows, dB RMS, with the mix; given two folders, the first (before) under the second (after).
// What a piece's dynamics come to as sound: its range, and each part's place under the others.
//   npx tsx scripts/score-dynamics/levels.ts --piece haydn --dir <after> [--before <dir>] [--window 2] [--svg out.svg]
// --svg: the mix's level in time as a picture (quarter-second windows), before under after;
// --stem 09-viola: one part's instead of the mix's
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav } from '../../packages/engine/src/analysis/wav.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const piece = opt('--piece')!;
const W = Number(opt('--window') ?? 2);

function table(dir: string): { names: string[]; rows: number[][]; range: number[] } {
  const stems = readdirSync(dir).filter((f) => f.startsWith(`${piece}-`) && /-\d\d-\w+\.wav$/.test(f)).sort();
  const files = [...stems, `${piece}.wav`];
  const cols = files.map((f) => {
    const a = decodeWav(new Uint8Array(readFileSync(join(dir, f))));
    const n = Math.round(W * a.sampleRate);
    const out: number[] = [];
    for (let i = 0; i + n <= a.channels[0].length; i += n) {
      let s = 0;
      for (const ch of a.channels) for (let k = i; k < i + n; k++) s += ch[k] * ch[k];
      out.push(10 * Math.log10(s / (n * a.channels.length) + 1e-12));
    }
    return out;
  });
  const rows = cols[0].map((_, i) => cols.map((c) => c[i]));
  // each column's range: its 95th centile less its 10th, over the windows where it sounds (above −70 dB)
  const range = cols.map((c) => {
    const s = c.filter((x) => x > -70).sort((a, b) => a - b);
    return s.length ? s[Math.floor(0.95 * (s.length - 1))] - s[Math.floor(0.1 * (s.length - 1))] : 0;
  });
  return { names: files.map((f) => (f === `${piece}.wav` ? 'mix' : f.replace(`${piece}-`, '').replace('.wav', '').replace(/^(\d\d)-(\w{0,5}).*/, '$1 $2'))), rows, range };
}
const show = (label: string, t: ReturnType<typeof table>) => {
  console.log(`\n${label}\n   s  ${t.names.map((n) => n.padStart(8)).join('')}`);
  t.rows.forEach((r, i) => console.log(`${String(i * W).padStart(4)}  ${r.map((x) => (x < -70 ? '       ·' : x.toFixed(1).padStart(8))).join('')}`));
  console.log(`range ${t.range.map((x) => x.toFixed(1).padStart(8)).join('')}   (dB, the 95th centile of the windows less the 10th)`);
};
if (opt('--before')) show(`${piece}, before`, table(opt('--before')!));
show(`${piece}${opt('--before') ? ', after' : ''}`, table(opt('--dir')!));

/** the mix's (or one stem's) level in quarter-second windows (dB RMS over both channels) */
function mixCurve(dir: string): number[] {
  const a = decodeWav(new Uint8Array(readFileSync(join(dir, opt('--stem') ? `${piece}-${opt('--stem')}.wav` : `${piece}.wav`))));
  const n = Math.round(0.25 * a.sampleRate);
  const out: number[] = [];
  for (let i = 0; i + n <= a.channels[0].length; i += n) {
    let s = 0;
    for (const ch of a.channels) for (let k = i; k < i + n; k++) s += ch[k] * ch[k];
    out.push(Math.max(-60, 10 * Math.log10(s / (n * a.channels.length) + 1e-12)));
  }
  return out;
}
if (opt('--svg')) {
  const after = mixCurve(opt('--dir')!);
  const before = opt('--before') ? mixCurve(opt('--before')!) : null;
  const [W, H, L, T, R, B] = [900, 300, 46, 34, 20, 30];
  const top = Math.max(...after, ...(before ?? []));
  const hi = Math.ceil((top + 2) / 6) * 6;
  const lo = hi - 36;
  const x = (i: number) => L + ((W - L - R) * i) / (after.length - 1);
  const y = (db: number) => T + ((H - T - B) * (hi - Math.min(hi, Math.max(lo, db)))) / (hi - lo);
  const path = (c: number[]) => c.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, 6, 12, 18, 24, 30, 36].map((d) => hi - d);
  const secs = Array.from({ length: Math.floor(after.length / 20) + 1 }, (_, i) => i * 5);
  const font = `font-family="IBM Plex Sans, Helvetica, Arial, sans-serif" font-size="11" fill="#555"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="${L}" y="18" ${font} font-size="13" fill="#111">${opt('--title') ?? piece}: ${opt('--stem') ? 'its' : 'the mix’s'} level, dB RMS (quarter-second windows)</text>
<line x1="${W - R - 150}" x2="${W - R - 128}" y1="14" y2="14" stroke="#9a9a9a" stroke-width="1.5"/><text x="${W - R - 122}" y="18" ${font}>before</text><line x1="${W - R - 70}" x2="${W - R - 48}" y1="14" y2="14" stroke="#1f5fbf" stroke-width="2"/><text x="${W - R - 42}" y="18" ${font}>after</text>
${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e6e6e6"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" ${font}>${t}</text>`).join('\n')}
${secs.map((t) => `<text x="${x(t * 4)}" y="${H - 10}" text-anchor="middle" ${font}>${t} s</text>`).join('\n')}
${before ? `<path d="${path(before)}" fill="none" stroke="#9a9a9a" stroke-width="1.5"/>` : ''}
<path d="${path(after)}" fill="none" stroke="#1f5fbf" stroke-width="2"/>
</svg>`;
  writeFileSync(opt('--svg')!, svg);
}
