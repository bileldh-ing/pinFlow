import { beforeAll, describe, expect, it } from "vitest";
import type { SketchFile } from "@pinflow/arduino-ir";
import { collectNodes, diffSketch, walkIr } from "@pinflow/arduino-ir";
import { initParser, parseSketch } from "../src/index";

beforeAll(async () => {
  await initParser();
});

const BASE = `#include <DHT.h>
const int LED = 2;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(LED, HIGH);
  delay(1000);
  digitalWrite(LED, LOW);
  delay(1000);
}
`;

function ids(file: SketchFile): string[] {
  const out: string[] = [];
  walkIr(file, (n) => out.push(n.id));
  return out;
}
type Fn = Extract<SketchFile["items"][number], { kind: "Function" }>;
const fnNamed = (f: SketchFile, name: string) => f.items.find((i) => i.kind === "Function" && i.name === name) as Fn;
const loopBody = (f: SketchFile) => fnNamed(f, "loop").body;

describe("stable ids", () => {
  it("re-parsing identical source reuses every id", () => {
    const a = parseSketch(BASE).file;
    const b = parseSketch(BASE, "main.ino", a).file;
    expect(ids(b)).toEqual(ids(a));
    expect(diffSketch(a, b).unchanged).toBe(true);
  });

  it("without prev, ids are fresh and unique", () => {
    const a = parseSketch(BASE).file;
    const b = parseSketch(BASE).file;
    const all = ids(a);
    expect(new Set(all).size).toBe(all.length);
    expect(ids(b).some((id) => all.includes(id))).toBe(false);
  });

  it("editing one statement keeps all ids (block identity) and reports one shallow change", () => {
    const a = parseSketch(BASE).file;
    const b = parseSketch(BASE.replace("delay(1000);\n  digitalWrite(LED, LOW);", "delay(500);\n  digitalWrite(LED, LOW);"), "main.ino", a).file;
    expect(ids(b)).toEqual(ids(a));
    const d = diffSketch(a, b);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toHaveLength(1);
    expect(collectNodes(b).get(d.changed[0]!)).toMatchObject({ kind: "NumberLit", raw: "500" });
  });

  it("inserting a statement keeps the others and adds only the new subtree", () => {
    const a = parseSketch(BASE).file;
    const b = parseSketch(BASE.replace("  delay(1000);\n  digitalWrite(LED, LOW);", "  delay(1000);\n  Serial.println(1);\n  digitalWrite(LED, LOW);"), "main.ino", a).file;
    const la = loopBody(a);
    const lb = loopBody(b);
    expect(lb.map((s) => s.id)).toEqual([la[0]!.id, la[1]!.id, lb[2]!.id, la[2]!.id, la[3]!.id]);
    const d = diffSketch(a, b);
    expect(d.removed).toEqual([]);
    expect(d.added).toHaveLength(3); // ExprStmt + MethodCall + NumberLit
    expect(d.changed).toEqual([fnNamed(b, "loop").id]); // only the loop's child list changed
  });

  it("deleting a statement keeps the others", () => {
    const a = parseSketch(BASE).file;
    const b = parseSketch(BASE.replace("  digitalWrite(LED, LOW);\n", ""), "main.ino", a).file;
    const la = loopBody(a);
    expect(loopBody(b).map((s) => s.id)).toEqual([la[0]!.id, la[1]!.id, la[3]!.id]);
    expect(diffSketch(a, b).removed.length).toBeGreaterThan(0);
  });

  it("moving a statement keeps its id (reorder in code)", () => {
    const a = parseSketch(BASE).file;
    const b = parseSketch(BASE.replace("  pinMode(LED, OUTPUT);\n  Serial.begin(115200);", "  Serial.begin(115200);\n  pinMode(LED, OUTPUT);"), "main.ino", a).file;
    const sa = fnNamed(a, "setup").body;
    const sb = fnNamed(b, "setup").body;
    expect(sb.map((s) => s.id)).toEqual([sa[1]!.id, sa[0]!.id]);
  });

  it("reordering + editing functions keeps function ids (matched by name)", () => {
    const a = parseSketch(BASE).file;
    const head = BASE.slice(0, BASE.indexOf("void setup"));
    const setup = BASE.slice(BASE.indexOf("void setup"), BASE.indexOf("void loop"));
    const loop = BASE.slice(BASE.indexOf("void loop"));
    const b = parseSketch(head + loop.replace("delay(1000);", "delay(10);") + "\n" + setup, "main.ino", a).file;
    expect(fnNamed(b, "setup").id).toBe(fnNamed(a, "setup").id);
    expect(fnNamed(b, "loop").id).toBe(fnNamed(a, "loop").id);
  });

  it("adding a comment does not reset unrelated ids", () => {
    const a = parseSketch(BASE).file;
    const b = parseSketch(BASE.replace("  delay(1000);\n  digitalWrite(LED, LOW);", "  // wait\n  delay(1000);\n  digitalWrite(LED, LOW);"), "main.ino", a).file;
    expect(ids(b)).toEqual(ids(a));
    expect(loopBody(b)[1]!.leadingComments).toEqual(["// wait"]);
  });

  it("result ids stay unique after a sequence of heavy edits", () => {
    let prev = parseSketch(BASE).file;
    const variants = [BASE.replace(/1000/g, "10"), BASE.replace("HIGH", "LOW") + "\nvoid extra() { delay(1); }\n", BASE.replace("const int LED = 2;\n", ""), BASE];
    for (const v of variants) {
      const next = parseSketch(v, "main.ino", prev).file;
      const all = ids(next);
      expect(new Set(all).size).toBe(all.length);
      prev = next;
    }
  });
});
