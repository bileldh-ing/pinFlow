import type { ParseResult, SketchFile } from "@pinflow/arduino-ir";
import type { InitParserOptions } from "./init";

/** Messages the web app posts to the parser worker. */
export type WorkerRequest =
  | { type: "init"; wasmDir?: string; /** explicit URLs win over wasmDir */ webTreeSitterWasmUrl?: string; treeSitterCppWasmUrl?: string }
  | { type: "parse"; revision: number; source: string; path?: string; prev?: SketchFile; extraKnownFunctions?: string[] };

/** Messages the worker posts back. */
export type WorkerResponse =
  | { type: "ready" }
  | { type: "init_error"; message: string }
  | { type: "result"; revision: number; result: ParseResult; elapsedMs: number }
  | { type: "error"; revision: number; message: string };

export function initOptionsFromRequest(req: Extract<WorkerRequest, { type: "init" }>): InitParserOptions {
  if (req.webTreeSitterWasmUrl || req.treeSitterCppWasmUrl) {
    const dir = req.wasmDir ?? "";
    return {
      locateFile: (name) =>
        name === "web-tree-sitter.wasm" ? req.webTreeSitterWasmUrl ?? `${dir}/${name}` : req.treeSitterCppWasmUrl ?? `${dir}/${name}`,
    };
  }
  return { wasmDir: req.wasmDir };
}
