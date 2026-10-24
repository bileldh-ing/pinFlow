import { initParser } from "./init";
import { parseSketch } from "./index";
import { initOptionsFromRequest, type WorkerRequest, type WorkerResponse } from "./protocol";

/**
 * Transport-independent worker logic (unit-tested in Node). Returns a message
 * handler; `post` sends responses. Parse requests that arrive while one is
 * running are coalesced: only the newest pending request is parsed.
 */
export function createParseHandler(post: (msg: WorkerResponse) => void, now: () => number = () => Date.now()) {
  let ready: Promise<void> | null = null;
  let pending: Extract<WorkerRequest, { type: "parse" }> | null = null;
  let running = false;

  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (pending) {
        if (!ready) ready = initParser();
        try {
          await ready;
        } catch (e) {
          const req = pending;
          pending = null;
          post({ type: "error", revision: req.revision, message: e instanceof Error ? e.message : String(e) });
          continue;
        }
        const req = pending;
        pending = null;
        try {
          const t0 = now();
          const result = parseSketch(req.source, req.path, req.prev, { extraKnownFunctions: req.extraKnownFunctions });
          post({ type: "result", revision: req.revision, result, elapsedMs: now() - t0 });
        } catch (e) {
          post({ type: "error", revision: req.revision, message: e instanceof Error ? e.message : String(e) });
        }
        // Yield so newer messages can replace `pending` before the next parse.
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      running = false;
    }
  };

  return async (req: WorkerRequest): Promise<void> => {
    if (req.type === "init") {
      ready = initParser(initOptionsFromRequest(req));
      try {
        await ready;
        post({ type: "ready" });
      } catch (e) {
        ready = null;
        post({ type: "init_error", message: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    if (req.type === "parse") {
      pending = req;
      await drain();
    }
  };
}
