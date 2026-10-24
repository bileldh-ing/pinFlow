/**
 * REAL integration tests: start the worker with the real ArduinoCliRunner (prlimit + env scrub)
 * and compile fixtures from fixtures/compile with the pinned arduino-cli + cores + libraries in
 * <repo>/.arduino-cache. Skipped (with a printed reason) only when the CLI or a core is missing.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics.js";
import { REPO_ROOT } from "../src/toolchain.js";
import { api, job, loadFixture, startWorker, waitFor, type Started } from "./helpers.js";

const CACHE = process.env.ARDUINO_CACHE_DIR ?? path.join(REPO_ROOT, ".arduino-cache");
const CLI = path.join(CACHE, "bin", "arduino-cli");
const HAS_CLI = existsSync(CLI);
const HAS_AVR = existsSync(path.join(CACHE, "data/packages/arduino/hardware/avr/1.8.8"));
const HAS_ESP32 = existsSync(path.join(CACHE, "data/packages/esp32/hardware/esp32/3.3.12"));
const HAS_DHT = existsSync(path.join(CACHE, "user/libraries/DHT_sensor_library"));

if (!HAS_CLI) console.warn(`[integration] SKIPPED: arduino-cli not found at ${CLI}. Run infra/scripts/setup-arduino-toolchain.sh`);
else if (!HAS_AVR) console.warn("[integration] arduino:avr@1.8.8 not installed – AVR tests skipped");
// The ESP32 compile needs ~1–2 GB free RAM and 11–18 min with a cold core cache on a 2-vCPU box,
// so it is opt-in: PINFLOW_INTEGRATION_ESP32=1 pnpm test:integration
const RUN_ESP32 = process.env.PINFLOW_INTEGRATION_ESP32 === "1";
if (HAS_CLI && (!HAS_ESP32 || !HAS_DHT)) console.warn("[integration] esp32:esp32@3.3.12 or DHT library not installed – ESP32 test skipped");
else if (HAS_CLI && !RUN_ESP32) console.warn("[integration] ESP32 real-compile tests SKIPPED (opt-in): set PINFLOW_INTEGRATION_ESP32=1");

// Cold build caches on a 2-CPU arm64 box can be slow; allow generous wall clock in tests
// (production per-board defaults stay 60 s AVR / 120 s ESP32, see toolchain.lock.json).
const TIMEOUT = Number(process.env.PINFLOW_INTEGRATION_TIMEOUT_MS ?? 900_000);
const OUT_DIR = path.join(REPO_ROOT, "fixtures", "compile", "captured");

let s: Started;
beforeAll(async () => {
  if (!HAS_CLI) return;
  s = await startWorker({ env: { COMPILE_TIMEOUT_MS: String(TIMEOUT), COMPILE_RATE_LIMIT_PER_MIN: "100" } });
  const v = await s.worker.verification;
  if (!v.ok) console.warn("[integration] toolchain verification problems:", v.problems);
}, 60_000);
afterAll(async () => {
  await s?.worker.close();
});

/** per-job build dirs under build_cache/sketches must be removed after every job */
function sketchBuildDirs(): string[] {
  const d = path.join(CACHE, "build-cache", "sketches");
  return existsSync(d) ? readdirSync(d) : [];
}

function record(name: string, j: unknown) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, `${name}.job.json`), JSON.stringify(j, null, 2) + "\n");
}

