// The winds' 10–90 % attack times next to the Iowa recordings', per dynamic (medians and the mean
// |log2| error): what the trumpet's tongue kick and attack boost were chosen against.
//   [ENGINE=<core/index.ts>] [V=1] [TPT='{"kick":0.3,"ab":1.5}'] npx tsx scripts/wind-attack.ts
import { compareAll, useEngine } from './calibrate-ensemble.ts';
await useEngine(process.env.ENGINE || undefined);
for (const inst of ['trumpet', 'flute']) {
  const ps = await compareAll({ only: [inst] as never });
  for (const dyn of ['pp', 'mf', 'ff']) {
    const xs = ps.filter((p: any) => p.ref.dyn === dyn && p.model);
    const med = (a: number[]) => a.filter(Number.isFinite).sort((x, y) => x - y)[Math.floor(a.filter(Number.isFinite).length / 2)];
    console.log(inst, dyn, 'n', xs.length, 'ref attack median', med(xs.map((p: any) => p.ref.attackMs))?.toFixed(0), 'model', med(xs.map((p: any) => p.model.attackMs))?.toFixed(0),
      'mean |log2|', (xs.map((p: any) => Math.abs(Math.log2(p.model.attackMs / p.ref.attackMs))).filter(Number.isFinite).reduce((a: number, b: number) => a + b, 0) / xs.length).toFixed(2));
    if (process.env.V) console.log(xs.map((p: any) => `${p.ref.midi}:${p.ref.attackMs.toFixed(0)}/${p.model.attackMs.toFixed(0)}`).join(' '));
  }
}
