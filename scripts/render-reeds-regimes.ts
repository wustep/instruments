// Clips of the double reeds' wrong regimes, to hear and to see (scripts/reeds-regimes-mc.ts counts them):
//   <inst>-named-<tag>   each named note twice, as heard (the room on): first a player and start time that
//                        speak on the fundamental, then one of the same note that speaks on another regime
//   bassoon-passage-<tag> twelve seconds of Beethoven's Fifth, I, bassoon I, by the first player with wrong
//                        notes in them (index.json says which notes, and when)
// Each as an MP3 (128 kb/s) and a spectrogram PNG, with index.json beside them.
//   npx tsx scripts/render-reeds-regimes.ts [--engine <old>/packages/engine/src/core/index.ts] [--tag before]
//       [--out artifacts/round3/audio-audit-3/reeds]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { noteName, trial } from './reeds-regimes-mc.ts';
import { spectrogramPng } from './spectrogram.ts';
import { foreseen, windParts } from './winds-midi-lib.ts';
import { excerpt, modeOf } from './winds-midi-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
const TAG = opt('--tag', 'after')!;
const OUT = resolve(opt('--out', 'artifacts/round3/audio-audit-3/reeds')!);
const FS = 48000;
mkdirSync(OUT, { recursive: true });
const render: typeof import('../packages/engine/src/core/index.ts').renderInstrument = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
const index: Record<string, unknown> = { engine: ENGINE };

function write(name: string, L: Float32Array, R: Float32Array, fmax: number): void {
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ar', '48000', '-b:a', '128k', join(OUT, `${name}.mp3`)]);
  rmSync(wav);
  const dur = L.length / FS;
  spectrogramPng(join(OUT, `${name}.png`), [{ data: L.map((v, i) => 0.5 * (v + R[i])), fs: FS }], { dur, fmax, win: 4096, hop: Math.max(64, Math.round((dur * FS) / 1200)), range: 70, height: 300 });
}

// the named notes: [instrument, midi, velocity, the contexts looked through]
const NAMED: [('oboe' | 'bassoon'), number, number][] = [
  ['bassoon', 49, 80],
  ['bassoon', 50, 80],
  ['bassoon', 47, 80],
  ['oboe', 67, 80],
  ['oboe', 72, 80],
  ['oboe', 86, 80],
];
for (const inst of ['bassoon', 'oboe'] as const) {
  const Ls: Float32Array[] = [];
  const Rs: Float32Array[] = [];
  const said: string[] = [];
  let at = 0;
  for (const [i, m, vel] of NAMED) {
    if (i !== inst) continue;
    const f0 = 440 * 2 ** ((m - 69) / 12);
    let right: { ctx: string; p: number; s: number } | null = null;
    let wrong: { ctx: string; p: number; s: number; mode: number } | null = null;
    search: for (const ctx of ['hand', 'repeat', 'up', 'rest']) {
      right = wrong = null;
      for (let p = 0; p < 6; p++)
        for (let s = 0; s < 8; s++) {
          const tr = trial(inst, ctx, m, vel, 0.05 + (s * 661) / FS);
          const r = render({ sampleRate: FS, instrument: inst, events: tr.events, duration: tr.dur, dry: true, player: p });
          const a = Math.round(tr.at * FS);
          const b = Math.round((tr.at + tr.len) * FS);
          const mode = modeOf(r.left, FS, f0, Math.round(a + 0.4 * (b - a)), Math.round(a + 0.9 * (b - a)));
          if (mode === 1 && !right) right = { ctx, p, s };
          if (mode !== 1 && !wrong) wrong = { ctx, p, s, mode };
          if (right && wrong) break search;
        }
    }
    if (!right || !wrong) {
      said.push(`${noteName(m)}: no wrong regime found in 48 trials a context`);
      continue;
    }
    for (const x of [right, wrong]) {
      const tr = trial(inst, x.ctx, m, vel, 0.05 + (x.s * 661) / FS);
      const r = render({ sampleRate: FS, instrument: inst, events: tr.events, duration: tr.dur + 0.5, dry: false, player: x.p });
      Ls.push(r.left);
      Rs.push(r.right);
      said.push(`${at.toFixed(2)} s: ${noteName(m)} v${vel} (${x.ctx}, player ${x.p}, start ${x.s}): ${x === right ? 'on its fundamental' : `on regime ${(x as typeof wrong).mode}`}`);
      at += r.left.length / FS;
    }
  }
  const cat = (xs: Float32Array[]) => {
    const o = new Float32Array(xs.reduce((n, x) => n + x.length, 0));
    let k = 0;
    for (const x of xs) {
      o.set(x, k);
      k += x.length;
    }
    return o;
  };
  write(`${inst}-named-${TAG}`, cat(Ls), cat(Rs), inst === 'oboe' ? 6000 : 3000);
  index[`${inst}-named-${TAG}`] = said;
  console.log(`${inst}-named-${TAG}:\n  ${said.join('\n  ')}`);
}

