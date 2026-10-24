import { expect, test } from "@playwright/test";
import { signup, waitReady } from "./helpers";

// Runs only when the server under test has a real compile worker (E2E_COMPILE=1).
// Uses blink-uno (arduino:avr:uno): AVR builds take seconds; ESP32 cold builds take 10-20 min on small hosts.
test("real compile of blink-uno succeeds and is marked outdated after an edit", async ({ page }) => {
  test.skip(!process.env.E2E_COMPILE, "set E2E_COMPILE=1 with COMPILE_WORKER_URL/TOKEN on the server");
  test.setTimeout(300_000);
  await signup(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByTestId("new-project").click();
  await page.getByTestId("template-blink-uno").click();
  await page.getByTestId("create-project").click();
  await page.waitForURL(/\/editor/);
  await waitReady(page);
  await page.getByTestId("compile").click();
  await expect(page.getByTestId("compile-status")).toContainText("Compiled", { timeout: 240_000 });
  await expect(page.getByTestId("compile-outdated")).toHaveCount(0);
  await page.evaluate(() => {
    const ed = (window as unknown as { monaco: { editor: { getEditors(): Array<{ getModel(): { getFullModelRange(): unknown; getValue(): string }; executeEdits(s: string, e: unknown[]): void }> } } }).monaco.editor.getEditors()[0]!;
    ed.executeEdits("keyboard", [{ range: ed.getModel().getFullModelRange(), text: ed.getModel().getValue().replace("delay(1000)", "delay(250)") }]);
  });
  await expect(page.getByTestId("compile-outdated")).toBeVisible({ timeout: 15_000 });
});

test("real compile error is reported with the compiler diagnostic", async ({ page }) => {
  test.skip(!process.env.E2E_COMPILE, "set E2E_COMPILE=1 with COMPILE_WORKER_URL/TOKEN on the server");
  test.setTimeout(300_000);
  await signup(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByTestId("new-project").click();
  await page.getByTestId("template-blink-uno").click();
  await page.getByTestId("create-project").click();
  await page.waitForURL(/\/editor/);
  await waitReady(page);
  // Parses fine (so blocks stay valid) but the compiler rejects the undeclared function.
  await page.evaluate(() => {
    const ed = (window as unknown as { monaco: { editor: { getEditors(): Array<{ getModel(): { getFullModelRange(): unknown; getValue(): string }; executeEdits(s: string, e: unknown[]): void }> } } }).monaco.editor.getEditors()[0]!;
    ed.executeEdits("keyboard", [{ range: ed.getModel().getFullModelRange(), text: ed.getModel().getValue().replace("delay(1000);", "delay(1000);\n  notDeclaredAnywhere(3);") }]);
  });
  await expect(page.getByTestId("workbench")).toHaveAttribute("data-parse", "ok");
  await page.getByTestId("compile").click();
  await expect(page.getByTestId("compile-status")).toContainText("Compile failed", { timeout: 240_000 });
  await page.getByTestId("compile-status").click();
  await expect(page.getByRole("dialog")).toContainText("notDeclaredAnywhere");
  await expect(page.getByRole("dialog")).toContainText(/error/);
});
