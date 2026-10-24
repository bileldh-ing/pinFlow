import { describe, expect, it } from "vitest";
import { createParseHandler } from "../src/index";
import type { WorkerResponse } from "../src/protocol";
import { initOptionsFromRequest } from "../src/protocol";

describe("worker protocol (transport-independent core)", () => {
  it("init -> ready, parse -> result tagged with the request revision", async () => {
    const out: WorkerResponse[] = [];
    const handle = createParseHandler((m) => out.push(m));
    await handle({ type: "init" });
    expect(out[0]).toEqual({ type: "ready" });
    await handle({ type: "parse", revision: 7, source: "void loop() { delay(1); }\n", path: "main.ino" });
    const res = out[1] as Extract<WorkerResponse, { type: "result" }>;
    expect(res.type).toBe("result");
    expect(res.revision).toBe(7);
    expect(res.result.ok).toBe(true);
    expect(res.result.file.path).toBe("main.ino");
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("coalesces queued parses: only the newest pending revision is parsed", async () => {
    const out: WorkerResponse[] = [];
    const handle = createParseHandler((m) => out.push(m));
    const p1 = handle({ type: "parse", revision: 1, source: "int a;\n" });
    const p2 = handle({ type: "parse", revision: 2, source: "int b;\n" });
    const p3 = handle({ type: "parse", revision: 3, source: "int c;\n" });
    await Promise.all([p1, p2, p3]);
    await new Promise((r) => setTimeout(r, 20));
    const revs = out.filter((m) => m.type === "result").map((m) => (m as { revision: number }).revision);
    expect(revs[revs.length - 1]).toBe(3);
    expect(revs).not.toContain(2);
  });

  it("syntax errors come back as ok:false results with prev retained", async () => {
    const out: WorkerResponse[] = [];
    const handle = createParseHandler((m) => out.push(m));
    const prev = { path: "main.ino", items: [], eol: "\n" as const };
    await handle({ type: "parse", revision: 1, source: "void loop( {", prev });
    const res = out[0] as Extract<WorkerResponse, { type: "result" }>;
    expect(res.result.ok).toBe(false);
    expect(res.result.file).toEqual(prev);
  });

  it("maps init URLs to locateFile", () => {
    const o = initOptionsFromRequest({ type: "init", webTreeSitterWasmUrl: "/a/rt.wasm", treeSitterCppWasmUrl: "/b/cpp.wasm" });
    expect(o.locateFile!("web-tree-sitter.wasm")).toBe("/a/rt.wasm");
    expect(o.locateFile!("tree-sitter-cpp.wasm")).toBe("/b/cpp.wasm");
    expect(initOptionsFromRequest({ type: "init", wasmDir: "/wasm" })).toEqual({ wasmDir: "/wasm" });
  });
});
