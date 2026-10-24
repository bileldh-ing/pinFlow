import type { SourceSpan } from "@pinflow/arduino-ir";

/**
 * Index conversions. web-tree-sitter (when given a JS string) reports
 * startIndex/endIndex in UTF-16 code units, which index JS strings directly.
 * Spans expose:
 *  - startByte/endByte: UTF-8 byte offsets (what the file is on disk / what compilers report);
 *  - startLine/startCol/endLine/endCol: 0-based line and UTF-16 column (Monaco column minus 1).
 */
export class Positions {
  private readonly lineStarts: number[] = [0];
  private utf8: Int32Array | null = null;

  constructor(private readonly src: string) {
    for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) this.lineStarts.push(i + 1);
    // eslint-disable-next-line no-control-regex
    if (!/^[\x00-\x7f]*$/.test(src)) {
      const map = new Int32Array(src.length + 1);
      let b = 0;
      for (let i = 0; i < src.length; i++) {
        map[i] = b;
        const c = src.charCodeAt(i);
        if (c < 0x80) b += 1;
        else if (c < 0x800) b += 2;
        else if (c >= 0xd800 && c <= 0xdbff) b += 4; // high surrogate: whole code point (4 bytes)
        else if (c >= 0xdc00 && c <= 0xdfff) b += 0; // low surrogate: counted with its pair
        else b += 3;
      }
      map[src.length] = b;
      this.utf8 = map;
    }
  }

  byteOffset(index: number): number {
    return this.utf8 ? this.utf8[index]! : index;
  }

  row(index: number): number {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  span(start: number, end: number): SourceSpan {
    const sr = this.row(start);
    const er = this.row(end);
    return {
      startByte: this.byteOffset(start),
      endByte: this.byteOffset(end),
      startLine: sr,
      startCol: start - this.lineStarts[sr]!,
      endLine: er,
      endCol: end - this.lineStarts[er]!,
    };
  }

  /** Row of the last non-whitespace character in [start, end) (falls back to row(start)). */
  lastContentRow(start: number, end: number): number {
    let i = end - 1;
    while (i > start && /\s/.test(this.src[i]!)) i--;
    return this.row(i);
  }
}
