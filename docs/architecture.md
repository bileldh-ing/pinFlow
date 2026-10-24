# Architecture — core engine (parser, IR, generator, sync, board rules)

## Package map

```
packages/arduino-ir        IR types (contract) + generic helpers (walk, normalize, hash, diff)
packages/cpp-parser        C++ source -> IR (tree-sitter-cpp, Web Worker entry)   depends: arduino-ir, board-registry
packages/arduino-codegen   IR -> formatted C++ + source map                         depends: arduino-ir
packages/sync-engine       SyncCoordinator, unified history, debounce, fixed point  depends: arduino-ir
packages/board-registry    board profiles, pin validation, library packs, deps      depends: arduino-ir
```

Data flow: `source text ──parse(worker)──▶ IR ──adapter──▶ Blockly`, and
`Blockly ──adapter──▶ IR ──generate──▶ source text + source map`. The IR is the shared
structural state; Blockly and Monaco are views. `SyncCoordinator` decides which side wins and when.

---

## ADR-001: Parser = tree-sitter-cpp via web-tree-sitter

**Status:** accepted.
**Context:** must run in a browser Web Worker, give byte ranges and error nodes, tolerate partial
code, and handle real Arduino C++ (not a toy grammar).
**Decision:** `web-tree-sitter@0.27.1` + `tree-sitter-cpp@0.23.4` (wasm, ABI 14; runtime accepts
ABI 13–15 — verified by a test). The parser is synchronous after `initParser()`; the worker wrapper
(`cpp-parser/src/worker.ts`) keeps it off the main thread.
**Consequences:** tree-sitter resolves C++ ambiguities without symbol tables (casts vs arithmetic,
templates vs comparisons, `!i++` association). The mapper detects these and either re-associates
(`!i++`) or keeps the whole expression raw — it never presents a guessed structure. Unknown
attribute macros are masked (same-length spaces) for tree-sitter only and the containing item is
kept raw from the original text. Alternatives rejected: a hand-written recursive-descent subset
parser (would silently mis-parse code outside the subset), clang-in-wasm (size, startup).

## ADR-002: IR with explicit raw preservation

**Status:** accepted.
**Decision:** a small typed IR (`SketchFile → TopLevel → Stmt → Expr`) for the visual subset;
everything else becomes `RawTopLevel` / `RawStatement` / `RawExpr` holding the **exact original
text** plus a reason. Mapping is decided on CST node types/fields only (no regex structure).
Unsupported → raw at the *smallest safe boundary*: sub-expression → `RawExpr`; statement →
`RawStatement`; declaration → `RawTopLevel`. A post-mapping safety net turns any item whose comments
could not all be attached into raw, so comments are never dropped. Explicit parentheses are IR
nodes (`Paren`); comments are attached (`leadingComments`, `trailingComment`) or standalone
(`Comment`); blank lines are recorded (`blankLineBefore`).
**Consequences:** unsupported code survives byte-for-byte (tested per fixture and by property);
coverage is measurable (`CoverageReport`). IR additions are additive and logged in
`docs/ir-changes.md`.

## ADR-003: Deterministic generator with source map

**Decision:** canonical formatting (2-space indent, braces always, blank line around functions,
`file.eol`), minimal parentheses from a C++ precedence table, `Paren` nodes always emitted, raw
text verbatim, a source-map entry for **every** IR node (0-based line/col, `origin: native|raw`,
block ids from the adapter). Parsing never rewrites user text; generation happens only when the user
edits blocks. `generate∘parse` is a fixed point after one normalization pass.

## ADR-004: Stable ids by structural alignment

**Decision:** the parser assigns fresh ids, then `assignStableIds(next, prev)` aligns lists by
(1) common prefix/suffix of structural hashes, (2) exact hash anywhere (moves), (3) kind + name
(functions, variables, calls…), (4) kind between matched neighbours (edited statements), recursing
slot by slot. Hashes ignore ids, spans, layout and key order.
**Consequences:** code edits update existing blocks instead of recreating them; `diffSketch`
yields minimal workspace updates.

## ADR-005: Single sync coordinator, unified history

**Decision:** one framework-agnostic `SyncCoordinator` owns revisions, origin tags, debounced
parse requests, stale-result discard, last-good-IR retention and one undo history of `{source,
file}` snapshots. Loop prevention uses guards + content no-op checks + revision tags.
See `docs/synchronization.md`.

## ADR-006: Board rules and library packs as data

**Decision:** versioned `BoardProfile`s (ESP32 Dev Module, Uno, Nano) with per-pin capabilities
and flags (input-only, strapping, flash, serial, ADC1/ADC2, PWM) and a `LibraryPack` plugin model
(metadata, dependencies, classes/methods, patterns). The parser consults packs to decide which
method calls are native; `validatePins` produces advisory diagnostics with certainty, explanation
and recommended action; `detectDependencies` derives `arduino-cli lib install` names from includes.

## Browser integration (for the web app)

```ts
// worker (or main thread fallback)
import { initParser, parseSketch } from "@pinflow/cpp-parser";
await initParser({ wasmDir: "/wasm" }); // serves web-tree-sitter.wasm + tree-sitter-cpp.wasm
```
Copy `node_modules/web-tree-sitter/web-tree-sitter.wasm` and
`node_modules/tree-sitter-cpp/tree-sitter-cpp.wasm` to a static path. Ready-made worker:
`@pinflow/cpp-parser/worker` with messages
`{type:"init", wasmDir | webTreeSitterWasmUrl + treeSitterCppWasmUrl}` → `{type:"ready"}` /
`{type:"init_error"}`, and `{type:"parse", revision, source, path?, prev?, extraKnownFunctions?}` →
`{type:"result", revision, result, elapsedMs}` / `{type:"error", revision, message}`; queued parses
are coalesced to the newest.

## Examples — compile evidence

`examples/blink-uno`, `examples/button-led`, `examples/dht11-esp32`, `examples/dht11-esp32-nonblocking`
compile with arduino-cli 1.5.1 for `arduino:avr:uno` (DHT sensor library 1.4.7 + Adafruit Unified
Sensor 1.1.15), checked 2026-10-22 with the repo's `.arduino-cache` toolchain. The two DHT examples
target `esp32:esp32:esp32`; the ESP32 compile was **not** verified here (the sandbox compile of an
ESP32 sketch was OOM-killed on this 2-vCPU host), so the AVR build is only a syntax/library check for
them. Each example folder name matches its `.ino` (arduino-cli requirement), and each example is a
golden fixture that round-trips byte-for-byte (`generate(parse(src)) === src`).
