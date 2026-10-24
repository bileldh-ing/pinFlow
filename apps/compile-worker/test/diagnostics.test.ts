import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapPath, parseDiagnostics, redactText } from "../src/diagnostics.js";
import { interpretCliOutput, parseUsedLibraries } from "../src/jobs.js";
import { parseSizes } from "../src/sizes.js";
import { FIXTURES } from "./helpers.js";

// Real arduino-cli 1.5.1 / arduino:avr 1.8.8 outputs captured by infra/scripts/capture-compile-outputs.sh
// from /tmp/pinflow-capture/<sketch> (cache path anonymised to /opt/pinflow/.arduino-cache).
const captured = (n: string) => readFileSync(path.join(FIXTURES, "captured", n), "utf8");
const map = (s: string) => ({
  sketchDir: `/tmp/pinflow-capture/${s}`,
  buildDir: `/tmp/pinflow-capture/build-${s}`,
  redact: [{ prefix: "/opt/pinflow/.arduino-cache/data", placeholder: "<arduino-data>" }],
});

describe("parseDiagnostics (captured real output)", () => {
  it("maps an undeclared identifier error to the user's relative .ino path", () => {
    const d = parseDiagnostics(captured("broken-uno.avr.txt"), map("broken-uno"));
    const err = d.find((x) => x.source === "compiler" && x.severity === "error")!;
    expect(err).toMatchObject({ file: "broken-uno.ino", line: 10, column: 29, severity: "error", source: "compiler" });
    expect(err.message).toBe("'undeclaredLevel' was not declared in this scope");
    expect(err.external).toBeUndefined();
    expect(err.raw).not.toContain("/tmp/pinflow-capture");
    expect(d.some((x) => x.source === "arduino-cli" && x.message === "exit status 1")).toBe(true);
  });

  it("parses missing header (fatal error: No such file or directory)", () => {
    const d = parseDiagnostics(captured("missing-header-uno.avr.txt"), map("missing-header-uno"));
    expect(d[0]).toMatchObject({ file: "missing-header-uno.ino", line: 2, column: 10, severity: "error" });
    expect(d[0]!.message).toBe("NotARealLibrary.h: No such file or directory");
  });

  it("parses linker undefined reference with sketch location", () => {
    const d = parseDiagnostics(captured("linker-error-uno.avr.txt"), map("linker-error-uno"));
    const ld = d.find((x) => x.message.startsWith("undefined reference"))!;
    expect(ld).toMatchObject({
      source: "linker",
      file: "linker-error-uno.ino",
      line: 5,
      message: "undefined reference to 'notDefinedAnywhere(int)'",
    });
    expect(d.some((x) => /ld returned/.test(x.message))).toBe(true);
  });
});

describe("parseDiagnostics (synthetic shapes)", () => {
  const m = { sketchDir: "/tmp/job-x/sk", buildDir: "/tmp/job-x/build" };
  it("handles nested files, warnings, notes, missing column and build-dir .ino.cpp copies", () => {
    const out = [
      "/tmp/job-x/sk/src/util.cpp:4:12: warning: unused variable 'q' [-Wunused-variable]",
      "/tmp/job-x/sk/src/util.h:2: error: expected ';' before '}' token",
      "/tmp/job-x/build/sketch/sk.ino.cpp:7:1: note: in expansion of macro 'X'",
      "/home/u/.arduino15/packages/arduino/hardware/avr/1.8.8/cores/arduino/Arduino.h:3:5: error: boom",
      "\u001b[31m/tmp/job-x/sk/sk.ino:1:1: error: colored\u001b[0m",
    ].join("\n");
    const d = parseDiagnostics(out, { ...m, redact: [{ prefix: "/home/u/.arduino15", placeholder: "<arduino-data>" }] });
    expect(d.map((x) => [x.file, x.line, x.column, x.severity])).toEqual([
      ["src/util.cpp", 4, 12, "warning"],
      ["src/util.h", 2, undefined, "error"],
      ["sk.ino", 7, 1, "note"],
      ["<arduino-data>/packages/arduino/hardware/avr/1.8.8/cores/arduino/Arduino.h", 3, 5, "error"],
      ["sk.ino", 1, 1, "error"],
    ]);
    expect(d[3]!.external).toBe(true);
  });
  it("parses ESP32 memory overflow lines", () => {
    const d = parseDiagnostics("/x/bin/ld: region `dram0_0_seg' overflowed by 1234 bytes\ncollect2: error: ld returned 1 exit status", m);
    expect(d[0]).toMatchObject({ severity: "error", source: "linker" });
    expect(d[0]!.message).toContain("overflowed by 1234 bytes");
  });
  it("parses undefined references from object files without a source location", () => {
    const d = parseDiagnostics("/tmp/job-x/build/sketch/sk.ino.cpp.o:(.literal._Z5setupv+0x0): undefined reference to `foo()'", m);
    expect(d[0]).toMatchObject({ source: "linker", message: "undefined reference to 'foo()'", file: undefined });
  });
  it("de-duplicates repeated identical diagnostics", () => {
    const line = "/tmp/job-x/sk/sk.ino:3:1: error: x";
    expect(parseDiagnostics(`${line}\n${line}`, m)).toHaveLength(1);
  });
  it("mapPath / redactText", () => {
    expect(mapPath("/tmp/job-x/sk/a.ino", m)).toEqual({ file: "a.ino", external: false });
    expect(mapPath("/etc/passwd", m).external).toBe(true);
    expect(redactText("cd /tmp/job-x/build/x && /tmp/job-x/other", m)).toBe("cd <build>/x && <job>/other");
  });
});

