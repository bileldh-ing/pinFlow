/**
 * Loads web-tree-sitter (0.27.1) and the tree-sitter-cpp (0.23.4) grammar.
 *
 * Compatibility (verified in test/mapping.test.ts "init"): web-tree-sitter 0.27.1
 * accepts language ABI 13..15 (MIN_COMPATIBLE_VERSION..LANGUAGE_VERSION); the
 * shipped tree-sitter-cpp.wasm is ABI 14.
 *
 * Node: no options needed (wasm files are resolved from node_modules).
 * Browser / Web Worker: pass `wasmDir` (URL prefix that serves both
 * `web-tree-sitter.wasm` and `tree-sitter-cpp.wasm`) or `locateFile(name)`,
 * which is called with exactly those two file names.
 */
import { Language, Parser } from "web-tree-sitter";

export interface InitParserOptions {
  /** URL or filesystem directory containing web-tree-sitter.wasm and tree-sitter-cpp.wasm. */
  wasmDir?: string;
  /** Called with "web-tree-sitter.wasm" or "tree-sitter-cpp.wasm"; return a URL/path. Wins over wasmDir. */
  locateFile?: (name: string) => string;
}

export const WEB_TREE_SITTER_WASM = "web-tree-sitter.wasm";
export const TREE_SITTER_CPP_WASM = "tree-sitter-cpp.wasm";

let parser: Parser | null = null;
let language: Language | null = null;
let initPromise: Promise<void> | null = null;

const isNode =
  typeof process !== "undefined" &&
  !!(process as { versions?: { node?: string } }).versions?.node &&
  typeof (globalThis as { window?: unknown }).window === "undefined" &&
  typeof (globalThis as { importScripts?: unknown }).importScripts === "undefined";

function joinDir(dir: string, name: string): string {
  return dir.endsWith("/") ? dir + name : `${dir}/${name}`;
}

async function nodeDefaultPath(name: string): Promise<string> {
  // Hidden from bundlers: only evaluated under Node.
  const modName = "node:module";
  const { createRequire } = (await import(/* webpackIgnore: true */ /* @vite-ignore */ modName)) as typeof import("node:module");
  const require = createRequire(import.meta.url);
  if (name === WEB_TREE_SITTER_WASM) return require.resolve("web-tree-sitter/web-tree-sitter.wasm");
  const pkgJson = require.resolve("tree-sitter-cpp/package.json");
  return pkgJson.replace(/package\.json$/, TREE_SITTER_CPP_WASM);
}

async function resolveWasm(name: string, opts: InitParserOptions): Promise<string | undefined> {
  if (opts.locateFile) return opts.locateFile(name);
  if (opts.wasmDir) return joinDir(opts.wasmDir, name);
  if (isNode) return nodeDefaultPath(name);
  return undefined;
}

/** Idempotent: concurrent/repeated calls share one initialisation (a failed init can be retried). */
export function initParser(opts: InitParserOptions = {}): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const runtimeWasm = await resolveWasm(WEB_TREE_SITTER_WASM, opts);
    await Parser.init(runtimeWasm ? { locateFile: () => runtimeWasm } : undefined);
    const cppWasm = await resolveWasm(TREE_SITTER_CPP_WASM, opts);
    if (!cppWasm) throw new Error("initParser: in a browser you must pass wasmDir or locateFile for tree-sitter-cpp.wasm");
    language = await Language.load(cppWasm);
    parser = new Parser();
    parser.setLanguage(language);
  })().catch((e) => {
    initPromise = null;
    throw e;
  });
  return initPromise;
}

export function isParserReady(): boolean {
  return parser !== null;
}

export function getParser(): Parser {
  if (!parser) throw new Error("cpp-parser not initialised: await initParser() first");
  return parser;
}

export function getLanguageInfo(): { abiVersion: number } | null {
  return language ? { abiVersion: language.abiVersion } : null;
}
