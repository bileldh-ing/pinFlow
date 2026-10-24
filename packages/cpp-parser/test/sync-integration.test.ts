/**
 * End-to-end core loop with the REAL parser + generator + SyncCoordinator
 * (behaviour matrix rows from spec 7.1 that do not need a browser).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import type { SketchFile } from "@pinflow/arduino-ir";
import { generate } from "@pinflow/arduino-codegen";
import { ManualScheduler, SyncCoordinator, checkFixedPoint } from "../../sync-engine/src/index";
import { initParser, parseSketch } from "../src/index";

beforeAll(async () => {
  await initParser();
});

const SRC = `#include <DHT.h>
#define DHTPIN 4
DHT dht(DHTPIN, DHT11);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  float t = dht.readTemperature();
  if (isnan(t)) {
    return;
  }
  Serial.println(t);
  delay(1000);
}
`;

function setup(src = SRC) {
  const sched = new ManualScheduler();
  const editor = { text: src };
  let workspace = parseSketch(src).file;
  let workspaceApplies = 0;
  const sync: SyncCoordinator = new SyncCoordinator(
    { source: src, file: workspace },
    {
      generate,
      // a synchronous "worker"
      requestParse: (rev, source, prev) => queueMicrotask(() => sync.handleParseResult(rev, parseSketch(source, "main.ino", prev))),
      applyToEditor: (t) => {
        editor.text = t;
        sync.handleEditorChange(t);
      },
      applyToWorkspace: (f) => {
        workspace = f;
        workspaceApplies++;
        sync.handleWorkspaceChange(f);
      },
      scheduler: sched,
      now: () => sched.now(),
    },
  );
  const type = async (text: string) => {
    editor.text = text;
    sync.handleEditorChange(text);
    sched.advance(300);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { sync, editor, sched, type, get workspace() { return workspace; }, get applies() { return workspaceApplies; } };
}

const loopOf = (f: SketchFile) => f.items.find((i) => i.kind === "Function" && i.name === "loop") as Extract<SketchFile["items"][number], { kind: "Function" }>;

describe("core loop with the real parser", () => {
  it("edit delay(1000) -> delay(500) in code updates the same block (same ids)", async () => {
    const s = setup();
    const before = loopOf(s.workspace).body.map((x) => x.id);
    await s.type(SRC.replace("delay(1000)", "delay(500)"));
    expect(s.sync.state.parseStatus).toBe("ok");
    const after = loopOf(s.workspace).body;
    expect(after.map((x) => x.id)).toEqual(before);
    expect(JSON.stringify(after[3])).toContain('"500"');
  });

  it("partial `if (` keeps the last valid blocks visible and reports the error", async () => {
    const s = setup();
    const good = s.workspace;
    await s.type(SRC.replace("  delay(1000);", "  if (\n  delay(1000);"));
    expect(s.sync.state.parseStatus).toBe("error");
    expect(s.workspace).toBe(good);
    expect(s.sync.file).toBe(good);
    expect(s.sync.diagnostics.length).toBeGreaterThan(0);
  });

  it("block edit regenerates code; the result re-parses to the same structure (fixed point)", async () => {
    const s = setup();
    const f = structuredClone(s.workspace);
    const lb = loopOf(f).body;
    lb.splice(2, 0, lb.splice(3, 1)[0]!); // drag delay() above Serial.println()
    s.sync.handleWorkspaceChange(f);
    expect(s.editor.text).toContain("  delay(1000);\n  Serial.println(t);");
    expect(checkFixedPoint(s.editor.text, (src, prev) => parseSketch(src, "main.ino", prev), generate)).toMatchObject({ stable: true, canonical: true });
    // unrelated code is unchanged
    expect(s.editor.text.split("void loop")[0]).toBe(SRC.split("void loop")[0]);
  });

  it("undo after a block edit restores code and blocks to the same logical revision", async () => {
    const s = setup();
    const f = structuredClone(s.workspace);
    loopOf(f).body.pop();
    s.sync.handleWorkspaceChange(f);
    expect(s.editor.text).not.toContain("delay(1000)");
    s.sync.undo();
    expect(s.editor.text).toBe(SRC);
    expect(JSON.stringify(s.workspace)).toContain('"1000"');
  });

  it("property: random interleavings of code edits and block edits always settle (no loops, no lost state)", async () => {
    const edits = fc.array(fc.oneof(fc.record({ k: fc.constant("code" as const), ms: fc.nat({ max: 9999 }) }), fc.record({ k: fc.constant("blocks" as const), ms: fc.nat({ max: 9999 }) }), fc.record({ k: fc.constant("undo" as const), ms: fc.constant(0) })), { minLength: 1, maxLength: 12 });
    await fc.assert(
      fc.asyncProperty(edits, async (seq) => {
        const s = setup();
        for (const e of seq) {
          if (e.k === "code") await s.type(s.editor.text.replace(/delay\(\d+\)/, `delay(${e.ms})`));
          else if (e.k === "blocks") {
            const f = structuredClone(s.sync.file);
            const call = JSON.stringify(f).replace(/("callee":"delay","args":\[\{"kind":"NumberLit","id":"[^"]+"(?:,"span":\{[^}]*\})?,"raw":")\d+"/, `$1${e.ms}"`);
            s.sync.handleWorkspaceChange(JSON.parse(call));
          } else s.sync.undo();
          await Promise.resolve();
        }
        s.sched.advance(10_000);
        await Promise.resolve();
        await Promise.resolve();
        expect(s.sched.size).toBe(0); // nothing pending: no event ping-pong
        // editor text and IR agree
        const reparsed = parseSketch(s.editor.text);
        expect(reparsed.ok).toBe(true);
        expect(generate(reparsed.file).code).toBe(generate(s.sync.file).code);
      }),
      { numRuns: 40 },
    );
  });
});
