# Core engine performance

Benchmark: `packages/cpp-parser/test/perf.test.ts` (runs with the normal test suite and prints a
`PERF` line). Input: a generated, fully supported sketch of **1,100 lines** (40 helper functions
with `for` / `if-else if-else` / `while` / `switch` / ternary / comments, plus DHT `setup`/`loop`;
coverage ratio 1.0). 3 warm-up iterations, then 15 measured iterations. Initial WASM load is
excluded (spec 7.3).

Machine: Hark sandbox, **arm64 (aarch64), 2 vCPU, Node 22.23**, measured 2026-10-22 while other
agents were running builds/tests on the same machine — numbers are noisy and pessimistic compared
with a modern laptop.

| Operation (1,100 lines) | median | p95 | spec target |
|---|---|---|---|
| `parseSketch(src)` (tree-sitter parse + CST→IR + coverage) | 28–55 ms | 50–91 ms | < 150 ms p95 ✅ |
| `generate(file)` (code + full source map) | 5–11 ms | 9–18 ms | < 100 ms p95 ✅ |
| `parseSketch(src, path, prev)` incl. stable-id alignment against the previous IR | 51–101 ms | 111–177 ms | (not a separate target) ⚠️ |

Five runs; ranges are min–max across runs. The perf test itself only fails above 1,500 ms parse
p95 / 500 ms generate p95 so that CI noise does not cause false failures.

## Notes

- Parsing runs in a Web Worker (`@pinflow/cpp-parser/worker`), so these costs do not block the main
  thread; generation runs on the main thread and stays well under the 50 ms freeze budget for this size.
- Stable-id alignment hashes every IR node of both snapshots; under load its p95 exceeded 150 ms once.
  If profiling in the browser shows the same, the cheap fix is to skip structural alignment for
  top-level items whose source text is unchanged (compare spans/text first). Not done yet.
- The sync coordinator debounces parses (default 300 ms) and drops stale worker results by revision,
  so typing never queues more than one parse.
- Re-measure on the target laptop/browser before changing any target; record numbers here.
