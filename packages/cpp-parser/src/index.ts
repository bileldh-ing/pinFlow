/**
 * @pinflow/cpp-parser — Arduino C++ source -> PinFlow IR using tree-sitter-cpp.
 *
 *   await initParser();                        // once (Node: no args; browser: wasm URLs)
 *   const r = parseSketch(src, "main.ino", lastGoodFile);
 *   if (r.ok) use(r.file); else keep lastGoodFile and show r.diagnostics
 */
import type { Node } from "web-tree-sitter";
import type { CoverageEntry, CoverageReport, ParseDiagnostic, ParseResult, SketchFile } from "@pinflow/arduino-ir";
import { walkIr } from "@pinflow/arduino-ir";
import { getParser } from "./init";
import { Mapper, explain, type MapOptions } from "./mapper";
import { Positions } from "./positions";
import { assignStableIds } from "./ids";
import { maskAttributeMacros } from "./arduinoMacros";

export { initParser, isParserReady, getLanguageInfo, WEB_TREE_SITTER_WASM, TREE_SITTER_CPP_WASM, type InitParserOptions } from "./init";
export { assignStableIds } from "./ids";
export type { MapOptions as ParseOptions } from "./mapper";
export type { WorkerRequest, WorkerResponse } from "./protocol";
export { createParseHandler } from "./workerCore";
export { ATTRIBUTE_MACROS } from "./arduinoMacros";

export function detectEol(source: string): "\n" | "\r\n" {
  const i = source.indexOf("\n");
  return i > 0 && source[i - 1] === "\r" ? "\r\n" : "\n";
}

function countNonWs(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!(c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12)) n++;
  }
  return n;
}

function collectErrors(root: Node, pos: Positions, src: string): ParseDiagnostic[] {
  const out: ParseDiagnostic[] = [];
  const rec = (n: Node) => {
    if (n.isMissing) {
      out.push({ severity: "error", message: `Missing "${n.type}"`, span: pos.span(n.startIndex, n.endIndex) });
      return;
    }
    if (n.isError) {
      const snippet = src.slice(n.startIndex, Math.min(n.endIndex, n.startIndex + 40)).replace(/\s+/g, " ").trim();
      out.push({ severity: "error", message: snippet ? `Syntax error near "${snippet}"` : "Syntax error", span: pos.span(n.startIndex, n.endIndex) });
      return;
    }
    for (const c of n.children) if (c.hasError || c.isMissing || c.isError) rec(c);
  };
  rec(root);
  if (out.length === 0) out.push({ severity: "error", message: "Syntax error", span: pos.span(0, 0) });
  return out;
}

function buildCoverage(file: SketchFile, src: string, raws: Map<string, { construct: string; reason: string }>): CoverageReport {
  const entries: CoverageEntry[] = [];
  let rawNonWs = 0;
  for (const item of file.items) {
    const nested: CoverageEntry[] = [];
    walkIr(item as never, (n) => {
      if (n.kind === "RawTopLevel" || n.kind === "RawStatement" || n.kind === "RawExpr") {
        const info = raws.get(n.id);
        rawNonWs += countNonWs(String(n.text ?? ""));
        nested.push({
          nodeId: n.id,
          coverage: "raw_preserved",
          span: n.span as CoverageEntry["span"],
          construct: info?.construct ?? String(n.kind),
          explanation: info?.reason ?? String(n.reason ?? explain(String(n.kind))),
        });
      }
    });
    if (item.kind === "RawTopLevel") entries.push(nested[0]!);
    else {
      entries.push({
        nodeId: item.id,
        coverage: nested.length ? "partially_visualized" : "fully_visualized",
        span: item.span,
        construct: item.kind,
        explanation: nested.length
          ? `${nested.length} part(s) of this ${item.kind === "Function" ? `function ${item.name}()` : item.kind} are kept as code; the rest is editable as blocks.`
          : "Fully editable as blocks.",
      });
      entries.push(...nested);
    }
  }
  const total = countNonWs(src);
  const ratio = total === 0 ? 1 : Math.max(0, Math.min(1, (total - rawNonWs) / total));
  return { ratio: Math.round(ratio * 10000) / 10000, entries };
}

/**
 * Parse an Arduino sketch file. Synchronous; requires `await initParser()` first.
 *
 * @param prev  last good IR of the same file: structurally matching nodes keep their ids.
 *              On syntax errors the returned `file` IS `prev` (or an empty file), with ok:false.
 * @param options.extraKnownFunctions  functions defined in sibling files of the sketch.
 */
export function parseSketch(source: string, path = "main.ino", prev?: SketchFile, options: MapOptions = {}): ParseResult {
  const eol = detectEol(source);
  const { masked, ranges } = maskAttributeMacros(source);
  const tree = getParser().parse(masked);
  if (!tree) throw new Error("tree-sitter returned no tree");
  try {
    const root = tree.rootNode;
    if (root.hasError) {
      const diagnostics = collectErrors(root, new Positions(source), source);
      return {
        ok: false,
        file: prev ?? { path, items: [], eol },
        coverage: {
          ratio: 0,
          entries: diagnostics.map((d, i) => ({ nodeId: `parse_error_${i}`, coverage: "parse_error", span: d.span, construct: "ERROR", explanation: d.message })),
        },
        diagnostics,
      };
    }
    const mapper = new Mapper(source, root, options, ranges);
    const file = mapper.mapFile(path, eol);
    assignStableIds(file, prev);
    const raws = new Map<string, { construct: string; reason: string }>();
    walkIr(file, (n) => {
      const info = mapper.rawInfoOf(n);
      if (info) raws.set(n.id, info);
    });
    return { ok: true, file, coverage: buildCoverage(file, source, raws), diagnostics: [] };
  } finally {
    tree.delete();
  }
}

/** Promise wrapper (runs on the calling thread; use src/worker.ts to go off-thread). */
export async function parseSketchAsync(source: string, path?: string, prev?: SketchFile, options?: MapOptions): Promise<ParseResult> {
  return parseSketch(source, path, prev, options);
}
