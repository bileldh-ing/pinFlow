import { describe, expect, it } from "vitest";
import type { SketchFile } from "@pinflow/arduino-ir";
import { irToWorkspaceState, workspaceToIr, workspaceToIrDetailed, rootPositions, structuralKey, parseParams, formatParams, searchToolbox, buildToolbox, TOOLBOX_ENTRIES } from "../src/index";
import { dhtSketch, everythingSketch } from "./fixtures";

/** Normalize: drop spans and undefined keys. Ids are preserved by the adapter so we keep them. */
const norm = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (k, v) => (k === "span" ? undefined : v)));
const normNoIds = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (k, v) => (k === "span" || k === "id" ? undefined : v)));

function roundTrip(file: SketchFile): SketchFile {
  const state = JSON.parse(JSON.stringify(irToWorkspaceState(file)));
  return workspaceToIr(state, { path: file.path, eol: file.eol });
}

describe("IR <-> Blockly state adapter", () => {
  it("round-trips the DHT11 sketch exactly (including ids, v1.1 comment/layout fields)", () => {
    const f = dhtSketch();
    expect(norm(roundTrip(f))).toEqual(norm(f));
  });

  it("round-trips every IR node kind exactly", () => {
    const f = everythingSketch();
    expect(norm(roundTrip(f))).toEqual(norm(f));
  });

  it("block id equals IR node id and ids are unique", () => {
    const state = irToWorkspaceState(dhtSketch());
    const ids: string[] = [];
    const walk = (b: any) => { if (!b) return; ids.push(b.id); for (const i of Object.values(b.inputs ?? {}) as any[]) walk(i.block); walk(b.next?.block); };
    state.blocks!.blocks.forEach(walk);
    for (const x of ["inc", "setup", "if1", "obj", "or1"]) expect(ids).toContain(x);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses friendly blocks for known APIs and generic blocks otherwise", () => {
    const s = JSON.stringify(irToWorkspaceState(everythingSketch()));
    for (const t of ["pf_pin_mode", "pf_analog_write", "pf_map", "pf_analog_read", "pf_delay_us", "pf_serial_begin", "pf_digital_read", "pf_digital_write", "pf_constrain", "pf_abs", "pf_min", "pf_max", "pf_micros", "pf_millis", "pf_delay"]) expect(s).toContain(`"${t}"`);
    const d = JSON.stringify(irToWorkspaceState(dhtSketch()));
    for (const t of ["pf_dht_object", "pf_dht_begin", "pf_dht_read_temp", "pf_dht_read_hum", "pf_isnan", "pf_serial_println", "pf_serial_print", "pf_setup", "pf_loop"]) expect(d).toContain(`"${t}"`);
    expect(s).toContain('"pf_method_call"'); // Serial.print(x, DEC) and dht.readTemperature(true) without a DHT object
  });

  it("raw text is byte-identical after round trip", () => {
    const f = everythingSketch();
    const out = roundTrip(f);
    const raws = (file: SketchFile) => JSON.stringify(file).match(/"text":"(?:[^"\\]|\\.)*"/g);
    expect(raws(out)).toEqual(raws(f));
    const rt = out.items.find((i) => i.id === "rt1");
    expect(rt && "text" in rt ? rt.text : null).toBe("template <typename T>\nT twice(T v) { return v * 2; } // {braces} \"q\"\r\n");
  });

  it("orders top-level stacks by y and preserves positions on re-import", () => {
    const file = dhtSketch();
    const state = irToWorkspaceState(file);
    const pos = rootPositions(state);
    const again = irToWorkspaceState(file, { positions: { ...pos, setup: { x: 400, y: pos.setup!.y } } });
    expect(again.blocks!.blocks.find((b) => b.id === "setup")!.x).toBe(400);
    expect(structuralKey(again)).toEqual(structuralKey(state));
    const swapped = JSON.parse(JSON.stringify(state));
    const s = swapped.blocks.blocks.find((b: any) => b.id === "setup"); const l = swapped.blocks.blocks.find((b: any) => b.id === "loop");
    [s.y, l.y] = [l.y, s.y];
    const names = workspaceToIr(swapped).items.filter((i) => i.kind === "Function").map((i: any) => i.name);
    expect(names).toEqual(["loop", "setup"]);
  });

  it("reports orphan statement stacks and empty sockets", () => {
    const state: any = irToWorkspaceState(dhtSketch());
    state.blocks.blocks.push({ type: "pf_delay", id: "orph", x: 0, y: 99999 });
    expect(workspaceToIrDetailed(state).orphanBlockIds).toEqual(["orph"]);
    const st: any = { blocks: { languageVersion: 0, blocks: [{ type: "pf_setup", id: "s", x: 0, y: 0, inputs: { BODY: { block: { type: "pf_delay", id: "d" } } } }] } };
    const r2 = workspaceToIrDetailed(st);
    expect(r2.warnings.length).toBe(1);
    expect((r2.file.items[0] as any).body[0].expr.args[0].kind).toBe("RawExpr");
  });

  it("re-identifies duplicated blocks deterministically", () => {
    const st: any = { blocks: { languageVersion: 0, blocks: [{ type: "pf_setup", id: "s", x: 0, y: 0, inputs: { BODY: { block: {
      type: "pf_delay", id: "a", extraState: { callId: "call1" }, inputs: { MS: { block: { type: "pf_number", id: "n1", fields: { NUM: "1" } } } },
      next: { block: { type: "pf_delay", id: "b", extraState: { callId: "call1" }, inputs: { MS: { block: { type: "pf_number", id: "n2", fields: { NUM: "2" } } } } } },
    } } } }] } };
    const f = workspaceToIr(st);
    const body = (f.items[0] as any).body;
    expect(body[0].expr.id).toBe("call1");
    expect(body[1].expr.id).toBe("b.call");
    expect(normNoIds(f)).toEqual(normNoIds(workspaceToIr(st)));
  });

  it("escapes user-typed quotes in string fields", () => {
    const st: any = { blocks: { languageVersion: 0, blocks: [{ type: "pf_var_decl", id: "v", x: 0, y: 0, fields: { TYPE: "String", NAME: "s", CONST: "FALSE" }, extraState: { isArray: false, hasInit: true, itemCount: null }, inputs: { INIT: { block: { type: "pf_string", id: "t", fields: { TEXT: 'say "hi" \\" ok' } } } } }] } };
    expect((workspaceToIr(st).items[0] as any).init.raw).toBe('"say \\"hi\\" \\" ok"');
  });

  it("param label parsing", () => {
    expect(parseParams("int a, const char* b, float vals[]")).toEqual([{ type: "int", name: "a" }, { type: "const char*", name: "b" }, { type: "float", name: "vals[]" }]);
    expect(parseParams("void")).toEqual([]);
    expect(formatParams([{ type: "int", name: "a" }])).toBe("int a");
  });

  it("toolbox has all spec categories and search hits names/keywords/aliases", () => {
    expect(buildToolbox().contents.length).toBe(12);
    expect(searchToolbox("led")[0]?.type).toBe("pf_digital_write");
    expect(searchToolbox("humidity").map((t) => t.type)).toContain("pf_dht_read_hum");
    expect(searchToolbox("pinMode")[0]?.type).toBe("pf_pin_mode");
    expect(searchToolbox("pwm").map((t) => t.type)).toContain("pf_analog_write");
    expect(new Set(TOOLBOX_ENTRIES.map((t) => t.key)).size).toBe(TOOLBOX_ENTRIES.length);
  });
});
