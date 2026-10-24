import type { GenerateResult, SketchFile } from "@pinflow/arduino-ir";
import { walkIr } from "@pinflow/arduino-ir";

/** 0-based, end-exclusive column ranges. */
export interface Range0 { startLine: number; startCol: number; endLine: number; endCol: number; raw?: boolean; }
export type RangeIndex = Map<string, Range0>;

export function rangesFromParse(file: SketchFile): RangeIndex {
  const m: RangeIndex = new Map();
  walkIr(file, (n) => {
    const s = (n as { span?: { startLine: number; startCol: number; endLine: number; endCol: number } }).span;
    const kind = String((n as { kind?: string }).kind ?? "");
    if (s && typeof n.id === "string") m.set(n.id, { startLine: s.startLine, startCol: s.startCol, endLine: s.endLine, endCol: s.endCol, raw: kind.startsWith("Raw") });
  });
  return m;
}

export function rangesFromSourceMap(gen: GenerateResult): RangeIndex {
  const m: RangeIndex = new Map();
  for (const e of gen.sourceMap) m.set(e.nodeId, { startLine: e.startLine, startCol: e.startCol, endLine: e.endLine, endCol: e.endCol, raw: e.origin === "raw" });
  return m;
}

function contains(r: Range0, line: number, col: number): boolean {
  if (line < r.startLine || line > r.endLine) return false;
  if (line === r.startLine && col < r.startCol) return false;
  if (line === r.endLine && col > r.endCol) return false;
  return true;
}
function size(r: Range0): number { return (r.endLine - r.startLine) * 100000 + (r.endCol - r.startCol); }

/** Innermost node (optionally restricted to ids accepted by `filter`) containing a 0-based position. */
export function nodeAt(index: RangeIndex, line: number, col: number, filter?: (id: string) => boolean): string | undefined {
  let best: { id: string; s: number } | undefined;
  for (const [id, r] of index) {
    if (!contains(r, line, col)) continue;
    if (filter && !filter(id)) continue;
    const s = size(r);
    if (!best || s < best.s) best = { id, s };
  }
  return best?.id;
}
