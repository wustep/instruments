// A short étude for a violin alone, written for these clips (Fable 5.2; not bundled, not committed: the
// file is made here): what a bow has to do in half a minute. Long joined notes; a rest; a quick run by
// step; short notes apart; a long rest; an upbeat to a long note; an arpeggio over the four strings;
// two slurs written as overlaps, one of them a shift up the E string; a long soft close.
//   node artifacts/bow-polish/tools/etude.mjs [out.mid]
import { writeFileSync } from 'node:fs';

const PPQ = 480;
const BPM = 96;
/** [beat, beats sounding, midi, velocity] */
const N = [];
let b = 0;
const add = (len, midi, vel, sound = len) => {
  N.push([b, sound, midi, vel]);
  b += len;
};
const rest = (len) => (b += len);
// 1. a tune in long notes, each joined to the next, growing
add(2, 74, 60);
add(1, 76, 64);
add(1, 78, 68);
add(1.5, 79, 74);
add(0.5, 78, 72);
add(2, 76, 70);
rest(1);
// 2. a quick run by step, sixteenths end to end, onto a half note
for (const m of [74, 76, 78, 79, 81, 79, 78, 76, 74, 73, 71, 69]) add(0.25, m, 72);
add(2, 74, 76);
// 3. short notes apart
for (const m of [69, 69, 74, 78]) add(0.5, m, 78, 0.2);
rest(2.5);
// 4. three notes up to a long one
for (const m of [69, 71, 73]) add(0.5, m, 70);
add(3, 74, 84);
// 5. over the four strings and back
for (const m of [55, 62, 71, 79, 71, 62, 55, 62]) add(0.5, m, 74);
// 6. two slurs (the notes overlap): a shift up the E string, and a step down
add(1, 81, 80, 1.06);
add(1, 86, 80);
add(1, 85, 76, 1.06);
add(1, 83, 74);
// 7. a long soft close
add(2, 76, 62);
add(5, 74, 54);

const vlq = (n) => {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};
const ev = [];
for (const [at, len, midi, vel] of N) {
  ev.push([Math.round(at * PPQ), 1, [0x90, midi, vel]]);
  ev.push([Math.round((at + len) * PPQ), 0, [0x80, midi, 0]]);
}
// (at one tick a note's end before the next one's start)
ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
const name = [...Buffer.from('Violin')];
const us = Math.round(60e6 / BPM);
const trk = [0, 0xff, 0x03, name.length, ...name, 0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xc0, 40];
let last = 0;
for (const [t, , bytes] of ev) {
  trk.push(...vlq(t - last), ...bytes);
  last = t;
}
trk.push(0, 0xff, 0x2f, 0);
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const file = Buffer.from([...Buffer.from('MThd'), ...u32(6), 0, 0, 0, 1, PPQ >> 8, PPQ & 255, ...Buffer.from('MTrk'), ...u32(trk.length), ...trk]);
const out = process.argv[2] ?? new URL('../etude-violin.mid', import.meta.url).pathname;
writeFileSync(out, file);
console.log(`${out}: ${N.length} notes, ${((b * 60) / BPM).toFixed(1)} s`);
