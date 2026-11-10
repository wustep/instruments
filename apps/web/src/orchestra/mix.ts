// The ensemble's mix: every instrument is calibrated to sound at its own level alone; together they
// share one bus at 1/√n (n parts that do not move together sum to about one part's loudness), and a
// fast limiter on the bus above −2 dBFS catches the rest. Measured offline with
// scripts/render-orchestra.ts (first 40 s, bus included): the Haydn quartet peaks at −10.4 dBFS, the
// Brandenburg sextet at −7.2 dBFS, the trumpet and piano at −0.2 dBFS (there the limiter works).
export const busGain = (n: number): number => 1 / Math.sqrt(Math.max(1, n));
