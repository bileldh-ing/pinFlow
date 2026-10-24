# Code ⇄ Blocks synchronization

Implementation: `packages/sync-engine` (`SyncCoordinator`, `UnifiedHistory`, `debounce`,
`checkFixedPoint`), structural diff in `packages/arduino-ir` (`diffSketch`), stable ids in
`packages/cpp-parser` (`assignStableIds`). Tests: `packages/sync-engine/test/sync.test.ts`
(unit, fake parser) and `packages/cpp-parser/test/sync-integration.test.ts` (real parser +
generator + coordinator, incl. a fast-check interleaving property).

## State (spec 3.5)

`SyncCoordinator.state: SyncState` (type from `@pinflow/arduino-ir`):

| Field | Meaning |
|---|---|
| `revisionId` | +1 on every logical change (code edit, block edit, undo, redo, remote). Compile jobs are tagged with it (`snapshotForCompile()`, `isCurrentRevision()`). |
| `sourceRevision` | +1 whenever the editor text changes (user, generator, undo). Parse requests carry it; results with another value are **discarded as stale**. |
| `blockRevision` | +1 whenever the IR shown in Blockly changes. |
| `origin` | `code` / `blocks` / `undo` / `redo` / `remote` / `import`. |
| `parseStatus` | `pending` (debounce running / worker busy), `ok`, `error` (last good IR kept). |
| `lastSuccessfulParseRevision`, `lastSuccessfulGenerationRevision` | as named. |
| `dirtyState` | `clean`, `local_unsaved`, `saving`, `saved`, `save_failed`, `offline`, `conflict`. |
| `coverageReport` | from the last successful parse. |

`coordinator.source` is the current editor text (may be invalid); `coordinator.file` is the last
known-good IR and is never replaced by a failed parse.

## Code → blocks

1. Monaco `onDidChangeModelContent` → `handleEditorChange(text)`.
   Ignored when `isApplyingGenerated` is true or when `text === coordinator.source` (late echo).
2. `sourceRevision++`, `parseStatus = "pending"`, debounced (default 300 ms) `requestParse(rev, text, lastGoodFile)`.
3. Worker parses with `prev = lastGoodFile` → stable ids for unchanged constructs.
4. `handleParseResult(rev, result)`:
   - `rev !== sourceRevision` → `{applied:false, reason:"stale"}`;
   - `!result.ok` → `parseStatus = "error"`, diagnostics exposed, **IR and blocks untouched**;
   - ok → `diff = diffSketch(old, new)`; `applyToWorkspace(file, diff)` runs with
     `isApplyingParsed = true`, so Blockly change events it causes are not user edits; one history
     snapshot `{source, file}` is pushed.
5. Parsing never rewrites the user's text.

## Blocks → code

1. Blockly change (ignore UI/viewport events in the adapter) → adapter builds IR →
   `handleWorkspaceChange(file, {coalesceKey?})`. Ignored while `isApplyingParsed` or when the IR
   is structurally identical to the current one (late echo, id-only changes).
2. Pending parse is cancelled; `generate(file)` → `applyToEditor(code)` with `isApplyingGenerated = true`
   (origin `generator`), so Monaco's change event is not treated as a user edit.
   Integrators should apply the text as a minimal edit (`executeEdits`) to keep cursor/selection.
3. A history snapshot is pushed; `beginBlockTransaction()/endBlockTransaction()` (or a `coalesceKey`)
   merge a drag/field-typing burst into one undo step.

## Diff for minimal workspace updates

`diffSketch(prev, next)` returns ids `added`, `removed`, `changed` (own fields or child-id list
changed), `moved` (parent or slot changed) and `topLevelOrderChanged`. Because the parser reuses
ids (prefix/suffix + exact-hash + name + positional matching, see `cpp-parser/src/ids.ts`), editing
`delay(1000)` → `delay(500)` yields exactly one changed node (the literal) and no added/removed
blocks; inserting a statement adds only its subtree; reordering statements/functions keeps ids.

## Undo / redo (one history)

`UnifiedHistory` stores logical snapshots `{source, file}`; there is no separate Monaco or Blockly
stack. Route Ctrl/Cmd+Z / Shift+Z to `coordinator.undo()/redo()` and disable the editors' own undo.
`undo()` restores text and blocks together (origin `undo`). If the editor holds uncommitted text (e.g.
a syntax error), the first undo returns to the last valid snapshot — the "clearly indicate invalid
pending text before rollback" row of spec 7.1.

## Loop prevention (three independent layers)

1. Re-entrancy guards: `isApplyingGenerated`, `isApplyingParsed`.
2. Content no-op detection: equal text / structurally equal IR are ignored (covers async echoes such
   as Blockly's batched events).
3. Revision tags on async results.

Tested: synchronous echoes on both sides, 20 consecutive block edits produce 20 editor writes and 0
workspace re-applies and leave no timers pending; a fast-check property interleaves random code
edits, block edits and undos with the real parser and asserts the system settles (no pending
timers) with editor text and IR in agreement.

## Fixed point

`checkFixedPoint(source, parse, generate)` reports whether `generate∘parse` stops changing the
text (`passes` = 0 when the source is already canonical, 1 after one normalization pass). Every
golden fixture and every property-generated program reaches the fixed point in ≤ 1 pass.

## Remote / conflicts

`markSaving/markSaved(serverRevision)/markSaveFailed/markOffline`. `handleRemoteRevision(rev)` →
`already_current` | `fast_forward` (no local edits) | `conflict` (local unsaved edits on an older
base; `dirtyState = "conflict"`, nothing overwritten). After the user picks "reload", call
`applyRemote(snapshot)`.

## Not covered here (owned by the web app)

Minimal Monaco edits, Blockly event filtering/batching, viewport preservation, compile-job UI,
persistence calls. The coordinator is framework-agnostic and never touches the DOM.
