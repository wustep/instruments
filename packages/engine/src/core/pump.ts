// Decouples a core's internal blocks from the host's. The host asks for however many samples
// its callback has (128 in Web Audio today; other hosts and future render sizes differ); the
// core renders blocks whose length depends only on its own state and its event times, and the
// pump hands them out. So the output is the same sample for sample whatever the host's block
// size (control-rate updates, envelope steps and smoothing no longer follow the host).
// Cost: the core runs ahead of the output by less than one internal block (≤ 64 samples).
export class Pump {
  private L: Float64Array;
  private R: Float64Array;
  private pos = 0;
  private len = 0;
  constructor(maxBlock: number) {
    this.L = new Float64Array(maxBlock);
    this.R = new Float64Array(maxBlock);
  }
  /** samples rendered but not yet handed out */
  get pending(): number {
    return this.len - this.pos;
  }
  /** `render` writes one internal block into (L, R) from index 0 and returns its length */
  pull(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number, render: (L: Float64Array, R: Float64Array) => number): void {
    let done = 0;
    while (done < frames) {
      if (this.pos >= this.len) {
        this.len = render(this.L, this.R);
        this.pos = 0;
      }
      const n = Math.min(frames - done, this.len - this.pos);
      for (let t = 0; t < n; t++) {
        outL[done + t] = this.L[this.pos + t];
        outR[done + t] = this.R[this.pos + t];
      }
      this.pos += n;
      done += n;
    }
  }
  reset(): void {
    this.pos = this.len = 0;
  }
}
