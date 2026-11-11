// A file's notes on one instrument, as its keys. An instrument has one key (one string, one fingering) for
// a pitch; a file can hold that pitch twice at once: two lines in unison on one instrument, or a note begun
// again before its own end (a sequencer's overlap of a pitch with itself, a tie written as two notes). The
// file's notes are paired first in, first out (midi-file.ts), so the first end that comes belongs to the
// first of them: the key is struck again at each beginning and let go only when the last of them ends.
// Sent bare, the first end let the key go under the note still sounding (on a wind: the second note cut
// short, a rest where the file has none).
export class FileKeys {
  private held = new Map<number, number>();

  /** a note of the file begins on this pitch: the key is struck (always) */
  on(pitch: number): void {
    this.held.set(pitch, (this.held.get(pitch) ?? 0) + 1);
  }

  /** a note of the file ends on this pitch: is the key let go? (false: another note still holds it, or
   *  it was not down) */
  off(pitch: number): boolean {
    const n = this.held.get(pitch) ?? 0;
    if (n > 1) {
      this.held.set(pitch, n - 1);
      return false;
    }
    this.held.delete(pitch);
    return n === 1;
  }

  /** the pitches down */
  get down(): number[] {
    return [...this.held.keys()];
  }

  clear(): void {
    this.held.clear();
  }
}
