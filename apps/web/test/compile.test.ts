import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompileWorkerUnavailable, getJob, normalizeJob, submitJob } from "@/server/compile";

const fixture = (n: string) => JSON.parse(readFileSync(path.resolve(__dirname, "../../../fixtures/compile/captured", n), "utf8"));

describe("compile worker adapter", () => {
  afterEach(() => { delete process.env.COMPILE_WORKER_URL; });

  it("normalizes a captured failed job: located + project-level diagnostics, log object → text", () => {
    const n = normalizeJob(fixture("broken-uno.job.json"));
    expect(n.status).toBe("failed");
    expect(n.diagnostics[0]).toMatchObject({ file: "broken-uno.ino", line: 10, column: 29, severity: "error" });
    const projectLevel = n.diagnostics.find((d) => d.source === "arduino-cli")!;
    expect(projectLevel.line).toBe(0);
    expect(projectLevel.file).toBe("");
    expect(typeof n.log).toBe("string");
  });

  it("normalizes a captured successful job with sizes and toolchain", () => {
    const n = normalizeJob(fixture("blink-uno.job.json"));
    expect(n.status).toBe("succeeded");
    expect(n.toolchain).toBeTruthy();
  });

  it("reports an honest error when no worker is configured or reachable", async () => {
    await expect(getJob("x")).rejects.toBeInstanceOf(CompileWorkerUnavailable);
    process.env.COMPILE_WORKER_URL = "http://127.0.0.1:9";
    await expect(submitJob({ projectId: "p", revisionId: 1, fqbn: "arduino:avr:uno", files: [{ path: "a.ino", content: "" }], sourceHash: "h" })).rejects.toThrow(/unreachable/);
  });
});
