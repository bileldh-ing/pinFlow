/**
 * Web Worker entry. The web app creates it with
 *   new Worker(new URL("@pinflow/cpp-parser/worker", import.meta.url), { type: "module" })
 * posts {type:"init", wasmDir | webTreeSitterWasmUrl + treeSitterCppWasmUrl}, waits for
 * {type:"ready"}, then posts {type:"parse", revision, source, path, prev?}. Each parse is
 * answered with {type:"result", revision, result, elapsedMs}; parses queued behind a
 * running one are coalesced to the newest. The caller must still discard results whose
 * revision is older than its current source revision (SyncCoordinator does this).
 */
import { createParseHandler } from "./workerCore";

interface WorkerScope {
  postMessage(msg: unknown): void;
  addEventListener(type: "message", cb: (ev: { data: unknown }) => void): void;
}

const scope = globalThis as unknown as WorkerScope;
const handle = createParseHandler((msg) => scope.postMessage(msg));
scope.addEventListener("message", (ev) => {
  void handle(ev.data as never);
});
