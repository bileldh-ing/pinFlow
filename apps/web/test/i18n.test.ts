/**
 * i18n: dictionary completeness (fr/ar cover every English key), locale
 * negotiation, localized catalogues, and — most important — that switching
 * the block language never changes the generated C++.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly";
import "@pinflow/block-definitions/blockly";
import { initParser, parseSketch } from "@pinflow/cpp-parser";
import { generate } from "@pinflow/arduino-codegen";
import { irToWorkspaceState, setBlockLocale, workspaceToIr, type WorkspaceState } from "@pinflow/block-definitions";
import { TEMPLATES } from "@/generated/templates";
import { en } from "@/i18n/messages/en";
import { MESSAGES, createT, translate } from "@/i18n/translate";
import { LOCALES, dirOf, negotiateLocale, resolveLocale } from "@/i18n/config";
import { DOCS_BODY } from "@/i18n/docs-content";
import { tplCategory, tplDesc, tplTitle } from "@/i18n/content";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("UI dictionaries", () => {
  for (const loc of ["fr", "ar"] as const) {
    it(`${loc} has a non-empty translation for every English key`, () => {
      const dict = MESSAGES[loc] as Record<string, string | undefined>;
      const missing = Object.keys(en).filter((k) => !dict[k]?.trim());
      expect(missing).toEqual([]);
    });
    it(`${loc} has no keys that English lacks and keeps every {placeholder}`, () => {
      const dict = MESSAGES[loc] as Record<string, string>;
      expect(Object.keys(dict).filter((k) => !(k in en))).toEqual([]);
      for (const [k, v] of Object.entries(en)) expect(placeholders(dict[k]!), k).toEqual(placeholders(v));
    });
  }

  it("English stays the fallback for unknown/missing keys", () => {
    const partial = { ...MESSAGES.fr };
    delete (partial as Record<string, string>)["nav.docs"];
    expect(translate("en", "nav.docs")).toBe("Docs");
    expect(createT("fr")("nav.docs")).toBe("Docs");
    expect(createT("ar")("theme.dark")).toBe("داكنة");
    expect(createT("fr")("dash.minAgo", { n: 5 })).toBe("il y a 5 min");
  });

  it("Arabic and French texts are really translated (not English copies)", () => {
    const same = (loc: "fr" | "ar") => Object.entries(en).filter(([k, v]) => (MESSAGES[loc] as Record<string, string>)[k] === v && /[a-z]{4,}/.test(v) && !/PinFlow Studio$|^Docs$|^Version$|^Description$|^Variables$|^Contact$|^Documentation$|^Structure$|^Diagnostics$|^Code$|^LED$|^Démo$|flash/.test(v)).map(([k]) => k);
    expect(same("ar")).toEqual([]);
    expect(same("fr").length).toBeLessThan(25);
  });
});

describe("locale negotiation", () => {
  it("cookie wins, then Accept-Language (q-weighted), then English", () => {
    expect(resolveLocale("ar", "fr-FR,fr;q=0.9")).toBe("ar");
    expect(resolveLocale(undefined, "fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(resolveLocale("de", "ar-TN,ar;q=0.9")).toBe("ar");
    expect(negotiateLocale("de-DE,de;q=0.9,en;q=0.5")).toBe("en");
    expect(negotiateLocale("de-DE, fr;q=0.4, ar;q=0.6")).toBe("ar");
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("")).toBe("en");
  });
  it("Arabic is right-to-left, the others left-to-right", () => {
    expect(LOCALES.map(dirOf)).toEqual(["ltr", "ltr", "rtl"]);
  });
});

describe("localized content", () => {
  it("every template has a title/description/category in every locale", () => {
    for (const loc of LOCALES) {
      const t = createT(loc);
      for (const tp of TEMPLATES) {
        expect(tplTitle(t, tp.id, "__missing__"), `${loc} ${tp.id}`).not.toBe("__missing__");
        expect(tplDesc(t, tp.id, "__missing__")).not.toBe("__missing__");
        expect(tplCategory(t, tp.category)).toBeTruthy();
      }
      if (loc === "en") for (const tp of TEMPLATES) { expect(tplTitle(t, tp.id, "")).toBe(tp.title); expect(tplDesc(t, tp.id, "")).toBe(tp.description); }
    }
  });
  it("docs pages keep the same anchors in every language", () => {
    const anchors = (s: string) => [...s.matchAll(/\{#([\w-]+)\}/g)].map((m) => m[1]);
    expect(anchors(DOCS_BODY.fr)).toEqual(anchors(DOCS_BODY.en));
    expect(anchors(DOCS_BODY.ar)).toEqual(anchors(DOCS_BODY.en));
    expect(anchors(DOCS_BODY.en)).toEqual(["getting-started", "the-workbench", "saving", "compiling", "changelog"]);
  });
});

describe("block language switch keeps the code byte-identical", () => {
  beforeAll(async () => { await initParser(); });
  afterEach(() => setBlockLocale("en"));

  for (const tp of TEMPLATES) {
    it(`${tp.id}: en → fr → ar → en round trip generates identical C++`, () => {
      const source = tp.files.find((f) => f.path.endsWith(".ino"))!.content;
      const parsed = parseSketch(source, "main.ino");
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const original = generate(parsed.file).code;

      setBlockLocale("en");
      let ws = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(irToWorkspaceState(parsed.file) as never, ws);
      let state = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
      const enCode = generate(workspaceToIr(state, { path: parsed.file.path, eol: parsed.file.eol })).code;
      expect(enCode).toBe(original);

      for (const loc of ["fr", "ar", "en"] as const) {
        setBlockLocale(loc);
        const next = new Blockly.Workspace(new Blockly.Options({ rtl: loc === "ar" }));
        Blockly.serialization.workspaces.load(state as never, next);
        const nextState = Blockly.serialization.workspaces.save(next) as WorkspaceState;
        expect(JSON.stringify(nextState), `${loc} state`).toBe(JSON.stringify(state)); // same IDs, fields, extra state
        expect(generate(workspaceToIr(nextState, { path: parsed.file.path, eol: parsed.file.eol })).code, `${loc} code`).toBe(original);
        ws.dispose(); ws = next; state = nextState;
      }
      ws.dispose();
    });
  }
});
