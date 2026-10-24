import { describe, expect, it } from "vitest";
import * as Blockly from "blockly";
import "../src/blockly";
import { irToWorkspaceState, workspaceToIr, TOOLBOX_ENTRIES, FRIENDLY_CALLS, BLOCK_CATEGORY, structuralKey } from "../src/index";
import type { WorkspaceState } from "../src/index";
import { dhtSketch, everythingSketch } from "./fixtures";

const norm = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (k, v) => (k === "span" ? undefined : v)));

describe("Blockly definitions (headless workspace)", () => {
  for (const [name, mk] of [["dht", dhtSketch], ["everything", everythingSketch]] as const) {
    it(`loads ${name} state into a real Blockly workspace and serializes back to the same IR`, () => {
      const f = mk();
      const ws = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(irToWorkspaceState(f) as any, ws);
      const saved = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
      expect(norm(workspaceToIr(saved, { path: f.path, eol: f.eol }))).toEqual(norm(f));
      expect(norm(workspaceToIr(ws as any, { path: f.path, eol: f.eol }))).toEqual(norm(f));
      const ws2 = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(saved as any, ws2);
      expect(structuralKey(Blockly.serialization.workspaces.save(ws2) as WorkspaceState)).toEqual(structuralKey(saved));
      ws.dispose(); ws2.dispose();
    });
  }

  it("every catalogue block type is registered", () => {
    for (const t of Object.keys(BLOCK_CATEGORY)) expect(Blockly.Blocks[t], t).toBeTruthy();
    for (const f of FRIENDLY_CALLS) expect(Blockly.Blocks[f.type]).toBeTruthy();
  });

  it("every toolbox preset instantiates", () => {
    const ws = new Blockly.Workspace();
    for (const e of TOOLBOX_ENTRIES) expect(Blockly.serialization.blocks.append(e.preset as any, ws).type).toBe(e.type);
    ws.dispose();
  });

  it("if-block context-menu mutation adds else-if/else without losing children", () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(irToWorkspaceState(dhtSketch()) as any, ws);
    const ifb = ws.getBlockById("if1")! as any;
    const opts: any[] = [];
    ifb.customContextMenu(opts);
    opts.find((o) => o.text === "Add else").callback();
    opts.find((o) => o.text === "Add else if").callback();
    const loop: any = workspaceToIr(ws as any).items.find((i) => i.id === "loop");
    const node = loop.body.find((s: any) => s.id === "if1");
    expect(node.branches.length).toBe(2);
    expect(node.elseBody).toEqual([]);
    expect(node.branches[0].body.length).toBe(2);
    ws.dispose();
  });

  it("raw block text is never routed through a field (byte identical)", () => {
    const ws = new Blockly.Workspace();
    const f = everythingSketch();
    Blockly.serialization.workspaces.load(irToWorkspaceState(f) as any, ws);
    expect((ws.getBlockById("rt1") as any).pfExtra.text).toBe((f.items.find((i) => i.id === "rt1") as any).text);
    ws.dispose();
  });
});
