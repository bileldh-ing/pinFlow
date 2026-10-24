import { mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { signup, source, waitReady } from "./helpers";

// Language + theme switching on the public site and in the workbench, as a user would click it.
const SHOTS = path.resolve(process.cwd(), "../../docs/screenshots");
const COPY = "/workspace/work/i18n-shots";

async function shot(page: Page, name: string) {
  if (!process.env.E2E_SCREENSHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const file = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: file });
  try { mkdirSync(COPY, { recursive: true }); copyFileSync(file, `${COPY}/${name}.png`); } catch { /* copy is best-effort */ }
}

async function pickLanguage(page: Page, code: "en" | "fr" | "ar") {
  await page.getByTestId("lang-switcher").first().click();
  await expect(page.getByTestId("lang-menu")).toBeVisible();
  await page.getByTestId(`lang-option-${code}`).click();
  await expect(page.locator("html")).toHaveAttribute("lang", code);
}

async function pickTheme(page: Page, pref: "light" | "dark" | "system") {
  await page.getByTestId("theme-toggle").first().click();
  await page.getByTestId(`theme-option-${pref}`).click();
}

const blockLabels = (page: Page) => page.evaluate(() => {
  const pf = (window as unknown as { __pinflow: { Blockly: { getMainWorkspace(): { RTL: boolean; getAllBlocks(o: boolean): Array<{ inputList: Array<{ fieldRow: Array<{ getText(): string }> }> }> } } } }).__pinflow;
  const ws = pf.Blockly.getMainWorkspace();
  return { rtl: ws.RTL, labels: ws.getAllBlocks(false).flatMap((b) => b.inputList.flatMap((i) => i.fieldRow.map((f) => f.getText()))) };
});