// a passage: Beethoven's Fifth, I, bassoon I, the twelve seconds with the most wrong notes of the first
// player (of six) who has any
{
  const part = windParts().find((x) => x.name.includes('beethoven5-i bassoon 1'))!;
  const ex = excerpt(part, 0, part.duration);
  const ev = [...foreseen(ex.notes), ...ex.events];
  let best: { p: number; t: number; wrong: { t: number; midi: number; mode: number }[] } | null = null;
  const perPlayer: number[] = [];
  for (let p = 0; p < 6; p++) {
    const r = render({ sampleRate: FS, instrument: 'bassoon', events: ev, duration: ex.dur, dry: true, player: p });
    const wrong: { t: number; midi: number; mode: number }[] = [];
    ex.notes.forEach((n, i) => {
      const a = Math.round(n.t * FS);
      const next = ex.notes[i + 1];
      const stop = next && next.t < n.end ? Math.round(next.t * FS) : Math.round(n.end * FS);
      const mode = modeOf(r.left, FS, 440 * 2 ** ((n.midi - 69) / 12), Math.round(a + 0.4 * (stop - a)), Math.round(a + 0.9 * (stop - a)));
      if (mode !== 1) wrong.push({ t: n.t, midi: n.midi, mode });
    });
    perPlayer.push(wrong.length);
    for (const w of wrong) {
      const t = Math.max(0, w.t - 4);
      const inWin = wrong.filter((x) => x.t >= t && x.t < t + 12);
      if (!best || inWin.length > best.wrong.length) best = { p, t, wrong: inWin };
    }
  }
  if (best) {
    const r = render({ sampleRate: FS, instrument: 'bassoon', events: ev, duration: Math.min(ex.dur, best.t + 12.5), dry: false, player: best.p });
    const a = Math.round(best.t * FS);
    const said = best.wrong.map((w) => `${(w.t - best!.t).toFixed(2)} s: ${noteName(w.midi)} on regime ${w.mode}`);
    write(`bassoon-passage-${TAG}`, r.left.slice(a, a + 12 * FS), r.right.slice(a, a + 12 * FS), 3000);
    index[`bassoon-passage-${TAG}`] = { piece: 'Beethoven 5 I, bassoon I', player: best.p, from: +best.t.toFixed(2), wrongNotesPerPlayer: perPlayer, wrong: said };
    console.log(`bassoon-passage-${TAG}: player ${best.p}, from ${best.t.toFixed(1)} s; wrong notes a performance ${perPlayer.join(' ')}\n  ${said.join('\n  ')}`);
  } else console.log(`bassoon-passage-${TAG}: no wrong note in six performances (${perPlayer.join(' ')})`);
}
writeFileSync(join(OUT, `index-${TAG}.json`), JSON.stringify(index, null, 1));
