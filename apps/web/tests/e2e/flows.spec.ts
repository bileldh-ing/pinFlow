import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { expect, test, type Page } from "@playwright/test";
import { blockField, setBlockField, signup, source, waitReady } from "./helpers";

// Main product flows clicked through as a user would, with a console-error guard on every page.

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Expected: the browser logs failed fetches for deliberate 401/404 responses.
    if (/Failed to load resource: the server responded with a status of (401|404)/.test(t)) return;
    errors.push(t);
  });
  return errors;
}

const TEMPLATES = ["dht11-esp32", "dht11-esp32-nonblocking", "blink-uno", "button-led", "pwm-fade", "servo-sweep", "serial-monitor"];

async function newFromTemplate(page: Page, id: string) {
  await page.goto("/dashboard");
  await page.getByTestId("new-project").click();
  await page.getByTestId(`template-${id}`).click();
  await page.getByTestId("create-project").click();
  await page.waitForURL(/\/projects\/.+\/editor/);
  await waitReady(page);
}

test("onboarding wizard (all steps) opens the guided DHT11 project", async ({ page }) => {
  const errors = watchConsole(page);
  await signup(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Open the workbench" }).click();
  await page.waitForURL(/\/projects\/.+\/editor/);
  await waitReady(page);
  expect(await source(page)).toContain("DHT dht(DHTPIN, DHTTYPE);");
  expect(errors).toEqual([]);
});

test("every template creates a project that parses into blocks", async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchConsole(page);
  await signup(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL(/\/dashboard/);
  for (const id of TEMPLATES) {
    await newFromTemplate(page, id);
    await expect(page.getByTestId("workbench")).toHaveAttribute("data-parse", "ok");
    await expect(page.getByTestId("coverage-status")).toContainText("%");
    const n = await page.evaluate(() => (window as unknown as { __pinflow: { Blockly: { getMainWorkspace(): { getAllBlocks(o: boolean): unknown[] } } } }).__pinflow.Blockly.getMainWorkspace().getAllBlocks(false).length);
    expect(n, `${id} renders blocks`).toBeGreaterThan(2);
  }
  await page.goto("/dashboard");
  await expect(page.getByTestId("project-card")).toHaveCount(TEMPLATES.length);
  // Coverage measured by the editor on open reaches the dashboard without needing an edit.
  await expect(page.getByText("Coverage pending")).toHaveCount(0);
  await expect(page.getByTestId("project-card").filter({ hasText: "% blocks" })).toHaveCount(TEMPLATES.length);
  expect(errors).toEqual([]);
});

test("dashboard: rename, duplicate, trash, restore and delete a project; history restore; export ZIP; import .ino", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchConsole(page);
  await signup(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await newFromTemplate(page, "blink-uno");

  // Make a second revision through a block edit, then restore revision 1 from History.
  await setBlockField(page, "pf_delay", "MS", "NUM", "250");
  await expect.poll(() => source(page)).toContain("delay(250);");
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-status", "saved", { timeout: 30_000 });

  // Export ZIP from the workbench
  await page.getByTestId("export-menu").click();
  const [zipDl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-zip").click()]);
  const zip = await JSZip.loadAsync(readFileSync((await zipDl.path())!));
  const names = Object.keys(zip.files);
  expect(names.some((n) => n.endsWith(".ino"))).toBe(true);
  expect(names.some((n) => n.endsWith("sketch.yaml"))).toBe(true);
  const ino = await zip.file(names.find((n) => n.endsWith(".ino"))!)!.async("string");
  expect(ino).toContain("delay(250);");

  const editorUrl = page.url();
  await page.goto(editorUrl.replace(/\/editor$/, "/history"));
  await page.getByTestId("rev-1").click();
  await page.getByTestId("restore-revision").click();
  await expect(page.getByRole("status").filter({ hasText: /Restored as revision \d+/ })).toBeVisible();
  await page.goto(editorUrl);
  await waitReady(page);
  expect(await source(page)).toContain("delay(1000);");
  expect(await blockField(page, "pf_delay", "MS", "NUM")).toBe("1000");

  // Rename
  await page.goto("/dashboard");
  const card = page.getByTestId("project-card").first();
  await card.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.locator("#rename").fill("Renamed blink");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("project-card").filter({ hasText: "Renamed blink" })).toHaveCount(1);
  await expect(page.getByTestId("project-card").first()).toContainText("Renamed blink");

  // Duplicate
  await page.getByTestId("project-card").first().getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByTestId("project-card")).toHaveCount(2);

  // Trash → restore → trash → delete permanently
  const dupTitle = "Renamed blink (copy)";
  const dup = page.getByTestId("project-card").filter({ hasText: dupTitle });
  await expect(dup).toHaveCount(1);
  await dup.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await page.goto("/dashboard?view=trash");
  await page.getByTestId("project-card").first().getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await expect(page.getByTestId("project-card")).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByTestId("project-card")).toHaveCount(2);
  await page.getByTestId("project-card").filter({ hasText: dupTitle }).getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await page.goto("/dashboard?view=trash");
  await page.getByTestId("project-card").first().getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Delete permanently…" }).click();
  await page.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByText("Nothing in the trash")).toBeVisible();

  // Import an .ino file (with unsupported C++ that must be preserved)
  await page.goto("/dashboard");
  await page.getByTestId("new-project").click();
  await page.getByRole("tab", { name: "Import .ino / .zip" }).click();
  const ino2 = "// imported\nauto twice = [](int v) { return v * 2; };\n\nvoid setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(300);\n}\n";
  await page.getByTestId("import-file").setInputFiles({ name: "imported_sketch.ino", mimeType: "text/plain", buffer: Buffer.from(ino2) });
  await expect(page.getByText("Import preview")).toBeVisible();
  await page.getByTestId("create-project").click();
  await page.waitForURL(/\/editor/);
  await waitReady(page);
  expect(await source(page)).toBe(ino2);
  expect(await blockField(page, "pf_delay", "MS", "NUM")).toBe("300");
  await expect(page.getByTestId("project-title")).toHaveText("imported_sketch");
  expect(errors).toEqual([]);
});

