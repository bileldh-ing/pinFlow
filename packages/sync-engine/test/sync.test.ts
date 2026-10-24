import { beforeEach, describe, expect, it } from "vitest";
import type { Expr, ParseResult, SketchFile, Stmt } from "@pinflow/arduino-ir";
import { generate } from "@pinflow/arduino-codegen";
import { ManualScheduler, SyncCoordinator, UnifiedHistory, checkFixedPoint, debounce } from "../src/index";

let n = 0;
const id = () => `s${++n}`;
const N = (raw: string): Expr => ({ kind: "NumberLit", id: id(), raw });
const delayStmt = (ms: string, sid = id()): Stmt => ({ kind: "ExprStmt", id: sid, expr: { kind: "Call", id: id(), callee: "delay", args: [N(ms)] } });
const sketch = (...body: Stmt[]): SketchFile => ({ path: "main.ino", eol: "\n", items: [{ kind: "Function", id: "loop", returnType: "void", name: "loop", params: [], body }] });
const ok = (file: SketchFile): ParseResult => ({ ok: true, file, coverage: { ratio: 1, entries: [] }, diagnostics: [] });
const bad = (prev: SketchFile): ParseResult => ({ ok: false, file: prev, coverage: { ratio: 0, entries: [] }, diagnostics: [{ severity: "error", message: 'Missing ")"', span: { startByte: 0, endByte: 0, startLine: 1, startCol: 2, endLine: 1, endCol: 2 } }] });

interface Harness {
  sync: SyncCoordinator;
  sched: ManualScheduler;
  parses: { rev: number; source: string }[];
  editor: { text: string; writes: number };
  workspace: { file: SketchFile | null; applies: number };
}

function harness(initial = sketch(delayStmt("1000", "d1")), echo = true): Harness {
  const sched = new ManualScheduler();
  const parses: { rev: number; source: string }[] = [];
  const editor = { text: generate(initial).code, writes: 0 };
  const workspace = { file: initial as SketchFile | null, applies: 0 };
  const h: Harness = { sched, parses, editor, workspace, sync: null as unknown as SyncCoordinator };
  h.sync = new SyncCoordinator(
    { source: editor.text, file: initial },
    {
      generate,
      requestParse: (rev, source) => parses.push({ rev, source }),
      applyToEditor: (text) => {
        editor.text = text;
        editor.writes++;
        if (echo) h.sync.handleEditorChange(text); // Monaco fires change events synchronously
      },
      applyToWorkspace: (file) => {
        workspace.file = file;
        workspace.applies++;
        if (echo) h.sync.handleWorkspaceChange(file); // Blockly echo
      },
      scheduler: sched,
      now: () => sched.now(),
      parseDebounceMs: 300,
    },
  );
  return h;
}

describe("debounce + history primitives", () => {
  it("debounce coalesces calls and supports flush/cancel", () => {
    const s = new ManualScheduler();
    const calls: number[] = [];
    const d = debounce((x: number) => calls.push(x), 100, s);
    d(1);
    s.advance(50);
    d(2);
    s.advance(99);
    expect(calls).toEqual([]);
    s.advance(1);
    expect(calls).toEqual([2]);
    d(3);
    d.flush();
    expect(calls).toEqual([2, 3]);
    d(4);
    d.cancel();
    s.advance(500);
    expect(calls).toEqual([2, 3]);
    expect(d.pending).toBe(false);
  });

  it("history coalesces by key and drops the redo branch on new pushes", () => {
    const f = sketch();
    const h = new UnifiedHistory({ source: "a", file: f });
    h.push({ source: "b", file: f }, { key: "drag", now: 0 });
    h.push({ source: "c", file: f }, { key: "drag", now: 10 });
    expect(h.size).toBe(2);
    expect(h.undo()!.source).toBe("a");
    expect(h.redo()!.source).toBe("c");
    h.undo();
    h.push({ source: "d", file: f }, { now: 20 });
    expect(h.canRedo()).toBe(false);
    expect(h.current.source).toBe("d");
  });
});

