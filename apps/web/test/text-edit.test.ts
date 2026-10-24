import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyEdit, minimalEdit, offsetToPosition } from "@/lib/sync/text-edit";
import { nodeAt, type RangeIndex } from "@/lib/sync/source-ranges";

describe("minimal text edits", () => {
  it("computes a single local replacement", () => {
    const e = minimalEdit("delay(1000);\n", "delay(500);\n")!;
    expect(applyEdit("delay(1000);\n", e)).toBe("delay(500);\n");
    expect(e.start).toBe(6);
    expect(e.end - e.start).toBeLessThanOrEqual(4);
  });
  it("returns null for identical text", () => { expect(minimalEdit("a", "a")).toBeNull(); });
  it("never splits CRLF", () => {
    const e = minimalEdit("a\r\nb", "a\r\nc\r\nb")!;
    expect(applyEdit("a\r\nb", e)).toBe("a\r\nc\r\nb");
  });
  it("property: applyEdit(old, minimalEdit(old, new)) === new", () => {
    fc.assert(fc.property(fc.string(), fc.string(), (a, b) => applyEdit(a, minimalEdit(a, b)) === b), { numRuns: 500 });
  });
  it("offset to 1-based position", () => { expect(offsetToPosition("ab\ncd", 4)).toEqual({ lineNumber: 2, column: 2 }); });
});

describe("source ranges", () => {
  it("finds the innermost node at a position", () => {
    const idx: RangeIndex = new Map([
      ["fn", { startLine: 0, startCol: 0, endLine: 5, endCol: 1 }],
      ["stmt", { startLine: 2, startCol: 2, endLine: 2, endCol: 14 }],
      ["arg", { startLine: 2, startCol: 8, endLine: 2, endCol: 12 }],
    ]);
    expect(nodeAt(idx, 2, 9)).toBe("arg");
    expect(nodeAt(idx, 2, 9, (id) => id !== "arg")).toBe("stmt");
    expect(nodeAt(idx, 4, 0)).toBe("fn");
    expect(nodeAt(idx, 9, 0)).toBeUndefined();
  });
});