test("landing: switch to French and Arabic (RTL), persists across reloads, theme persists", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Arduino code.");
  await expect(page.getByTestId("lang-current")).toHaveText("en");

  await pickLanguage(page, "fr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Le code Arduino.");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("link", { name: "Modèles" }).first()).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Le code Arduino.");
  expect(await page.evaluate(() => localStorage.getItem("pf-locale"))).toBe("fr");
  expect((await page.context().cookies()).find((c) => c.name === "pf-locale")?.value).toBe("fr");

  await pickLanguage(page, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("شيفرة Arduino.");
  await expect(page.getByText("أسئلة وإجابات واضحة")).toBeVisible();
  // Server-rendered in Arabic on a fresh navigation (cookie), no English flash.
  const html = await (await page.request.get("/")).text();
  expect(html).toContain('lang="ar"');
  expect(html).toContain('dir="rtl"');
  expect(html).toContain("مشروع واحد حيّ.");

  // Theme: light persists over reload, system follows the OS preference.
  await pickTheme(page, "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByTestId("workbench")).toHaveAttribute("data-ready", "1", { timeout: 60_000 });
  await page.waitForTimeout(1200);
  await shot(page, "i18n-landing-ar-light");
  await pickTheme(page, "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(600);
  await shot(page, "i18n-landing-ar");
  await page.emulateMedia({ colorScheme: "light" });
  await pickTheme(page, "system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await pickTheme(page, "dark");

  // English remains fully available.
  await pickLanguage(page, "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Arduino code.");
});

test("Accept-Language picks the first visit language; English fallback", async ({ browser }) => {
  for (const [header, expected, heading] of [["fr-FR,fr;q=0.9", "fr", "Le code Arduino."], ["ar-TN,ar;q=0.9", "ar", "شيفرة Arduino."], ["de-DE,de;q=0.9", "en", "Arduino code."]] as const) {
    const ctx = await browser.newContext({ extraHTTPHeaders: { "accept-language": header }, locale: header.split(",")[0] });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", expected);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    await ctx.close();
  }
});

test("workbench: blocks, toolbox and chrome translate live; code and workspace unchanged; Arabic canvas is RTL", async ({ page }) => {
  test.setTimeout(240_000);
  await signup(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByTestId("new-project").click();
  await page.getByTestId("template-dht11-esp32").click();
  await page.getByTestId("create-project").click();
  await page.waitForURL(/\/projects\/.+\/editor/);
  await waitReady(page);
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-status", "saved", { timeout: 30_000 });

  const codeBefore = await source(page);
  const en = await blockLabels(page);
  expect(en.rtl).toBe(false);
  expect(en.labels.join(" ")).toContain("void loop()");
  const idsBefore = await page.evaluate(() => (window as unknown as { __pinflow: { Blockly: { getMainWorkspace(): { getAllBlocks(o: boolean): Array<{ id: string }> } } } }).__pinflow.Blockly.getMainWorkspace().getAllBlocks(true).map((b) => b.id).sort());

  // French, light theme
  await pickLanguage(page, "fr");
  await expect(page.getByTestId("blockly-host")).toHaveAttribute("data-locale", "fr");
  await expect(page.locator(".blocklyToolboxCategoryLabel, .blocklyTreeLabel").filter({ hasText: "Capteurs" }).first()).toBeVisible();
  await expect(page.getByTestId("compile")).toContainText("Compiler");
  const fr = await blockLabels(page);
  expect(fr.labels.join(" ")).toContain("se répète sans fin");
  expect(fr.labels.join(" ")).toContain("attendre");
  expect(await source(page)).toBe(codeBefore);
  // Toolbox search matches French and English.
  await page.getByTestId("rail-blocks").click();
  await page.getByTestId("toolbox-search").fill("humidité");
  await expect(page.getByTestId("insert-pf_dht_read_hum")).toBeVisible();
  await page.getByTestId("toolbox-search").fill("humidity");
  await expect(page.getByTestId("insert-pf_dht_read_hum")).toContainText("humidité");
  await page.getByTestId("rail-none").click();
  await pickTheme(page, "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector(".blocklyMainBackground")!).fill)).not.toBe("rgb(22, 19, 17)");
  await expect.poll(() => page.evaluate(() => document.querySelector(".monaco-editor")!.classList.contains("vs"))).toBe(true);
  await page.waitForTimeout(1200);
  await shot(page, "i18n-workbench-fr-light");

  // Arabic, dark theme: RTL page and RTL Blockly canvas
  await pickLanguage(page, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("blockly-host")).toHaveAttribute("data-rtl", "1");
  const ar = await blockLabels(page);
  expect(ar.rtl).toBe(true);
  expect(ar.labels.join(" ")).toContain("يتكرر باستمرار");
  expect(ar.labels.join(" ")).toContain("انتظر");
  await expect(page.locator(".blocklyToolboxCategoryLabel, .blocklyTreeLabel").filter({ hasText: "الحساسات" }).first()).toBeVisible();
  await expect(page.getByTestId("compile")).toContainText("ترجمة");
  await expect(page.getByTestId("monaco-host")).toHaveAttribute("dir", "ltr");
  expect(await source(page)).toBe(codeBefore);
  const idsAfter = await page.evaluate(() => (window as unknown as { __pinflow: { Blockly: { getMainWorkspace(): { getAllBlocks(o: boolean): Array<{ id: string }> } } } }).__pinflow.Blockly.getMainWorkspace().getAllBlocks(true).map((b) => b.id).sort());
  expect(idsAfter).toEqual(idsBefore);
  await pickTheme(page, "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => document.querySelector(".monaco-editor")!.classList.contains("vs-dark"))).toBe(true);
  await page.waitForTimeout(1500);
  await shot(page, "i18n-workbench-ar-dark");

  // Sync still works after the switch: a block edit regenerates code.
  await page.evaluate(() => {
    const pf = (window as unknown as { __pinflow: { Blockly: { getMainWorkspace(): { getAllBlocks(o: boolean): Array<{ type: string; getInputTargetBlock(n: string): { setFieldValue(v: string, f: string): void } | null }> } } } }).__pinflow;
    pf.Blockly.getMainWorkspace().getAllBlocks(false).find((b) => b.type === "pf_delay")!.getInputTargetBlock("MS")!.setFieldValue("750", "NUM");
  });
  await expect.poll(() => source(page)).toContain("delay(750);");
  // Nothing about the switch is unsaved noise: reload keeps Arabic + the edit.
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-status", "saved", { timeout: 30_000 });
  await page.reload();
  await waitReady(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  expect(await source(page)).toContain("delay(750);");

  // Back to English
  await pickLanguage(page, "en");
  await expect(page.getByTestId("blockly-host")).toHaveAttribute("data-rtl", "0");
  expect((await blockLabels(page)).labels.join(" ")).toContain("void loop()  — repeats forever");
});
