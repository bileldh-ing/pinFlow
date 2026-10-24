# IR contract changes (packages/arduino-ir)

All changes are **additive**; no existing field was renamed or removed.

## v1.1 (2026-10-22, core-engine agent)

1. `Base.trailingComment?: string` — a comment on the same line after the node (e.g.
   `int x = 1; // note`, `#define DHTPIN 4 // GPIO4`), verbatim incl. `//` or `/* */`.
   Generator emits it after the node, separated by one space.
2. `Base.blankLineBefore?: boolean` — the source had ≥ 1 blank line before the node (or before its
   leading comments). Layout only: ignored by structural hashes, diffs and `normalizeIr` (unless
   `keepLayout: true`). Blockly may ignore it.
3. New helper module `src/utils.ts`, re-exported from the index:
   - `isIrNode`, `childSlots(node)` (child slots sorted by key name), `walkIr(fileOrNode, visit)`,
     `collectNodes(file)`;
   - `normalizeIr(value, { keepLayout?, keepComments? })` — deep copy without `id`/`span`
     (the "normalized IR" used in golden and round-trip tests);
   - `structuralHash(node)` / `shallowSignature(node)` — id/span/layout-insensitive, key-order-insensitive;
   - `diffSketch(prev, next)` → `{ added, removed, changed, moved, topLevelOrderChanged, unchanged }`
     keyed by node id (`changed` = own fields or child-id list changed).

## Conventions the parser relies on (no type change)

- `Unary { op: "-", operand: NumberLit "5" }` is how `-5` is represented (tree-sitter folds the sign
  into the literal; the parser splits it).
- `Param { type: "const char*", name: "s" }` / `Param { type: "String&", name: "out" }` for pointer /
  reference parameters.
- `Function.params = []` for both `f()` and `f(void)`.
- Raw node `reason` is a plain-language sentence; the machine-readable construct name is in the
  matching `CoverageEntry.construct`.
