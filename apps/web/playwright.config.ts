import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Use a system Chromium when Playwright's own build is not installed (arm64 sandboxes).
const systemChromium = process.env.PW_CHROMIUM_PATH ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "off",
    launchOptions: systemChromium ? { executablePath: systemChromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] } : { args: ["--disable-dev-shm-usage"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: `rm -rf .pglite-data-e2e && PGLITE_DIR=.pglite-data-e2e COOKIE_SECURE=0 PINFLOW_DEV_OUTBOX=1 ./node_modules/.bin/next start -p ${PORT}`,
    port: PORT, reuseExistingServer: true, timeout: 120_000,
  },
});