describe("SyncCoordinator", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it("code edit -> debounced parse tagged with the source revision -> workspace update", () => {
    const text = h.editor.text.replace("1000", "500");
    h.sync.handleEditorChange(text);
    expect(h.sync.state).toMatchObject({ origin: "code", parseStatus: "pending", sourceRevision: 1, dirtyState: "local_unsaved" });
    h.sync.handleEditorChange(text + " "); // keep typing
    h.sched.advance(299);
    expect(h.parses).toHaveLength(0);
    h.sched.advance(1);
    expect(h.parses).toEqual([{ rev: 2, source: text + " " }]);
    const next = sketch(delayStmt("500", "d1"));
    const out = h.sync.handleParseResult(2, ok(next));
    expect(out.applied).toBe(true);
    expect(h.workspace.file).toBe(next);
    expect(h.sync.state).toMatchObject({ parseStatus: "ok", lastSuccessfulParseRevision: 2, blockRevision: 1 });
    // the workspace echo was ignored: no regeneration, editor untouched
    expect(h.editor.writes).toBe(0);
  });

  it("stale parse results are discarded", () => {
    h.sync.handleEditorChange("v1");
    h.sync.flushParse();
    h.sync.handleEditorChange("v2");
    expect(h.sync.handleParseResult(1, ok(sketch()))).toEqual({ applied: false, reason: "stale" });
    expect(h.workspace.applies).toBe(0);
  });

  it("a failed parse never replaces the last good IR", () => {
    const good = h.sync.file;
    h.sync.handleEditorChange("void loop() { if ( }");
    h.sched.advance(300);
    const out = h.sync.handleParseResult(1, bad(good));
    expect(out).toMatchObject({ applied: false, reason: "syntax_error" });
    expect(h.sync.file).toBe(good);
    expect(h.sync.state.parseStatus).toBe("error");
    expect(h.sync.diagnostics[0]!.message).toBe('Missing ")"');
    expect(h.workspace.applies).toBe(0);
  });

  it("block edit -> generated code with origin generator; the editor echo is not a user edit", () => {
    const edited = sketch(delayStmt("250", "d1"));
    expect(h.sync.handleWorkspaceChange(edited)).toBe(true);
    expect(h.editor.text).toContain("delay(250);");
    expect(h.editor.writes).toBe(1);
    expect(h.sync.state).toMatchObject({ origin: "blocks", blockRevision: 1, sourceRevision: 1, lastSuccessfulGenerationRevision: 1 });
    // the synchronous echo did not schedule a parse
    h.sched.advance(1000);
    expect(h.parses).toHaveLength(0);
  });

  it("late (async) echoes are recognised as no-ops by content", () => {
    const quiet = harness(undefined, false);
    quiet.sync.handleWorkspaceChange(sketch(delayStmt("250", "d1")));
    expect(quiet.sync.handleEditorChange(quiet.editor.text)).toBe(false); // same text arrives later
    expect(quiet.sync.handleWorkspaceChange(sketch(delayStmt("250", "other-ids")))).toBe(false); // same structure
    quiet.sched.advance(1000);
    expect(quiet.parses).toHaveLength(0);
  });

  it("undo/redo restore source AND blocks together (one history)", () => {
    const original = h.editor.text;
    h.sync.handleWorkspaceChange(sketch(delayStmt("250", "d1")));
    const afterBlocks = h.editor.text;
    h.sync.handleEditorChange(afterBlocks.replace("250", "100"));
    h.sched.advance(300);
    h.sync.handleParseResult(h.sync.state.sourceRevision, ok(sketch(delayStmt("100", "d1"))));
    expect(h.sync.undo()).toBe(true);
    expect(h.editor.text).toBe(afterBlocks);
    expect(JSON.stringify(h.workspace.file)).toContain('"250"');
    expect(h.sync.state.origin).toBe("undo");
    expect(h.sync.undo()).toBe(true);
    expect(h.editor.text).toBe(original);
    expect(JSON.stringify(h.workspace.file)).toContain('"1000"');
    expect(h.sync.undo()).toBe(false);
    expect(h.sync.redo()).toBe(true);
    expect(h.editor.text).toBe(afterBlocks);
    expect(h.sync.state.origin).toBe("redo");
  });

  it("undo with uncommitted invalid text first returns to the last valid snapshot", () => {
    const valid = h.editor.text;
    h.sync.handleEditorChange("void loop() { if (");
    h.sched.advance(300);
    h.sync.handleParseResult(1, bad(h.sync.file));
    expect(h.sync.canUndo()).toBe(true);
    h.sync.undo();
    expect(h.editor.text).toBe(valid);
    expect(h.sync.state.parseStatus).toBe("ok");
  });

  it("block transactions coalesce a drag into one undo step", () => {
    const original = h.editor.text;
    h.sync.beginBlockTransaction();
    h.sync.handleWorkspaceChange(sketch(delayStmt("1"), delayStmt("1000", "d1")));
    h.sync.handleWorkspaceChange(sketch(delayStmt("1000", "d1"), delayStmt("1")));
    h.sync.endBlockTransaction();
    h.sync.undo();
    expect(h.editor.text).toBe(original);
  });

  it("compile results are tied to the compiled revision", () => {
    const job = h.sync.snapshotForCompile();
    expect(h.sync.isCurrentRevision(job.revisionId)).toBe(true);
    h.sync.handleEditorChange(h.editor.text + "\n// edit while compiling");
    expect(h.sync.isCurrentRevision(job.revisionId)).toBe(false);
  });

  it("save state transitions and remote conflicts never overwrite local edits", () => {
    h.sync.handleEditorChange(h.editor.text + "\n// local");
    expect(h.sync.state.dirtyState).toBe("local_unsaved");
    h.sync.markSaving();
    expect(h.sync.state.dirtyState).toBe("saving");
    h.sync.markSaveFailed();
    expect(h.sync.state.dirtyState).toBe("save_failed");
    h.sync.markSaved(5);
    expect(h.sync.state.dirtyState).toBe("saved");
    expect(h.sync.handleRemoteRevision(5)).toBe("already_current");
    expect(h.sync.handleRemoteRevision(6)).toBe("fast_forward");
    h.sync.handleEditorChange(h.editor.text + "\n// more");
    const before = h.editor.text;
    expect(h.sync.handleRemoteRevision(7)).toBe("conflict");
    expect(h.sync.state.dirtyState).toBe("conflict");
    expect(h.editor.text).toBe(before);
    h.sync.applyRemote({ source: "void loop() {\n}\n", file: sketch(), serverRevision: 7 });
    expect(h.editor.text).toBe("void loop() {\n}\n");
    expect(h.sync.state).toMatchObject({ dirtyState: "saved", origin: "remote" });
  });

  it("no sync cycle loops: echoes on both sides terminate immediately", () => {
    for (let i = 0; i < 20; i++) h.sync.handleWorkspaceChange(sketch(delayStmt(String(i), "d1")));
    expect(h.editor.writes).toBe(20);
    expect(h.workspace.applies).toBe(0);
    expect(h.sched.size).toBe(0);
  });
});

describe("checkFixedPoint", () => {
  it("reports stability using injected parse/generate", () => {
    const file = sketch(delayStmt("1"));
    const code = generate(file).code;
    const r = checkFixedPoint(code, () => ok(file), generate);
    expect(r).toMatchObject({ stable: true, canonical: true, passes: 0 });
    const r2 = checkFixedPoint("void loop(){delay(1);}", () => ok(file), generate);
    expect(r2).toMatchObject({ stable: true, canonical: false, passes: 1 });
    const r3 = checkFixedPoint("x", () => bad(file), generate);
    expect(r3.stable).toBe(false);
  });
});
