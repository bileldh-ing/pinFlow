import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArduinoCliRunner, buildCompileArgs, detectPrlimit, prlimitArgs } from "../src/runner.js";

// These tests exercise the REAL process runner against a stand-in executable (not arduino-cli)
// to check env scrubbing, argument passing (no shell), rlimits, process-group kill and output caps.
function setup(script: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pinflow-runner-"));
  const cli = path.join(dir, "fake-cli.sh");
  writeFileSync(cli, `#!/bin/sh\n${script}\n`);
  chmodSync(cli, 0o755);
  const jobDir = path.join(dir, "job");
  const sketchDir = path.join(jobDir, "sk");
  mkdirSync(sketchDir, { recursive: true });
  mkdirSync(path.join(jobDir, "tmp"));
  return { dir, cli, jobDir, sketchDir };
}

const input = (t: ReturnType<typeof setup>, signal = new AbortController().signal, maxOutputBytes = 1 << 20) => ({
  fqbn: "arduino:avr:uno",
  sketchDir: t.sketchDir,
  buildDir: path.join(t.jobDir, "build"),
  jobDir: t.jobDir,
  tmpDir: path.join(t.jobDir, "tmp"),
  signal,
  maxOutputBytes,
});

describe("ArduinoCliRunner (process isolation)", () => {
  it("passes arguments as an array (no shell interpretation) and scrubs env", async () => {
    process.env.SECRET_DB_URL = "postgres://secret";
    const t = setup('for a in "$@"; do echo "ARG:$a"; done; env | sort');
    const r = await new ArduinoCliRunner({ cliPath: t.cli, configFile: "/cfg.yaml", homeDir: t.dir, prlimitPath: detectPrlimit() }).run(input(t));
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("ARG:--fqbn\nARG:arduino:avr:uno");
    expect(r.output).toContain(`ARG:${t.sketchDir}`);
    expect(r.output).not.toContain("SECRET_DB_URL");
    expect(r.output).not.toContain("COMPILE_WORKER_TOKEN");
    const envKeys = [...r.output.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]).filter((k) => k !== "PWD" && k !== "SHLVL" && k !== "_");
    expect(new Set(envKeys)).toEqual(
      new Set(["PATH", "HOME", "TMPDIR", "LC_ALL", "LANG", "ARDUINO_METRICS_ENABLED", "ARDUINO_UPDATER_ENABLE_NOTIFICATION", "GOMEMLIMIT"]),
    );
    expect(r.output).toContain(`TMPDIR=${path.join(t.jobDir, "tmp")}`);
  });

  it("applies rlimits through prlimit when available", async () => {
    const pl = detectPrlimit();
    if (!pl) return console.warn("prlimit not available – skipping rlimit assertion");
    const t = setup("ulimit -t; ulimit -c");
    const r = await new ArduinoCliRunner({ cliPath: t.cli, configFile: "/c", homeDir: t.dir, prlimitPath: pl, rlimits: { cpuSeconds: 77 } }).run(input(t));
    expect(r.output.trim().split("\n")).toEqual(["77", "0"]);
  });

  it("kills the whole process group on abort", async () => {
    const t = setup(`sleep 30 & echo child:$!; wait`);
    const ac = new AbortController();
    const p = new ArduinoCliRunner({ cliPath: t.cli, configFile: "/c", homeDir: t.dir }).run(input(t, ac.signal));
    await new Promise((r) => setTimeout(r, 300));
    ac.abort();
    const r = await p;
    expect(r.aborted).toBe(true);
    const child = Number(/child:(\d+)/.exec(r.output)?.[1]);
    expect(child).toBeGreaterThan(0);
    await new Promise((res) => setTimeout(res, 200));
    expect(() => process.kill(child, 0)).toThrow(); // the background sleep is gone too
  });

  it("caps captured output", async () => {
    const t = setup("yes 0123456789 | head -c 200000");
    const r = await new ArduinoCliRunner({ cliPath: t.cli, configFile: "/c", homeDir: t.dir }).run(input(t, undefined, 1000));
    expect(r.output.length).toBe(1000);
    expect(r.truncated).toBe(true);
    expect(r.outputBytes).toBe(200000);
  });

  it("reports spawn errors", async () => {
    const t = setup("true");
    const r = await new ArduinoCliRunner({ cliPath: path.join(t.dir, "missing"), configFile: "/c", homeDir: t.dir }).run(input(t));
    expect(r.spawnError).toBeDefined();
  });

  it("builds the expected compile command", () => {
    expect(
      buildCompileArgs({ cliPath: "x", configFile: "/c.yaml", homeDir: "/h" }, { fqbn: "esp32:esp32:esp32", buildDir: "/j/build", sketchDir: "/j/sk" }),
    ).toEqual(["--config-file", "/c.yaml", "compile", "--fqbn", "esp32:esp32:esp32", "--warnings", "default", "--no-color", "--json", "/j/sk"]);
    expect(
      buildCompileArgs({ cliPath: "x", configFile: "/c.yaml", homeDir: "/h", useBuildPath: true, json: false, jobs: 1 }, { fqbn: "arduino:avr:uno", buildDir: "/j/build", sketchDir: "/j/sk" }),
    ).toEqual(["--config-file", "/c.yaml", "compile", "--fqbn", "arduino:avr:uno", "--build-path", "/j/build", "--warnings", "default", "--no-color", "--jobs", "1", "/j/sk"]);
    expect(prlimitArgs({ addressSpaceBytes: 10, cpuSeconds: 2, processes: 5 })).toEqual(["--core=0", "--as=10", "--cpu=2", "--nproc=5"]);
  });
});