describe("parseSizes / parseUsedLibraries", () => {
  it("parses AVR size lines", () => {
    const s = parseSizes(
      "Sketch uses 924 bytes (2%) of program storage space. Maximum is 32256 bytes.\nGlobal variables use 9 bytes (0%) of dynamic memory, leaving 2039 bytes for local variables. Maximum is 2048 bytes.",
    );
    expect(s).toEqual({ flash: { used: 924, percent: 2, max: 32256 }, ram: { used: 9, percent: 0, freeForLocals: 2039, max: 2048 } });
  });
  it("returns undefined without size lines", () => expect(parseSizes("nothing")).toBeUndefined());
  it("parses the text used-library table", () => {
    const out =
      "Used library            Version Path\nDHT sensor library      1.4.7   /a/b/DHT_sensor_library\nAdafruit Unified Sensor 1.1.15  /a/b/Adafruit_Unified_Sensor\n\nUsed platform Version Path\n";
    expect(parseUsedLibraries(out)).toEqual([
      { name: "DHT sensor library", version: "1.4.7" },
      { name: "Adafruit Unified Sensor", version: "1.1.15" },
    ]);
  });
});

describe("interpretCliOutput (captured arduino-cli --json documents)", () => {
  it("extracts compiler output, sizes and platform from a successful build", () => {
    const r = interpretCliOutput(captured("blink-uno.avr.cli.json"), "");
    expect(r.sizes).toEqual({ flash: { used: 924, percent: 2, max: 32256 }, ram: { used: 9, percent: 0, freeForLocals: 2039, max: 2048 } });
    expect(r.buildPlatform).toEqual({ id: "arduino:avr", version: "1.8.8" });
    expect(r.text).toContain("Sketch uses 924 bytes");
  });
  it("turns a failed build into diagnosable text", () => {
    const r = interpretCliOutput(captured("broken-uno.avr.cli.json"), "");
    expect(r.text).toContain("Error during build: exit status 1");
    expect(r.text).not.toContain("Error during build: Error during build");
    const d = parseDiagnostics(r.text, map("broken-uno"));
    expect(d[0]).toMatchObject({ file: "broken-uno.ino", line: 10, column: 29 });
  });
  it("falls back to raw text for truncated / non-JSON output", () => {
    expect(interpretCliOutput('{"compiler_out": "abc', "boom").text).toBe('{"compiler_out": "abc\nboom');
    expect(interpretCliOutput("plain", "").text).toBe("plain");
  });
  it("uses executable_sections_size when no size lines are printed", () => {
    const doc = JSON.stringify({
      compiler_out: "",
      builder_result: { executable_sections_size: [{ name: "text", size: 10, max_size: 100 }, { name: "data", size: 2, max_size: 0 }] },
    });
    expect(interpretCliOutput(doc, "").sizes).toEqual({ flash: { used: 10, max: 100 }, ram: { used: 2, max: undefined } });
  });
});
