// The ensemble's mix: every instrument is calibrated to sound at its own level alone; together they
// share one bus at 1/√(Σ wᵢ²) (n parts that do not move together sum to about one part's loudness), where
// a part counts by the level it is played at over its calibration (wᵢ = 10^(dBᵢ/20), dBᵢ the engine's
// PLAYBACK_DB: the trombone's session gain, 9 dB; 0 for the rest, so a lineup without a trombone keeps its
// 1/√n), and a fast limiter on the bus above −2 dBFS catches the rest. A lineup of trombones alone sounds
// as it did before their gain (the Air: four of them, mix peak −2.4 dBFS); among others a trombone stands
// with the brass. The bus's share is also each part's own limiter's (the engine's Limiter.bus): it works
// on the level heard. Measured offline with scripts/render-orchestra.ts (first 40 s, bus included): the
// Haydn quartet peaks at −10.4 dBFS, the Brandenburg sextet at −7.2 dBFS, the trumpet and piano at
// −0.2 dBFS (there the limiter works).

/** the bus gain for the parts that can sound: their count (each at its calibrated level), or each one's
 *  playback level over its calibration (dB) */
export function busGain(parts: number | readonly number[]): number {
  if (typeof parts === 'number') return 1 / Math.sqrt(Math.max(1, parts));
  let w2 = 0;
  for (const db of parts) w2 += Math.pow(10, db / 10);
  return 1 / Math.sqrt(Math.max(1, w2));
}
