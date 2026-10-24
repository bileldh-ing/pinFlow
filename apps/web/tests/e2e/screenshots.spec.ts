import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createDhtProject, signup, waitReady } from "./helpers";

// Not an assertion suite: regenerates docs/screenshots. Run with E2E_SCREENSHOTS=1.
const OUT = path.resolve(process.cwd(), "../../docs/screenshots");
test.skip(!process.env.E2E_SCREENSHOTS, "set E2E_SCREENSHOTS=1 to regenerate docs/screenshots");

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "page must not scroll horizontally").toBeLessThanOrEqual(1);
}

for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }]) {
  test(`screenshots ${vp.name}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/");
    await expect(page.getByTestId("workbench")).toHaveAttribute("data-ready", "1", { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/landing-${vp.name}.png` });
    await page.locator("#demo").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/landing-demo-${vp.name}.png` });

    await signup(page);
    await page.waitForTimeout(600);
    if (vp.name === "desktop") await page.screenshot({ path: `${OUT}/onboarding-desktop.png` });
    await createDhtProject(page);
    await page.waitForTimeout(2500);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/workbench-${vp.name}.png` });
    if (vp.name === "phone") {
      await page.getByTestId("phone-tab-code").click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/workbench-code-phone.png` });
    }
    await page.goto("/dashboard");
    await page.waitForTimeout(1200);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/dashboard-${vp.name}.png` });
    if (vp.name === "desktop") {
      await page.evaluate(() => { localStorage.setItem("pf-theme", "light"); });
      await page.goto("/dashboard");
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/dashboard-light-desktop.png` });
      await page.locator("a[href*='/editor']").first().click();
      await waitReady(page);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/workbench-light-desktop.png` });
      await page.evaluate(() => localStorage.setItem("pf-theme", "dark"));
    }
  });
}
