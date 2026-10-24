import { expect, type Page } from "@playwright/test";

export async function signup(page: Page): Promise<string> {
  const email = `e2e+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  return email;
}

export async function createDhtProject(page: Page) {
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByTestId("new-project").click();
  await page.getByTestId("template-dht11-esp32").click();
  await page.getByTestId("create-project").click();
  await page.waitForURL(/\/projects\/.+\/editor/);
  await waitReady(page);
}

export async function waitReady(page: Page) {
  await expect(page.getByTestId("workbench")).toHaveAttribute("data-ready", "1", { timeout: 60_000 });
  await page.waitForFunction(() => !!(window as unknown as { __pinflow?: unknown }).__pinflow);
}

export const source = (page: Page) => page.evaluate(() => (window as unknown as { __pinflow: { engine: { getSource(): string } } }).__pinflow.engine.getSource());

/** Set a field on the first block of `type` (optionally on its input child), as a user edit would. */
export async function setBlockField(page: Page, type: string, input: string | null, field: string, value: string) {
  await page.evaluate(({ type, input, field, value }) => {
    const pf = (window as unknown as { __pinflow: { Blockly: { getMainWorkspace(): { getAllBlocks(o: boolean): Array<{ type: string; getInputTargetBlock(n: string): { setFieldValue(v: string, f: string): void } | null; setFieldValue(v: string, f: string): void }> } } } }).__pinflow;
    const blk = pf.Blockly.getMainWorkspace().getAllBlocks(false).find((b) => b.type === type);
    if (!blk) throw new Error(`no block ${type}`);
    const target = input ? blk.getInputTargetBlock(input) : blk;
    target!.setFieldValue(value, field);
  }, { type, input, field, value });
}

export async function blockField(page: Page, type: string, input: string | null, field: string) {
  return page.evaluate(({ type, input, field }) => {
    const pf = (window as unknown as { __pinflow: { Blockly: { getMainWorkspace(): { getAllBlocks(o: boolean): Array<{ type: string; getInputTargetBlock(n: string): { getFieldValue(f: string): string } | null; getFieldValue(f: string): string }> } } } }).__pinflow;
    const blk = pf.Blockly.getMainWorkspace().getAllBlocks(false).find((b) => b.type === type);
    const t = blk ? (input ? blk.getInputTargetBlock(input) : blk) : null;
    return t ? t.getFieldValue(field) : null;
  }, { type, input, field });
}

export const blockTypes = (page: Page) => page.evaluate(() => (window as unknown as { __pinflow: { Blockly: { getMainWorkspace(): { getAllBlocks(o: boolean): Array<{ type: string }> } } } }).__pinflow.Blockly.getMainWorkspace().getAllBlocks(false).map((b) => b.type));

/** Replace the whole code as if typed (goes through the user-edit path, not the generator path). */
export async function setCode(page: Page, text: string) {
  await page.evaluate((t) => {
    const ed = (window as unknown as { monaco: { editor: { getEditors(): Array<{ getModel(): { getFullModelRange(): unknown }; executeEdits(s: string, e: unknown[]): void }> } } }).monaco.editor.getEditors()[0]!;
    ed.executeEdits("keyboard", [{ range: ed.getModel().getFullModelRange(), text: t }]);
  }, text);
}