describe.skipIf(!HAS_CLI || !HAS_AVR)("real compile: arduino:avr", () => {
  it(
    "compiles blink-uno for arduino:avr:uno",
    async () => {
      const r = await api(s.url, "POST", "/jobs", job(loadFixture("blink-uno"), "arduino:avr:uno"));
      expect(r.status).toBe(202);
      const done = await waitFor(s.url, r.body.jobId, TIMEOUT + 30_000);
      record("blink-uno", done);
      expect(done.status, done.log.text).toBe("succeeded");
      expect(done.exitCode).toBe(0);
      expect(done.sizes.flash.used).toBeGreaterThan(400);
      expect(done.sizes.flash.max).toBe(32256);
      expect(done.sizes.ram.max).toBe(2048);
      expect(done.toolchain).toMatchObject({
        arduinoCli: "1.5.1",
        platform: { id: "arduino:avr", version: "1.8.8" },
        buildPlatform: { id: "arduino:avr", version: "1.8.8" },
        verified: true,
      });
      expect(done.log.text).not.toContain("pinflow-job-");
      expect(done.log.text).not.toContain(REPO_ROOT);
      expect(done.diagnostics.filter((d: Diagnostic) => d.severity === "error")).toEqual([]);
    },
    TIMEOUT + 60_000,
  );

  it(
    "broken sketch yields an error diagnostic with the correct relative file and line",
    async () => {
      const r = await api(s.url, "POST", "/jobs", job(loadFixture("broken-uno"), "arduino:avr:uno"));
      const done = await waitFor(s.url, r.body.jobId, TIMEOUT + 30_000);
      record("broken-uno", done);
      expect(done.status).toBe("failed");
      const err = done.diagnostics.find((d: Diagnostic) => d.severity === "error" && d.source === "compiler");
      expect(err).toMatchObject({ file: "broken-uno.ino", line: 10, column: 29 });
      expect(err.message).toMatch(/'undeclaredLevel' was not declared/);
      expect(done.error).toMatch(/undeclaredLevel/);
      expect(done.log.text).not.toContain("pinflow-job-");
    },
    TIMEOUT + 60_000,
  );

  it(
    "missing library header is reported (no automatic library install)",
    async () => {
      const r = await api(s.url, "POST", "/jobs", job(loadFixture("missing-header-uno"), "arduino:avr:uno"));
      const done = await waitFor(s.url, r.body.jobId, TIMEOUT + 30_000);
      expect(done.status).toBe("failed");
      expect(done.diagnostics[0]).toMatchObject({
        file: "missing-header-uno.ino",
        line: 2,
        message: "NotARealLibrary.h: No such file or directory",
      });
    },
    TIMEOUT + 60_000,
  );

  it(
    "linker errors map back to the sketch",
    async () => {
      const r = await api(s.url, "POST", "/jobs", job(loadFixture("linker-error-uno"), "arduino:avr:uno"));
      const done = await waitFor(s.url, r.body.jobId, TIMEOUT + 30_000);
      expect(done.status).toBe("failed");
      expect(done.diagnostics.find((d: Diagnostic) => d.source === "linker" && d.file)).toMatchObject({
        file: "linker-error-uno.ino",
        line: 5,
        message: "undefined reference to 'notDefinedAnywhere(int)'",
      });
    },
    TIMEOUT + 60_000,
  );

  it(
    "cancels a real compile in progress",
    async () => {
      const r = await api(s.url, "POST", "/jobs", job(loadFixture("blink-uno"), "arduino:avr:mega"));
      for (let i = 0; i < 400; i++) {
        const st = (await api(s.url, "GET", `/jobs/${r.body.jobId}`)).body.status;
        if (st === "compiling" || st === "succeeded") break;
        await new Promise((res) => setTimeout(res, 25));
      }
      await api(s.url, "POST", `/jobs/${r.body.jobId}/cancel`, {});
      const done = await waitFor(s.url, r.body.jobId, 30_000);
      // A warm-cache build could finish before the cancel lands; both outcomes are legitimate.
      expect(["canceled", "succeeded"]).toContain(done.status);
      await new Promise((res) => setTimeout(res, 2500)); // let SIGKILL'd children exit
      expect(sketchBuildDirs()).toEqual([]);
      if (done.status === "canceled") console.log("[integration] real compile canceled after", done.durationMs, "ms");
      expect(s.worker.manager.stats().running).toBe(0);
    },
    60_000,
  );
});

describe.skipIf(!HAS_CLI || !HAS_ESP32 || !HAS_DHT || !RUN_ESP32)("real compile: esp32:esp32", () => {
  it(
    "compiles dht11-esp32 for esp32:esp32:esp32 with pinned DHT libraries",
    async () => {
      const r = await api(s.url, "POST", "/jobs", job(loadFixture("dht11-esp32"), "esp32:esp32:esp32"));
      expect(r.status).toBe(202);
      const done = await waitFor(s.url, r.body.jobId, TIMEOUT + 30_000);
      record("dht11-esp32", done);
      expect(done.status, done.log.text.slice(-4000)).toBe("succeeded");
      expect(done.sizes.flash.used).toBeGreaterThan(100_000);
      expect(done.sizes.ram.used).toBeGreaterThan(1000);
      expect(done.toolchain.platform).toEqual({ id: "esp32:esp32", version: "3.3.12" });
      expect(done.toolchain.buildPlatform).toEqual({ id: "esp32:esp32", version: "3.3.12" });
      const libs = done.toolchain.usedLibraries ?? [];
      expect(libs).toContainEqual({ name: "DHT sensor library", version: "1.4.7" });
      expect(sketchBuildDirs()).toEqual([]);
    },
    TIMEOUT + 60_000,
  );

  it(
    "warm rebuild (cached ESP32 core) finishes within the production 120 s ESP32 timeout",
    async () => {
      const files = loadFixture("dht11-esp32").map((f) => ({ ...f, content: f.content.replace("delay(2000);", "delay(2500);") }));
      const r = await api(s.url, "POST", "/jobs", job(files, "esp32:esp32:esp32"));
      const done = await waitFor(s.url, r.body.jobId, TIMEOUT + 30_000);
      record("dht11-esp32-warm", { status: done.status, durationMs: done.durationMs, sizes: done.sizes });
      expect(done.status).toBe("succeeded");
      console.log(`[integration] warm ESP32 rebuild took ${done.durationMs} ms`);
      expect(done.durationMs).toBeLessThan(120_000);
    },
    TIMEOUT + 60_000,
  );
});
