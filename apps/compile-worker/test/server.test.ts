import { existsSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { checkBearer, RateLimiter } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { createCompileWorkerClient } from "../src/client.js";
import { FakeRunner } from "./fake-runner.js";
import { api, job, startWorker, TOKEN, waitFor, type Started } from "./helpers.js";

const blink = [{ path: "blink.ino", content: "void setup(){}\nvoid loop(){}\n" }];
let s: Started | undefined;
afterEach(async () => {
  await s?.worker.close();
  s = undefined;
});

describe("auth", () => {
  it("requires COMPILE_WORKER_TOKEN outside NODE_ENV=test", () => {
    expect(() => loadConfig({})).toThrow(/COMPILE_WORKER_TOKEN is required/);
    expect(() => loadConfig({ NODE_ENV: "production", COMPILE_WORKER_TOKEN: "short" })).toThrow(/24 characters/);
    expect(loadConfig({ NODE_ENV: "test" }).token).toBe("");
  });
  it("checkBearer is exact", () => {
    expect(checkBearer(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(checkBearer(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(checkBearer(`bearer ${TOKEN}`, TOKEN)).toBe(false);
    expect(checkBearer(TOKEN, TOKEN)).toBe(false);
    expect(checkBearer(undefined, TOKEN)).toBe(false);
    expect(checkBearer("Bearer x", "")).toBe(false);
  });
  it("rejects missing / wrong tokens with 401 on every job route", async () => {
    s = await startWorker({ runner: new FakeRunner() });
    expect((await api(s.url, "POST", "/jobs", job(blink), null)).status).toBe(401);
    expect((await api(s.url, "POST", "/jobs", job(blink), "nope")).status).toBe(401);
    expect((await api(s.url, "GET", "/jobs/00000000-0000-0000-0000-000000000000", undefined, null)).status).toBe(401);
    expect((await api(s.url, "POST", "/jobs/00000000-0000-0000-0000-000000000000/cancel", {}, null)).status).toBe(401);
    expect((await api(s.url, "GET", "/jobs/00000000-0000-0000-0000-000000000000/events", undefined, null)).status).toBe(401);
    expect((await api(s.url, "GET", "/health", undefined, null)).status).toBe(200);
  });
});

describe("request validation", () => {
  it("enforces the FQBN allowlist", async () => {
    s = await startWorker({ runner: new FakeRunner() });
    const r = await api(s.url, "POST", "/jobs", job(blink, "esp32:esp32:esp32s3"));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("fqbn_not_allowed");
    expect(r.body.details.allowed.sort()).toEqual(["arduino:avr:mega", "arduino:avr:nano", "arduino:avr:uno", "esp32:esp32:esp32"]);
    expect((await api(s.url, "POST", "/jobs", job(blink, "arduino:avr:uno --upload"))).body.error).toBe("invalid_request");
    expect((await api(s.url, "POST", "/jobs", job(blink, "arduino:avr:uno:cpu=atmega328"))).status).toBe(400);
    for (const f of ["arduino:avr:uno", "arduino:avr:nano", "arduino:avr:mega", "esp32:esp32:esp32"]) {
      expect((await api(s.url, "POST", "/jobs", job(blink, f))).status).toBe(202);
    }
  });
  it("rejects malicious file paths, unknown fields and bad JSON", async () => {
    s = await startWorker({ runner: new FakeRunner() });
    for (const p of ["../x.ino", "/etc/x.ino", "src/../../x.h", "x.sh", ".x.cpp", "src\\x.h"]) {
      const r = await api(s.url, "POST", "/jobs", job([...blink, { path: p, content: "" }]));
      expect(r.status, p).toBe(400);
      expect(r.body.error, p).toBe("invalid_files");
    }
    const extra = { ...job(blink), files: [{ path: "blink.ino", content: "", mode: "symlink", target: "/etc/passwd" }] };
    expect((await api(s.url, "POST", "/jobs", extra)).body.error).toBe("invalid_request");
    expect((await api(s.url, "POST", "/jobs", { ...job(blink), libraries: ["evil"] })).body.error).toBe("invalid_request");
    expect((await api(s.url, "POST", "/jobs", { ...job(blink), revisionId: -1 })).body.error).toBe("invalid_request");
    expect((await api(s.url, "POST", "/jobs", { ...job(blink), revisionId: "a b" })).body.error).toBe("invalid_request");
    const numeric = await api(s.url, "POST", "/jobs", { ...job(blink), revisionId: 42 });
    expect(numeric.status).toBe(202);
    expect((await waitFor(s.url, numeric.body.jobId)).revisionId).toBe("42");
    const H = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
    expect((await fetch(s.url + "/jobs", { method: "POST", headers: H, body: "{" })).status).toBe(400);
    expect((await fetch(s.url + "/jobs", { method: "POST", headers: { ...H, "content-type": "text/plain" }, body: "{}" })).status).toBe(415);
    expect((await fetch(s.url + "/jobs", { method: "POST", headers: H, body: "x".repeat(3 * 1024 * 1024) })).status).toBe(413);
  });
});

describe("job lifecycle (TEST-ONLY fake runner)", () => {
  it("runs a job, writes files into a temp dir and deletes it afterwards", async () => {
    const runner = new FakeRunner({ output: "Sketch uses 924 bytes (2%) of program storage space. Maximum is 32256 bytes.\n", delayMs: 20 });
    s = await startWorker({ runner });
    const r = await api(s.url, "POST", "/jobs", job([...blink, { path: "src/a.h", content: "#pragma once" }]));
    expect(r.status).toBe(202);
    const done = await waitFor(s.url, r.body.jobId);
    expect(done).toMatchObject({ status: "succeeded", revisionId: "rev_1", sourceHash: "sha256:abc123", sketchName: "blink", exitCode: 0 });
    expect(done.computedSourceHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(done.sizes.flash.used).toBe(924);
    expect(done.toolchain).toMatchObject({ arduinoCli: "1.5.1", platform: { id: "arduino:avr", version: "1.8.8" } });
    expect(runner.sawSketchDir[0]).toBe(true);
    expect(runner.calls[0]!.sketchDir.endsWith("/blink")).toBe(true);
    expect(existsSync(runner.calls[0]!.jobDir)).toBe(false);
    expect(readdirSync(s.workRoot)).toEqual([]);
  });

  it("maps failed output to diagnostics and redacts temp paths from the log", async () => {
    s = await startWorker({
      runner: new FakeRunner({ exitCode: 1, output: "{sketchDir}/blink.ino:2:5: error: 'x' was not declared in this scope\nError during build: exit status 1\n" }),
    });
    const r = await api(s.url, "POST", "/jobs", job(blink));
    const done = await waitFor(s.url, r.body.jobId);
    expect(done.status).toBe("failed");
    expect(done.diagnostics[0]).toMatchObject({ file: "blink.ino", line: 2, column: 5, severity: "error" });
    expect(done.error).toBe("'x' was not declared in this scope");
    expect(done.log.text).not.toMatch(/pinflow-job-/);
  });

  it("times out a hanging compile", async () => {
    s = await startWorker({ runner: new FakeRunner({ hang: true }), env: { COMPILE_TIMEOUT_MS: "150" } });
    const r = await api(s.url, "POST", "/jobs", job(blink));
    const done = await waitFor(s.url, r.body.jobId);
    expect(done.status).toBe("timeout");
    expect(done.error).toMatch(/timed out after 150 ms/);
    expect(readdirSync(s.workRoot)).toEqual([]);
  });

  it("cancels a running job and a queued job (concurrency 1)", async () => {
    s = await startWorker({ runner: new FakeRunner({ hang: true }), env: { COMPILE_CONCURRENCY: "1" } });
    const a = (await api(s.url, "POST", "/jobs", job(blink))).body.jobId;
    const b = (await api(s.url, "POST", "/jobs", job(blink))).body.jobId;
    for (let i = 0; i < 100 && (await api(s.url, "GET", `/jobs/${a}`)).body.status !== "compiling"; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect((await api(s.url, "GET", `/jobs/${b}`)).body.status).toBe("queued");
    expect((await api(s.url, "POST", `/jobs/${b}/cancel`, {})).body.status).toBe("canceled");
    expect((await api(s.url, "POST", `/jobs/${a}/cancel`, {})).status).toBe(200);
    expect((await waitFor(s.url, a)).status).toBe("canceled");
    expect((await api(s.url, "GET", `/jobs/${b}`)).body.error).toBe("canceled before start");
    expect((await api(s.url, "POST", `/jobs/${a}/cancel`, {})).body.status).toBe("canceled"); // terminal: no-op
    expect((await api(s.url, "POST", `/jobs/00000000-0000-0000-0000-000000000000/cancel`, {})).status).toBe(404);
  });

  it("limits the queue", async () => {
    s = await startWorker({ runner: new FakeRunner({ hang: true }), env: { COMPILE_MAX_QUEUE: "2", COMPILE_RATE_LIMIT_PER_MIN: "100" } });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await api(s.url, "POST", "/jobs", job(blink))).status);
    expect(codes).toContain(503);
  });

  it("returns 429 when the per-token rate limit is exhausted, keyed per user", async () => {
    const rl = RateLimiter.perMinute(2, () => 0);
    expect([rl.take("k"), rl.take("k"), rl.take("k") > 0, rl.take("other")]).toEqual([0, 0, true, 0]);
    s = await startWorker({ runner: new FakeRunner(), env: { COMPILE_RATE_LIMIT_PER_MIN: "2" } });
    const st = [];
    for (let i = 0; i < 3; i++) st.push((await api(s.url, "POST", "/jobs", job(blink))).status);
    expect(st).toEqual([202, 202, 429]);
    const other = createCompileWorkerClient({ baseUrl: s.url, token: TOKEN, userId: "user_2" });
    await expect(other.submitJob(job(blink))).resolves.toMatchObject({ status: "queued" });
  });

  it("streams status over SSE and works through the exported client", async () => {
    s = await startWorker({ runner: new FakeRunner({ delayMs: 50 }) });
    const client = createCompileWorkerClient({ baseUrl: s.url, token: TOKEN, userId: "user_1" });
    const { jobId } = await client.submitJob(job(blink));
    const res = await fetch(`${s.url}/jobs/${jobId}/events`, { headers: { authorization: `Bearer ${TOKEN}` } });
    const text = await res.text();
    const statuses = [...text.matchAll(/"status":"(\w+)"/g)].map((m) => m[1]);
    expect(statuses.at(-1)).toBe("succeeded");
    const done = await client.waitForJob(jobId, { intervalMs: 20 });
    expect(done.status).toBe("succeeded");
    await expect(client.getJob("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 404 });
  });
});
