// Colour or fault? The recorded double reeds' odd-harmonic share (dB re all harmonics, k ≤ 12) per note and
// dynamic, from the cached analysis of the University of Iowa MIS notes (scripts/ensemble-refs.ts: analysis
// only). scripts/reeds-regimes-mc.ts calls a note "on its octave" when that share is under −20 dB (1 % of
// its power): this prints how many recorded notes would be called so (none: the weakest, the bassoon's A3,
// is at −15 dB).
//   npx tsx scripts/reeds-recorded-odd.ts
import { referenceNotes } from './ensemble-refs.ts';
import { noteName } from './reeds-regimes-mc.ts';

const notes = await referenceNotes();
for (const inst of ['bassoon', 'oboe'] as const) {
  const mine = notes.filter((n) => n.instrument === inst);
  const by = new Map<number, string[]>();
  let low = 0;
  for (const n of mine) {
    const P = n.harm.slice(0, 12).map((d) => 10 ** (d / 10));
    const tot = P.reduce((a, b) => a + b, 0);
    const odd = P.filter((_, k) => k % 2 === 0).reduce((a, b) => a + b, 0);
    const db = 10 * Math.log10(odd / tot + 1e-30);
    if (db < -20) low++;
    by.set(n.midi, [...(by.get(n.midi) ?? []), `${n.dyn} ${db.toFixed(0)}`]);
  }
  console.log(`${inst}: ${mine.length} recorded notes, odd-harmonic share under −20 dB: ${low}`);
  for (const [m, v] of [...by].sort((a, b) => a[0] - b[0])) console.log(`  ${noteName(m).padEnd(4)} ${v.join(', ')}`);
}
