import type { ParseResult, SketchFile } from "@pinflow/arduino-ir";

export type ParserMode = "starting" | "worker" | "main-thread" | "failed";

type Pending = { resolve: (r: { result: ParseResult; elapsedMs: number } | null) => void };

/**
 * Talks to the parser Web Worker. Falls back to parsing on the main thread if
 * the worker cannot start (old browser, CSP), and reports which mode is used.
 * Each channel ("edit", "background") keeps only its newest request; older
 * requests on that channel resolve to null (stale).
 */
export class ParserClient {
  mode: ParserMode = "starting";
  error?: string;
  private worker?: Worker;
  private seq = 0;
  private waiting = new Map<number, Pending>();
  private latest = new Map<string, number>();
  private readyPromise: Promise<void>;
  private mainParse?: (src: string, path: string, prev?: SketchFile) => ParseResult;

  constructor(private wasmDir = "/wasm", private onMode?: (m: ParserMode) => void) {
    this.readyPromise = this.start();
  }

  private setMode(m: ParserMode) { this.mode = m; this.onMode?.(m); }

  private async start(): Promise<void> {
    try {
      const w = new Worker(new URL("../workers/parser.worker.ts", import.meta.url), { type: "module" });
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("parser worker did not start in 15 s")), 15000);
        w.onmessage = (ev) => {
          const m = ev.data as { type: string; message?: string };
          if (m.type === "ready") { clearTimeout(t); resolve(); }
          else if (m.type === "init_error") { clearTimeout(t); reject(new Error(m.message)); }
        };
        w.onerror = (e) => { clearTimeout(t); reject(new Error(e.message || "worker error")); };
        w.postMessage({ type: "init", wasmDir: new URL(this.wasmDir, location.href).href });
      });
      w.onmessage = (ev) => this.onMessage(ev.data);
      this.worker = w;
      this.setMode("worker");
    } catch (e) {
      this.worker?.terminate();
      this.worker = undefined;
      try {
        const mod = await import("@pinflow/cpp-parser");
        await mod.initParser({ wasmDir: new URL(this.wasmDir, location.href).href });
        this.mainParse = (s, p, prev) => mod.parseSketch(s, p, prev);
        this.error = `Worker unavailable (${e instanceof Error ? e.message : String(e)}); parsing on the main thread.`;
        this.setMode("main-thread");
      } catch (e2) {
        this.error = e2 instanceof Error ? e2.message : String(e2);
        this.setMode("failed");
      }
    }
  }

  private onMessage(m: { type: string; id: number; result?: ParseResult; elapsedMs?: number }) {
    const p = this.waiting.get(m.id);
    if (!p) return;
    this.waiting.delete(m.id);
    p.resolve(m.type === "result" && m.result ? { result: m.result, elapsedMs: m.elapsedMs ?? 0 } : null);
  }

  ready(): Promise<void> { return this.readyPromise; }

  /** Parse `source`; resolves null if superseded by a newer request on the same channel or on failure. */
  async parse(source: string, path: string, prev: SketchFile | undefined, channel = "edit"): Promise<{ result: ParseResult; elapsedMs: number } | null> {
    const id = ++this.seq;
    this.latest.set(channel, id);
    await this.readyPromise;
    if (this.latest.get(channel) !== id) return null;
    if (this.worker) {
      // supersede older requests on this channel
      for (const [pid, p] of this.waiting) if (pid < id && (p as Pending & { channel?: string }).channel === channel) { p.resolve(null); this.waiting.delete(pid); }
      const res = await new Promise<{ result: ParseResult; elapsedMs: number } | null>((resolve) => {
        const entry: Pending & { channel?: string } = { resolve, channel };
        this.waiting.set(id, entry);
        this.worker!.postMessage({ type: "parse", id, channel, source, path, prev });
      });
      return this.latest.get(channel) === id ? res : null;
    }
    if (this.mainParse) {
      const t0 = performance.now();
      try { return { result: this.mainParse(source, path, prev), elapsedMs: performance.now() - t0 }; } catch { return null; }
    }
    return null;
  }

  dispose() { this.worker?.terminate(); for (const p of this.waiting.values()) p.resolve(null); this.waiting.clear(); }
}
