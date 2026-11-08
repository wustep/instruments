import { renderNote } from '../packages/engine/src/core/index.ts';
import { analyzePartials, fitDoubleDecay, partialEnvelopes } from '../packages/engine/src/analysis/index.ts';

const notes = process.argv.slice(2).map(Number);
for (const midi of notes.length ? notes : [21, 45, 60, 72, 84, 96, 108]) {
  for (const vel of [40, 100]) {
    const dur = 3;
    const r = renderNote(midi, vel, dur, { dry: true });
    let mx = 0, nan = 0;
    for (const v of r.left) { if (!Number.isFinite(v)) nan++; else mx = Math.max(mx, Math.abs(v)); }
    const spec = r.core.specs[midi - 21];
    const pa = analyzePartials(r.left, r.sampleRate, spec.f1, { Bguess: spec.B });
    const env = partialEnvelopes([r.left], r.sampleRate, pa.f0, pa.B, [1], { durSec: dur - 0.3 });
    const fit = fitDoubleDecay(env.t, env.env[0]);
    const st = r.core.voices[midi - 21].lastStrike;
    console.log(
      `m${midi} v${vel} peak=${mx.toExponential(2)} nan=${nan} f1=${pa.f1.toFixed(3)} tgt=${spec.f1.toFixed(3)} ` +
      `cents=${(1200 * Math.log2(pa.f1 / spec.f1)).toFixed(2)} B=${pa.B.toExponential(2)} tgtB=${spec.B.toExponential(2)} ` +
      `nP=${pa.partials.length} t60e=${fit?.t60Early.toFixed(1)} t60l=${fit?.t60Late.toFixed(1)} ` +
      `F=${st?.peak.toFixed(1)}N dur=${st ? (st.duration * 1000).toFixed(2) : '-'}ms cpu=${(r.cpuMs / dur / 10).toFixed(2)}%`,
    );
  }
}