test("workbench chrome: theme toggle, layout modes, rail panels, phone tabs", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchConsole(page);
  await signup(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await newFromTemplate(page, "dht11-esp32");

  // Theme
  await page.getByTestId("theme-toggle").click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await waitReady(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByTestId("theme-toggle").click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // Layout modes
  for (const [label, mode] of [["Code first", "code-first"], ["Blocks first", "blocks-first"], ["Focus mode", "focus"], ["Side by side", "side-by-side"]] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pf-layout-mode"))).toBe(mode);
    if (mode === "focus") {
      await page.getByRole("button", { name: "Code", exact: true }).click();
      await expect(page.locator(".monaco-editor").first()).toBeVisible();
      await page.getByRole("button", { name: "Blocks", exact: true }).click();
    }
  }
  await expect(page.getByTestId("blockly-host")).toBeVisible();

  // Rail panels open with the orange active state and close again
  await page.getByTestId("rail-blocks").click();
  await expect(page.getByTestId("toolbox-search")).toBeVisible();
  await page.getByTestId("toolbox-search").fill("humidity");
  await expect(page.getByTestId("insert-pf_dht_read_hum")).toBeVisible();
  await page.getByTestId("rail-coverage").click();
  await expect(page.getByTestId("rail-coverage")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("rail-none").click();
  await expect(page.getByTestId("toolbox-search")).toHaveCount(0);

  // Zoom controls drive the Blockly workspace
  const scale = () => page.evaluate(() => (window as unknown as { __pinflow: { Blockly: { getMainWorkspace(): { scale: number } } } }).__pinflow.Blockly.getMainWorkspace().scale);
  const s0 = await scale();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(scale).toBeGreaterThan(s0);

  // Phone: bottom pill tabs
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("phone-tab-blocks")).toBeVisible();
  await page.getByTestId("phone-tab-code").click();
  await expect(page.getByTestId("phone-tab-code")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
  await page.getByTestId("phone-tab-info").click();
  await expect(page.getByText("Sketch overview")).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
