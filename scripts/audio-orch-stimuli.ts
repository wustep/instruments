// Stimulus MIDI files for the audio audit's Orchestra measurements (original material, written for the
// audit: no piece is quoted). A string quintet named and programmed as the Daylight quintet preset routes
// it (Violin I, Violin II, Viola, Violoncello, Contrabass; General MIDI 40, 40, 41, 42, 43): slow sustained
// chords, the same with every line in double stops (dense), a fast passage in sixteenths, and each line at
// its range's extremes, ff. Then the same four sections for the Beethoven 5 lineup's winds and timpani
// (flutes, oboes, clarinets, bassoons, horns, trumpets in pairs; timpani) over the strings.
//   npx tsx scripts/audio-orch-stimuli.ts <out dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? '.cache/audio-audit/stimuli';
mkdirSync(OUT, { recursive: true });
const PPQ = 480;
const vlq = (n: number) => {
  const b = [n & 0x7f];
  while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80);
  return b;
};
type Ev = { tick: number; data: number[] };
function track(name: string, ch: number, program: number, notes: [number, number, number, number][]): number[] {
  // notes: [start beat, length in beats, midi, velocity]
  const ev: Ev[] = [];
  for (const [s, l, m, v] of notes) {
    ev.push({ tick: Math.round(s * PPQ), data: [0x90 | ch, m, v] });
    ev.push({ tick: Math.round((s + l) * PPQ) - 1, data: [0x80 | ch, m, 0] });
  }
  ev.sort((a, b) => a.tick - b.tick || (a.data[0] & 0xf0) - (b.data[0] & 0xf0));
  const nm = [...Buffer.from(name)];
  const bytes: number[] = [0, 0xff, 0x03, ...vlq(nm.length), ...nm, 0, 0xc0 | ch, program];
  let t = 0;
  for (const e of ev) {
    bytes.push(...vlq(e.tick - t), ...e.data);
    t = e.tick;
  }
  bytes.push(0, 0xff, 0x2f, 0);
  return [...Buffer.from('MTrk'), ...u32(bytes.length), ...bytes];
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
function smf(tracks: number[][], bpm: number): Buffer {
  const us = Math.round(60e6 / bpm);
  const tempo = [...Buffer.from('MTrk'), ...u32(11), 0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x2f, 0];
  return Buffer.from([...Buffer.from('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length + 1), ...u16(PPQ), ...tempo, ...tracks.flat()]);
}

/** one line's four sections: chords (beats 0–16), double stops (16–32), sixteenths (32–40), extremes (40–52) */
function line(chord: number[], lo: number, hi: number, dbl: number, run: number[]): [number, number, number, number][] {
  const n: [number, number, number, number][] = [];
  // slow sustained chords, 4 beats each, mf swelling to f
  chord.forEach((m, i) => n.push([i * 4, 4, m, 64 + i * 10]));
  // dense: each chord again with a second note `dbl` above (a double stop), f
  chord.forEach((m, i) => {
    n.push([16 + i * 4, 4, m, 96]);
    n.push([16 + i * 4, 4, m + dbl, 96]);
  });
  // fast: sixteenths at 120 bpm (8 per second), ff accents
  for (let i = 0; i < 32; i++) n.push([32 + i * 0.25, 0.25, run[i % run.length], i % 4 ? 92 : 118]);
  // extremes: the lowest note, then the highest, ff, 4 beats each; then both again pp
  n.push([40, 3, lo, 124], [43, 3, hi, 124], [46, 3, lo, 30], [49, 3, hi, 30]);
  return n;
}
const strings = [
  ['Violin I', 0, 40, line([76, 74, 72, 71], 55, 100, 4, [76, 77, 79, 81, 83, 84, 83, 81])],
  ['Violin II', 1, 40, line([67, 69, 67, 67], 55, 93, 3, [64, 65, 67, 69, 71, 72, 71, 69])],
  ['Viola', 2, 41, line([60, 62, 64, 62], 48, 84, 4, [55, 57, 59, 60, 62, 64, 62, 60])],
  ['Violoncello', 3, 42, line([48, 53, 52, 55], 36, 76, 7, [48, 50, 52, 53, 55, 57, 55, 53])],
  ['Contrabass', 4, 43, line([36, 41, 40, 43], 28, 64, 7, [36, 38, 40, 41, 43, 45, 43, 41])],
] as const;
writeFileSync(join(OUT, 'quintet.mid'), smf(strings.map(([nm, ch, pr, ns]) => track(nm, ch, pr, ns as never)), 60));
// Beethoven 5's lineup: the strings above, and each wind pair on one staff (as the Mutopia file has them:
// the second player takes the lower note), timpani on tonic and dominant
// (MIDI channel 10, index 9, is the drums': skipped. The horn is written a fifth above its sound, as a
// part named "Horn" is read: horn in F)
const winds = [
  ['Flute', 5, 73, 79, 60, 96, 3, 0],
  ['Oboe', 6, 68, 74, 58, 91, 3, 0],
  ['Clarinet', 7, 71, 70, 50, 91, 4, 0],
  ['Bassoon', 8, 70, 48, 34, 75, 4, 0],
  ['Horn', 10, 60, 60, 41, 77, 4, 7],
  ['Trumpet', 12, 56, 67, 55, 84, 5, 0],
] as const;
const windTracks = winds.map(([nm, ch, pr, c, lo, hi, d, w]) => {
  const ns = line([c, c + 2, c + 4, c + 2], lo, hi, d, [c, c + 2, c + 4, c + 5, c + 7, c + 9, c + 7, c + 5]).map(([a, b, m, v]) => [a, b, m + w, v] as [number, number, number, number]);
  // a pair on one staff: the dense section's two notes go to the two players (the file's chords)
  return track(nm, ch, pr, ns as never);
});
const timp: [number, number, number, number][] = [];
for (let i = 0; i < 16; i++) timp.push([i, 0.5, i % 2 ? 43 : 36, 70]);
for (let i = 0; i < 64; i++) timp.push([16 + i * 0.25, 0.25, i % 2 ? 43 : 36, 80 + (i % 4 ? 0 : 30)]);
for (let i = 0; i < 32; i++) timp.push([32 + i * 0.25, 0.25, 36 + (i % 4), i % 4 ? 92 : 118]);
timp.push([40, 3, 36, 124], [43, 3, 57, 124]);
const all = [...strings.map(([nm, ch, pr, ns]) => track(nm, ch, pr, ns as never)), ...windTracks, track('Timpani', 11, 47, timp)];
writeFileSync(join(OUT, 'orchestra.mid'), smf(all, 60));
console.log('wrote', join(OUT, 'quintet.mid'), join(OUT, 'orchestra.mid'));
