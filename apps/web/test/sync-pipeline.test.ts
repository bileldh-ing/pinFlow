/**
 * End-to-end sync pipeline in Node with the REAL packages: tree-sitter parser,
 * code generator, SyncCoordinator and the Blockly adapter on a headless
 * Blockly workspace. This is the same wiring the workbench engine uses,
 * minus the DOM editors.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly";
import "@pinflow/block-definitions/blockly";
import { initParser, parseSketch } from "@pinflow/cpp-parser";
import { generate } from "@pinflow/arduino-codegen";
import { SyncCoordinator } from "@pinflow/sync-engine";
import { irToWorkspaceState, workspaceToIr, type WorkspaceState } from "@pinflow/block-definitions";
import type { SketchFile } from "@pinflow/arduino-ir";
import { TEMPLATES } from "@/generated/templates";

beforeAll(async () => { await initParser(); });

function harness(source: string) {
  const first = parseSketch(source, "main.ino");
  expect(first.ok).toBe(true);
  const ws = new Blockly.Workspace();
  let editorText = source;
  const parses: Array<{ rev: number; src: string; prev: SketchFile }> = [];
  const load = (file: SketchFile) => { Blockly.Events.disable(); try { Blockly.serialization.workspaces.load(irToWorkspaceState(file) as never, ws); } finally { Blockly.Events.enable(); } };
  const coord = new SyncCoordinator({ source, file: first.file }, {
    generate: (f) => generate(f),
    requestParse: (rev, src, prev) => parses.push({ rev, src, prev }),
    applyToEditor: (code) => { editorText = code; },
    applyToWorkspace: (file) => load(file),
    parseDebounceMs: 0,
  });
  load(first.file);
  const flushParse = () => { coord.flushParse(); const p = parses.pop(); if (p) coord.handleParseResult(p.rev, parseSketch(p.src, "main.ino", p.prev)); };
  const blocksChanged = () => coord.handleWorkspaceChange(workspaceToIr(Blockly.serialization.workspaces.save(ws) as WorkspaceState, { path: "main.ino", eol: coord.file.eol }));
  const typeCode = (text: string) => { editorText = text; coord.handleEditorChange(text); flushParse(); };
  return { ws, coord, get code() { return editorText; }, blocksChanged, typeCode };
}

const dht = TEMPLATES.find((t) => t.id === "dht11-esp32")!.files[0]!.content;

describe("code <-> blocks pipeline (real parser + generator + coordinator + Blockly)", () => {
  it("DHT11 template becomes blocks with friendly DHT/Serial blocks and full coverage", () => {
    const r = parseSketch(dht, "main.ino");
    expect(r.ok).toBe(true);
    expect(r.coverage.ratio).toBeGreaterThan(0.95);
    const types = JSON.stringify(irToWorkspaceState(r.file));
    for (const t of ["pf_include", "pf_dht_object", "pf_setup", "pf_loop", "pf_serial_begin", "pf_dht_begin", "pf_dht_read_hum", "pf_dht_read_temp", "pf_isnan", "pf_if", "pf_delay"]) expect(types).toContain(t);
  });

  it("editing a block field updates the code (delay 2000 -> 500)", () => {
    const h = harness(dht);
    const delay = h.ws.getAllBlocks(false).find((b) => b.type === "pf_delay")!;
    const num = delay.getInputTargetBlock("MS")!;
    num.setFieldValue("500", "NUM");
    expect(h.blocksChanged()).toBe(true);
    expect(h.code).toContain("delay(500);");
    expect(h.code).not.toContain("delay(2000);");
    expect(h.code).toContain("#include <DHT.h>");
  });

  it("editing code updates the blocks and keeps unrelated block ids", () => {
    const h = harness(dht);
    const beforeIds = new Set(h.ws.getAllBlocks(false).map((b) => b.id));
    h.typeCode(h.code.replace("delay(2000);", "delay(750);"));
    const delay = h.ws.getAllBlocks(false).find((b) => b.type === "pf_delay")!;
    expect(delay.getInputTargetBlock("MS")!.getFieldValue("NUM")).toBe("750");
    const afterIds = h.ws.getAllBlocks(false).map((b) => b.id);
    const kept = afterIds.filter((id) => beforeIds.has(id)).length;
    expect(kept / afterIds.length).toBeGreaterThan(0.9);
  });

  it("a syntax error keeps the last good blocks", () => {
    const h = harness(dht);
    const count = h.ws.getAllBlocks(false).length;
    h.typeCode(h.code.replace("void loop() {", "void loop() { if ("));
    expect(h.coord.state.parseStatus).toBe("error");
    expect(h.ws.getAllBlocks(false).length).toBe(count);
    h.typeCode(dht.replace("delay(2000);", "delay(10);"));
    expect(h.coord.state.parseStatus).toBe("ok");
  });

  it("raw (unsupported) C++ survives block edits byte-for-byte", () => {
    const raw = "template <typename T>\nT twice(T v) { return v * 2; } // keep {me}";
    const src = `${raw}\n\nvoid setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(1000);\n}\n`;
    const h = harness(src);
    expect(h.ws.getAllBlocks(false).some((b) => b.type === "pf_raw_top")).toBe(true);
    const pin = h.ws.getAllBlocks(false).find((b) => b.type === "pf_digital_write")!;
    pin.getInputTargetBlock("PIN")!.setFieldValue("12", "NUM");
    expect(h.blocksChanged()).toBe(true);
    expect(h.code).toContain("digitalWrite(12, HIGH);");
    expect(h.code).toContain(raw);
  });

  it("undo restores code and blocks together; redo re-applies", () => {
    const h = harness(dht);
    const num = h.ws.getAllBlocks(false).find((b) => b.type === "pf_delay")!.getInputTargetBlock("MS")!;
    num.setFieldValue("123", "NUM");
    h.blocksChanged();
    expect(h.code).toContain("delay(123);");
    expect(h.coord.undo()).toBe(true);
    expect(h.code).toContain("delay(2000);");
    expect(h.ws.getAllBlocks(false).find((b) => b.type === "pf_delay")!.getInputTargetBlock("MS")!.getFieldValue("NUM")).toBe("2000");
    expect(h.coord.redo()).toBe(true);
    expect(h.code).toContain("delay(123);");
  });

  it("every template parses, converts to blocks and regenerates to a fixed point", () => {
    for (const t of TEMPLATES) {
      const src = t.files[0]!.content;
      const r = parseSketch(src, "main.ino");
      expect(r.ok, t.id).toBe(true);
      const ws = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(irToWorkspaceState(r.file) as never, ws);
      const back = workspaceToIr(Blockly.serialization.workspaces.save(ws) as WorkspaceState, { path: "main.ino", eol: r.file.eol });
      const code1 = generate(back).code;
      const code2 = generate(parseSketch(code1, "main.ino").file).code;
      expect(code2, t.id).toBe(code1);
      ws.dispose();
    }
  });
});
