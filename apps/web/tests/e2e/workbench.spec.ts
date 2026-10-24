import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { blockField, blockTypes, createDhtProject, setBlockField, setCode, signup, source, waitReady } from "./helpers";

test("signup → DHT11 project → blocks↔code sync → raw preservation → syntax error → save/reload → export", async ({ page }) => {
  await signup(page);
  await createDhtProject(page);

  // Blocks render from the parsed template
  const types = await blockTypes(page);
  for (const t of ["pf_setup", "pf_loop", "pf_dht_object", "pf_dht_read_temp", "pf_delay"]) expect(types).toContain(t);
  await expect(page.getByTestId("coverage-status")).toContainText("%");

  // Edit a block → code updates
  await setBlockField(page, "pf_delay", "MS", "NUM", "500");
  await expect.poll(() => source(page)).toContain("delay(500);");
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("delay(500);");

  // Edit code → blocks update
  await setCode(page, (await source(page)).replace("delay(500);", "delay(750);"));
  await expect.poll(() => blockField(page, "pf_delay", "MS", "NUM")).toBe("750");

  // Raw preservation: unsupported C++ becomes a preserved block and survives a block edit byte-for-byte
  const raw = "auto twice = [](int v) { return v * 2; }; // keep {me}";
  await setCode(page, (await source(page)).replace("void setup() {", `void setup() {\n  ${raw}`));
  await expect.poll(async () => (await blockTypes(page)).filter((t) => t.startsWith("pf_raw")).length).toBeGreaterThan(0);
  await setBlockField(page, "pf_delay", "MS", "NUM", "900");
  await expect.poll(() => source(page)).toContain("delay(900);");
  expect(await source(page)).toContain(raw);

  // Syntax error keeps last good blocks
  const before = (await blockTypes(page)).length;
  const good = await source(page);
  await setCode(page, good.replace("void loop() {", "void loop() {\n  if ("));
  await expect(page.getByTestId("syntax-banner")).toBeVisible();
  expect((await blockTypes(page)).length).toBe(before);
  await setCode(page, good);
  await expect(page.getByTestId("syntax-banner")).toBeHidden();

  // Save (server-acknowledged) and reload
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-status", "saved", { timeout: 30_000 });
  await page.reload();
  await waitReady(page);
  expect(await source(page)).toContain("delay(900);");
  expect(await source(page)).toContain(raw);
  expect(await blockField(page, "pf_delay", "MS", "NUM")).toBe("900");

  // Export .ino
  await page.getByTestId("export-menu").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-ino").click()]);
  const text = readFileSync((await download.path())!, "utf8");
  expect(text).toContain("delay(900);");
  expect(text).toContain(raw);
});

test("unauthenticated users cannot open another project and API rejects them", async ({ page, request }) => {
  const res = await request.post("/api/projects/00000000-0000-4000-8000-000000000000/save", { data: { expectedRevision: 1, files: [{ path: "a.ino", content: "" }] } });
  expect(res.status()).toBe(401);
  await page.goto("/projects/00000000-0000-4000-8000-000000000000/editor");
  await expect(page).toHaveURL(/\/login/);
});

test("compile without a configured worker reports an honest error", async ({ page }) => {
  test.skip(!!process.env.E2E_COMPILE, "server has a compile worker");
  await signup(page);
  await createDhtProject(page);
  await page.getByTestId("compile").click();
  await expect(page.getByTestId("compile-status")).toContainText("Compile unavailable", { timeout: 60_000 });
  await expect(page.getByRole("dialog")).toContainText("COMPILE_WORKER_URL");
});
