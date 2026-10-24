/**
 * Spec 15.2 golden fixtures + spec 3.6 round-trip invariants.
 * Expectations: fixtures/parser-golden/manifest.json (hand-written) and
 * <file>.expected.json (normalized IR + coverage snapshot; UPDATE_GOLDEN=1 rewrites them).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ParseResult, SketchFile } from "@pinflow/arduino-ir";
import { normalizeIr, walkIr } from "@pinflow/arduino-ir";
import { generate } from "@pinflow/arduino-codegen";
import { initParser, parseSketch } from "../src/index";

const ROOT = join(__dirname, "../../../fixtures/parser-golden");
interface Entry {
  id: number;
  dir: string;
  file: string;
  ok: boolean;
  coverage: string;
  raw: string[];
  identical: boolean;
  eol?: string;
  extraKnownFunctions?: string[];
}
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as { fixtures: Entry[] };

beforeAll(async () => {
  await initParser();
});

function overall(r: ParseResult): string {
  if (!r.ok) return "parse_error";
  const raws = r.coverage.entries.filter((e) => e.coverage === "raw_preserved").length;
  if (raws === 0) return "fully_visualized";
  if (r.file.items.every((i) => i.kind === "RawTopLevel")) return "raw_preserved";
  return "partially_visualized";
}

const isRaw = (k: unknown) => k === "RawTopLevel" || k === "RawStatement" || k === "RawExpr";

function rawTexts(file: SketchFile): string[] {
  const out: string[] = [];
  walkIr(file, (n) => {
    if (isRaw(n.kind)) out.push(String(n.text));
  });
  return out;
}

function rawIds(file: SketchFile): Set<string> {
  const s = new Set<string>();
  walkIr(file, (n) => {
    if (isRaw(n.kind)) s.add(n.id);
  });
  return s;
}

function snapshot(r: ParseResult) {
  return {
    ok: r.ok,
    ratio: r.coverage.ratio,
    coverage: r.coverage.entries.map((e) => ({ coverage: e.coverage, construct: e.construct, lines: e.span ? [e.span.startLine, e.span.endLine] : null })),
    diagnostics: r.diagnostics.map((d) => ({ message: d.message, line: d.span.startLine, col: d.span.startCol })),
    ir: r.ok ? normalizeIr(r.file, { keepLayout: true }) : null,
  };
}

it("manifest covers all 15 spec fixtures", () => {
  expect(new Set(manifest.fixtures.map((f) => f.id))).toEqual(new Set(Array.from({ length: 15 }, (_, i) => i + 1)));
});

describe.each(manifest.fixtures)("fixture $id $dir/$file", (fx) => {
  const path = join(ROOT, fx.dir, fx.file);
  const src = readFileSync(path, "utf8");
  const parse = (s: string) => parseSketch(s, fx.file, undefined, { extraKnownFunctions: fx.extraKnownFunctions });

  it("matches the hand-written expectations", () => {
    const r = parse(src);
    expect(r.ok).toBe(fx.ok);
    expect(overall(r)).toBe(fx.coverage);
    const rawConstructs = r.coverage.entries.filter((e) => e.coverage === "raw_preserved").map((e) => e.construct).sort();
    expect(rawConstructs).toEqual([...fx.raw].sort());
    if (fx.eol) expect(r.file.eol).toBe(fx.eol);
    if (!fx.ok) expect(r.diagnostics.length).toBeGreaterThan(0);
    for (const e of r.coverage.entries) expect(e.explanation.length).toBeGreaterThan(10);
  });

  it("matches the normalized IR + coverage golden snapshot", () => {
    const snap = snapshot(parse(src));
    const expectedPath = `${path}.expected.json`;
    if (process.env.UPDATE_GOLDEN || !existsSync(expectedPath)) writeFileSync(expectedPath, JSON.stringify(snap, null, 2) + "\n");
    expect(snap).toEqual(JSON.parse(readFileSync(expectedPath, "utf8")));
  });

  if (!fx.ok) return;

  it("round-trips: parse(generate(ir)) == ir (normalized), fixed point, raw bytes identical", () => {
    const r1 = parse(src);
    const g1 = generate(r1.file);
    const r2 = parse(g1.code);
    expect(r2.ok).toBe(true);
    expect(normalizeIr(r2.file)).toEqual(normalizeIr(r1.file));
    const g2 = generate(r2.file);
    expect(g2.code).toBe(g1.code); // fixed point after one normalization pass
    const raws = rawTexts(r1.file);
    expect(rawTexts(r2.file)).toEqual(raws); // present, byte-identical, same order
    for (const t of raws) {
      expect(src.includes(t)).toBe(true);
      expect(g1.code.includes(t)).toBe(true);
    }
    if (fx.identical) expect(g1.code).toBe(src);
  });

  it("source map covers every IR node exactly once with valid ranges", () => {
    const r = parse(src);
    const g = generate(r.file);
    const ids: string[] = [];
    walkIr(r.file, (n) => ids.push(n.id));
    const mapped = g.sourceMap.map((e) => e.nodeId);
    expect(new Set(mapped)).toEqual(new Set(ids));
    expect(mapped.length).toBe(ids.length);
    const lines = g.code.split(r.file.eol);
    const raw = rawIds(r.file);
    for (const e of g.sourceMap) {
      expect(e.path).toBe(fx.file);
      expect(e.endLine > e.startLine || (e.endLine === e.startLine && e.endCol >= e.startCol)).toBe(true);
      expect(lines[e.endLine]!.length).toBeGreaterThanOrEqual(e.endCol);
      expect(e.origin === "raw").toBe(raw.has(e.nodeId));
    }
  });
});

describe("multi-file sketch (15)", () => {
  it("without sibling-function knowledge cross-file calls are raw (honest); with it they are native", () => {
    const src = readFileSync(join(ROOT, "15-multi-file/main.ino"), "utf8");
    const alone = parseSketch(src, "main.ino");
    expect(alone.coverage.entries.filter((e) => e.construct === "unknown_function")).toHaveLength(3);
    const withCtx = parseSketch(src, "main.ino", undefined, { extraKnownFunctions: ["initLeds", "readLevel", "showLevel"] });
    expect(withCtx.coverage.ratio).toBe(1);
  });
  it("header prototypes inside include guards are preserved verbatim", () => {
    const src = readFileSync(join(ROOT, "15-multi-file/helpers.h"), "utf8");
    const r = parseSketch(src, "helpers.h");
    expect(r.file.items).toHaveLength(1);
    expect(r.file.items[0]).toMatchObject({ kind: "RawTopLevel" });
    expect(generate(r.file).code).toBe(src);
  });
});

describe("source map", () => {
  it("maps generated ranges back to node text and block ids", () => {
    const r = parseSketch("void loop() {\n  delay(500);\n}\n");
    const stmtId = (r.file.items[0] as { body: { id: string }[] }).body[0]!.id;
    const g = generate(r.file, { [stmtId]: ["block-1"] });
    const stmt = g.sourceMap.find((e) => e.blockIds.includes("block-1"))!;
    expect(stmt).toMatchObject({ nodeId: stmtId, startLine: 1, startCol: 2, endLine: 1, endCol: 13, origin: "native" });
    expect(g.code.split("\n")[1]!.slice(stmt.startCol, stmt.endCol)).toBe("delay(500);");
  });
});
