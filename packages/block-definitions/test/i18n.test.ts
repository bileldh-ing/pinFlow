import { afterEach, describe, expect, it } from "vitest";
import * as Blockly from "blockly";
import "../src/blockly";
import {
  BLOCK_LOCALES, BLOCK_MESSAGES, BLOCK_MESSAGES_EN, CATEGORY_LABELS, CATEGORY_ORDER, FRIENDLY_CALLS, TOOLBOX_ENTRIES,
  buildToolbox, irToWorkspaceState, localizeEntry, searchToolbox, setBlockLocale, workspaceToIr, structuralKey, type BlockLocale,
  type WorkspaceState,
} from "../src/index";
import { dhtSketch, everythingSketch } from "./fixtures";

const norm = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (k, v) => (k === "span" ? undefined : v)));
const tokens = (s: string) => (s.match(/%[A-Z_]+/g) ?? []).sort();

afterEach(() => setBlockLocale("en"));

describe("block translations are complete", () => {
  for (const loc of BLOCK_LOCALES.filter((l) => l !== "en")) {
    it(`${loc}: every English key has a non-empty translation`, () => {
      const missing = Object.keys(BLOCK_MESSAGES_EN).filter((k) => !(BLOCK_MESSAGES[loc] as Record<string, string | undefined>)[k]?.trim());
      expect(missing).toEqual([]);
    });
    it(`${loc}: no unknown keys`, () => {
      const extra = Object.keys(BLOCK_MESSAGES[loc]).filter((k) => !(k in BLOCK_MESSAGES_EN));
      expect(extra).toEqual([]);
    });
    it(`${loc}: friendly labels keep every input token and placeholders`, () => {
      for (const [k, en] of Object.entries(BLOCK_MESSAGES_EN)) {
        const tr = (BLOCK_MESSAGES[loc] as Record<string, string>)[k]!;
        expect(tokens(tr), k).toEqual(tokens(en));
        expect((tr.match(/\{\w+\}/g) ?? []).sort(), k).toEqual((en.match(/\{\w+\}/g) ?? []).sort());
      }
    });
  }

  it("English block text mirrors the catalogue (single source of truth)", () => {
    for (const f of FRIENDLY_CALLS) {
      expect(BLOCK_MESSAGES_EN[`fc.${f.type}.label` as keyof typeof BLOCK_MESSAGES_EN]).toBe(f.label);
      expect(BLOCK_MESSAGES_EN[`fc.${f.type}.tip` as keyof typeof BLOCK_MESSAGES_EN]).toBe(f.tooltip);
    }
    for (const c of CATEGORY_ORDER) expect(BLOCK_MESSAGES_EN[`cat.${c}` as keyof typeof BLOCK_MESSAGES_EN]).toBe(CATEGORY_LABELS[c]);
    for (const e of TOOLBOX_ENTRIES) expect(localizeEntry(e, "en").name).toBe(e.name);
  });

  it("every toolbox entry has a localized name in fr and ar", () => {
    for (const loc of ["fr", "ar"] as const) {
      for (const e of TOOLBOX_ENTRIES) {
        const l = localizeEntry(e, loc);
        expect(l.name, `${loc} ${e.key}`).toBeTruthy();
        expect(l.key).toBe(e.key);
        expect(l.preset).toEqual(e.preset);
      }
    }
  });
});

describe("live language switch", () => {
  const renderLabels = (ws: Blockly.Workspace) => ws.getAllBlocks(false).flatMap((b) => b.inputList.flatMap((i) => i.fieldRow.map((f) => String(f.getText()))));

  for (const loc of ["fr", "ar"] as BlockLocale[]) {
    it(`${loc}: re-creating blocks changes only display text — IR, field values and IDs are identical`, () => {
      for (const mk of [dhtSketch, everythingSketch]) {
        const f = mk();
        setBlockLocale("en");
        const wsEn = new Blockly.Workspace();
        Blockly.serialization.workspaces.load(irToWorkspaceState(f) as never, wsEn);
        const savedEn = Blockly.serialization.workspaces.save(wsEn) as WorkspaceState;
        const labelsEn = renderLabels(wsEn);

        // Switch exactly as the workbench does: serialize, change locale, rebuild from the saved state.
        setBlockLocale(loc);
        const wsLoc = new Blockly.Workspace(new Blockly.Options({ rtl: loc === "ar" }));
        Blockly.serialization.workspaces.load(savedEn as never, wsLoc);
        const savedLoc = Blockly.serialization.workspaces.save(wsLoc) as WorkspaceState;

        expect(norm(workspaceToIr(savedLoc, { path: f.path, eol: f.eol }))).toEqual(norm(f));
        expect(structuralKey(savedLoc)).toEqual(structuralKey(savedEn));
        expect(JSON.stringify(savedLoc)).toEqual(JSON.stringify(savedEn));
        expect(renderLabels(wsLoc)).not.toEqual(labelsEn);
        wsEn.dispose(); wsLoc.dispose();
      }
    });
  }

  it("dropdown captions translate but values stay", () => {
    setBlockLocale("fr");
    const ws = new Blockly.Workspace();
    const b = ws.newBlock("pf_bool");
    const field = b.getField("BOOL") as Blockly.FieldDropdown;
    expect(field.getValue()).toBe("TRUE");
    expect(field.getText()).toBe("vrai");
    ws.dispose();
  });

  it("context-menu items follow the locale", () => {
    setBlockLocale("ar");
    const ws = new Blockly.Workspace();
    const b = ws.newBlock("pf_if") as unknown as { customContextMenu(o: Array<{ text: string }>): void };
    const opts: Array<{ text: string }> = [];
    b.customContextMenu(opts);
    expect(opts.map((o) => o.text)).toContain("إضافة «وإلا»");
    ws.dispose();
  });
});

describe("localized toolbox + search", () => {
  it("category names follow the locale; contents unchanged", () => {
    const en = buildToolbox("en");
    const fr = buildToolbox("fr");
    const ar = buildToolbox("ar");
    expect(fr.contents.map((c) => c.name)).toContain("Capteurs");
    expect(ar.contents.map((c) => c.name)).toContain("الحساسات");
    expect(fr.contents.map((c) => c.contents)).toEqual(en.contents.map((c) => c.contents));
    expect(ar.contents.map((c) => c.categorystyle)).toEqual(en.contents.map((c) => c.categorystyle));
  });

  it("search matches the active language and English", () => {
    expect(searchToolbox("humidité", 10, "fr").map((t) => t.type)).toContain("pf_dht_read_hum");
    expect(searchToolbox("humidite", 10, "fr").map((t) => t.type)).toContain("pf_dht_read_hum");
    expect(searchToolbox("humidity", 10, "fr").map((t) => t.type)).toContain("pf_dht_read_hum");
    expect(searchToolbox("رطوبة", 10, "ar").map((t) => t.type)).toContain("pf_dht_read_hum");
    expect(searchToolbox("led", 10, "ar")[0]?.type).toBe("pf_digital_write");
    expect(searchToolbox("انتظر", 10, "ar").map((t) => t.type)).toContain("pf_delay");
    expect(searchToolbox("attendre", 10, "fr").map((t) => t.type)).toContain("pf_delay");
    // results are localized
    expect(searchToolbox("delay", 5, "fr")[0]?.name).toMatch(/attendre/);
  });
});
