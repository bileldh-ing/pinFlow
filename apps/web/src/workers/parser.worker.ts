/// <reference lib="webworker" />
/**
 * Parser Web Worker: tree-sitter (WASM) runs here, off the UI thread.
 * Protocol: {type:"init", wasmDir} -> {type:"ready"} | {type:"init_error"}
 *           {type:"parse", id, channel, source, path, prev} -> {type:"result", id, channel, result, elapsedMs}
 * Pending requests on the same channel are coalesced to the newest one.
 */
import { initParser, parseSketch } from "@pinflow/cpp-parser";
import type { SketchFile } from "@pinflow/arduino-ir";

type Req =
  | { type: "init"; wasmDir: string }
  | { type: "parse"; id: number; channel: string; source: string; path: string; prev?: SketchFile };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let ready: Promise<void> | null = null;
const pending = new Map<string, Extract<Req, { type: "parse" }>>();
let running = false;

async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending.size) {
      const [channel, req] = pending.entries().next().value as [string, Extract<Req, { type: "parse" }>];
      pending.delete(channel);
      try {
        await ready;
        const t0 = performance.now();
        const result = parseSketch(req.source, req.path, req.prev);
        scope.postMessage({ type: "result", id: req.id, channel: req.channel, result, elapsedMs: performance.now() - t0 });
      } catch (e) {
        scope.postMessage({ type: "error", id: req.id, channel: req.channel, message: e instanceof Error ? e.message : String(e) });
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    running = false;
  }
}

scope.addEventListener("message", (ev: MessageEvent<Req>) => {
  const m = ev.data;
  if (m.type === "init") {
    ready = initParser({ wasmDir: m.wasmDir });
    ready.then(() => scope.postMessage({ type: "ready" }), (e: unknown) => scope.postMessage({ type: "init_error", message: e instanceof Error ? e.message : String(e) }));
    return;
  }
  if (m.type === "parse") {
    if (!ready) ready = initParser({ wasmDir: "/wasm" });
    pending.set(m.channel, m);
    void drain();
  }
});
