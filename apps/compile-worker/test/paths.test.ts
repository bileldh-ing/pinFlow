import { describe, expect, it } from "vitest";
import { PathValidationError, validateRelativePath, validateSketch } from "../src/paths.js";

const ok = (p: string) => expect(validateRelativePath(p)).toBe(p);
const bad = (p: string) => expect(() => validateRelativePath(p), p).toThrow(PathValidationError);

describe("validateRelativePath", () => {
  it("accepts normal sketch paths", () => {
    ok("blink.ino");
    ok("src/util.cpp");
    ok("src/drivers/dht_wrapper.h");
    ok("lib_helpers.hpp");
    ok("config.c");
  });

  it.each([
    "../evil.ino",
    "src/../../etc/passwd.h",
    "..",
    "./blink.ino",
    "src/./x.cpp",
    "/etc/passwd.h",
    "/tmp/x.ino",
    "C:/Windows/x.cpp",
    "c:x.cpp",
    "src\\..\\x.cpp",
    "..\\..\\x.h",
    "~/x.cpp",
    "src//x.cpp",
    "src/",
    "",
    ".hidden.cpp",
    "src/.git/config.h",
    "a\u0000.cpp",
    "a\n.cpp",
    "evil.sh",
    "Makefile",
    "x.ino.exe",
    "payload.py",
    "x.cpp ",
    "x .cpp",
    "src/$(rm -rf).cpp",
    "src/`id`.h",
    "a;b.cpp",
    "con.h",
    "src/NUL.cpp",
    "a/b/c/d/e.h",
    "src/nested.ino",
    "x".repeat(200) + ".h",
    "e\u0301.cpp", // NFD
    "src/%2e%2e/x.cpp",
  ])("rejects %j", (p) => bad(p));
});

describe("validateSketch", () => {
  const f = (path: string, content = "") => ({ path, content });

  it("derives sketch name from the single root .ino", () => {
    expect(validateSketch([f("blink.ino"), f("src/a.cpp")]).sketchName).toBe("blink");
  });
  it("requires sketchName when several root .ino exist and it must match", () => {
    expect(() => validateSketch([f("a.ino"), f("b.ino")])).toThrow(/sketchName is required/);
    expect(validateSketch([f("a.ino"), f("b.ino")], "b").sketchName).toBe("b");
    expect(() => validateSketch([f("a.ino")], "other")).toThrow(/must match main .ino/);
  });
  it("rejects sketches without .ino or invalid sketch names", () => {
    expect(() => validateSketch([f("a.cpp")])).toThrow(/no .ino/);
    expect(() => validateSketch([f("_x.ino")])).toThrow(/invalid sketch name/);
    expect(() => validateSketch([f("a.ino")], "../a")).toThrow(/invalid sketch name/);
  });
  it("rejects case-insensitive duplicates and file/dir collisions", () => {
    expect(() => validateSketch([f("a.ino"), f("src/X.h"), f("src/x.h")])).toThrow(/duplicate/);
    expect(() => validateSketch([f("a.ino"), f("A.INO")])).toThrow(/duplicate/);
  });
  it("enforces count and size limits", () => {
    const many = [f("a.ino"), ...Array.from({ length: 40 }, (_, i) => f(`src/f${i}.h`))];
    expect(() => validateSketch(many)).toThrow(/too many files/);
    expect(() => validateSketch([f("a.ino", "x".repeat(300 * 1024))])).toThrow(/file too large/);
    const big = [f("a.ino"), ...Array.from({ length: 5 }, (_, i) => f(`src/f${i}.h`, "y".repeat(250 * 1024)))];
    expect(() => validateSketch(big)).toThrow(/sketch too large/);
    expect(() => validateSketch([f("a.ino", "a\u0000b")])).toThrow(/NUL/);
  });
});
