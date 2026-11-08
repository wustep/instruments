// Filter designs computed off the audio thread (main thread / worker) and
// handed to the worklet, so live parameter changes never stall audio.

import { DEFAULT_CALIBRATION, type Calibration } from './calibration.ts';
import { DEFAULT_PARAMS, PRESETS, type PianoParams, buildKeySpecs } from './design.ts';
import { type DesignEntry, DispersionCache, nominalLossCoeff } from './voice.ts';

/** Dispersion designs for every key (full and sympathetic strings) of a preset + params. */
export async function computeDesigns(
  presetId: string,
  params: Partial<PianoParams>,
  fs: number,
  opts: { calibration?: Calibration; yieldEvery?: number; skip?: (key: string) => boolean } = {},
): Promise<DesignEntry[]> {
  const design = PRESETS[presetId] ?? PRESETS.grand;
  const p = { ...DEFAULT_PARAMS, ...design.defaults, ...params } as PianoParams;
  const specs = buildKeySpecs(design, p, opts.calibration ?? DEFAULT_CALIBRATION);
  const cache = new DispersionCache();
  const out: DesignEntry[] = [];
  let n = 0;
  for (const spec of specs) {
    const la = nominalLossCoeff(spec, fs);
    let worked = false;
    // one design per distinct unison-string stiffness, plus the sympathetic string's
    const variants: { s: typeof spec; light: boolean }[] = [{ s: spec, light: true }];
    const seen = new Set<number>();
    for (const st of spec.strings) {
      if (seen.has(st.B)) continue;
      seen.add(st.B);
      variants.push({ s: st.B === spec.B ? spec : { ...spec, B: st.B, f0: st.f0 }, light: false });
    }
    for (const { s: vs, light } of variants) {
      const key = DispersionCache.keyOf(vs, fs, light, la);
      if (opts.skip?.(key)) continue;
      out.push({ key, d: cache.get(vs, fs, light, la) });
      worked = true;
    }
    // yield only after real design work (a fully cached set returns at once)
    if (worked && opts.yieldEvery && ++n % opts.yieldEvery === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
