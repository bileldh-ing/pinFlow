/**
 * SyncCoordinator — the single owner of "what is the current program" (spec 3.3-3.5).
 *
 * Inputs (call these from the UI):
 *   handleEditorChange(text)        Monaco content changed
 *   handleWorkspaceChange(file)     Blockly workspace -> IR changed (adapter output)
 *   handleParseResult(rev, result)  worker answered a parse request
 *   undo() / redo()                 route Ctrl+Z / Ctrl+Y here, NOT to Monaco/Blockly
 * Outputs (injected callbacks):
 *   requestParse(rev, source, prev) post to the parser worker (debounced)
 *   applyToEditor(text)             replace Monaco text (runs with origin "generator")
 *   applyToWorkspace(file, diff)    update Blockly minimally (runs with origin parser)
 *
 * Loop prevention is belt and braces: (1) re-entrancy guards while applying,
 * (2) no-op detection (same text / structurally identical IR) for late echoes,
 * (3) revision tags on async parse results (stale ones are discarded).
 */
import type { ChangeOrigin, CoverageReport, GenerateResult, ParseDiagnostic, ParseResult, SketchFile, SyncState } from "@pinflow/arduino-ir";
import { diffSketch, normalizeIr, type SketchDiff } from "@pinflow/arduino-ir";
import { debounce, realScheduler, type Debounced, type Scheduler } from "./debounce";
import { UnifiedHistory, type Snapshot } from "./history";

export interface SyncDeps {
  generate: (file: SketchFile) => GenerateResult;
  requestParse: (revision: number, source: string, prev: SketchFile) => void;
  applyToEditor?: (source: string) => void;
  applyToWorkspace?: (file: SketchFile, diff: SketchDiff) => void;
  onStateChange?: (state: SyncState) => void;
  /** Parse debounce in ms (spec suggests 250-500). Default 300. */
  parseDebounceMs?: number;
  scheduler?: Scheduler;
  now?: () => number;
  historyLimit?: number;
}

export type ParseOutcome =
  | { applied: true; diff: SketchDiff }
  | { applied: false; reason: "stale" | "syntax_error"; diagnostics?: ParseDiagnostic[] };

export type RemoteOutcome = "fast_forward" | "already_current" | "conflict";

function sameStructure(a: SketchFile, b: SketchFile): boolean {
  return JSON.stringify(normalizeIr(a, { keepLayout: true })) === JSON.stringify(normalizeIr(b, { keepLayout: true }));
}

export class SyncCoordinator {
  private st: SyncState;
  private src: string;
  private ir: SketchFile;
  private applyingGenerated = false;
  private applyingParsed = false;
  private readonly history: UnifiedHistory;
  private readonly parseLater: Debounced<[]>;
  private blockTxDepth = 0;
  private blockTxKey: string | null = null;
  private txSeq = 0;
  private lastDiagnostics: ParseDiagnostic[] = [];
  private serverRevision = 0;
  private savedSource: string;

  constructor(initial: { source: string; file: SketchFile; serverRevision?: number }, private readonly deps: SyncDeps) {
    this.src = initial.source;
    this.ir = initial.file;
    this.savedSource = initial.source;
    this.serverRevision = initial.serverRevision ?? 0;
    this.history = new UnifiedHistory({ source: initial.source, file: initial.file }, deps.historyLimit ?? 200);
    this.st = {
      revisionId: 0,
      origin: "import",
      parseStatus: "ok",
      blockRevision: 0,
      sourceRevision: 0,
      dirtyState: "clean",
      lastSuccessfulParseRevision: 0,
      lastSuccessfulGenerationRevision: 0,
    };
    this.parseLater = debounce(() => this.dispatchParse(), deps.parseDebounceMs ?? 300, deps.scheduler ?? realScheduler);
  }

  /* --------------------------------- getters -------------------------------- */

  get state(): Readonly<SyncState> {
    return this.st;
  }
  /** Current editor text (may be syntactically invalid). */
  get source(): string {
    return this.src;
  }
  /** Last known-good IR (never replaced by a failed parse). */
  get file(): SketchFile {
    return this.ir;
  }
  get diagnostics(): readonly ParseDiagnostic[] {
    return this.lastDiagnostics;
  }
  /** True while the coordinator itself is writing to the editor: ignore editor events then. */
  get isApplyingGenerated(): boolean {
    return this.applyingGenerated;
  }
  /** True while the coordinator itself is updating Blockly: ignore workspace events then. */
  get isApplyingParsed(): boolean {
    return this.applyingParsed;
  }
  canUndo(): boolean {
    return this.history.canUndo() || this.src !== this.history.current.source;
  }
  canRedo(): boolean {
    return this.history.canRedo();
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private emit(patch: Partial<SyncState>) {
    this.st = { ...this.st, ...patch };
    this.deps.onStateChange?.(this.st);
  }

  private markDirty(): Partial<SyncState> {
    return { dirtyState: this.src === this.savedSource ? (this.st.dirtyState === "conflict" ? "conflict" : "clean") : this.st.dirtyState === "conflict" ? "conflict" : "local_unsaved" };
  }

  /* ------------------------------ code -> blocks ----------------------------- */

  /** Monaco changed. Generated updates and no-op echoes are ignored (never treated as user edits). */
  handleEditorChange(source: string): boolean {
    if (this.applyingGenerated) return false;
    if (source === this.src) return false;
    this.src = source;
    this.emit({
      revisionId: this.st.revisionId + 1,
      sourceRevision: this.st.sourceRevision + 1,
      origin: "code",
      parseStatus: "pending",
      ...this.markDirty(),
    });
    this.parseLater();
    return true;
  }

  /** Send the pending parse immediately (e.g. "Retry parse" button, or before compile). */
  flushParse(): void {
    if (this.parseLater.pending) this.parseLater.flush();
    else if (this.st.parseStatus === "pending" || this.st.parseStatus === "error") this.dispatchParse();
  }

  private dispatchParse() {
    this.deps.requestParse(this.st.sourceRevision, this.src, this.ir);
  }

  /** Worker answered. Stale revisions are discarded; failures keep the last good IR. */
  handleParseResult(revision: number, result: ParseResult): ParseOutcome {
    if (revision !== this.st.sourceRevision) return { applied: false, reason: "stale" };
    if (!result.ok) {
      this.lastDiagnostics = result.diagnostics;
      this.emit({ parseStatus: "error" });
      return { applied: false, reason: "syntax_error", diagnostics: result.diagnostics };
    }
    this.lastDiagnostics = [];
    const diff = diffSketch(this.ir, result.file);
    const changed = !diff.unchanged || !sameStructure(this.ir, result.file);
    this.ir = result.file;
    this.emit({
      parseStatus: "ok",
      coverageReport: result.coverage as CoverageReport,
      lastSuccessfulParseRevision: revision,
      blockRevision: changed ? this.st.blockRevision + 1 : this.st.blockRevision,
    });
    if (changed && this.deps.applyToWorkspace) {
      this.applyingParsed = true;
      try {
        this.deps.applyToWorkspace(this.ir, diff);
      } finally {
        this.applyingParsed = false;
      }
    }
    this.history.push({ source: this.src, file: this.ir }, { now: this.now() });
    return { applied: true, diff };
  }

  /* ------------------------------ blocks -> code ----------------------------- */

  /** Group several workspace changes (a drag, a field edit burst) into one undo step. */
  beginBlockTransaction(): void {
    if (this.blockTxDepth++ === 0) this.blockTxKey = `tx${++this.txSeq}`;
  }
  endBlockTransaction(): void {
    if (this.blockTxDepth > 0 && --this.blockTxDepth === 0) this.blockTxKey = null;
  }

  /**
   * Blockly (via the adapter) produced a new IR. Parser-driven updates and structurally
   * identical echoes are ignored. Generates code and writes it to the editor with origin
   * "generator", so the editor's change event is not treated as a user edit.
   */
  handleWorkspaceChange(file: SketchFile, opts: { coalesceKey?: string } = {}): boolean {
    if (this.applyingParsed) return false;
    if (sameStructure(file, this.ir)) return false;
    this.ir = file;
    this.parseLater.cancel(); // text is about to be regenerated from blocks
    const gen = this.deps.generate(file);
    const rev = this.st.revisionId + 1;
    this.writeEditor(gen.code);
    this.lastDiagnostics = [];
    this.emit({
      revisionId: rev,
      origin: "blocks",
      blockRevision: this.st.blockRevision + 1,
      sourceRevision: this.st.sourceRevision + 1,
      parseStatus: "ok",
      lastSuccessfulGenerationRevision: rev,
      ...this.markDirty(),
    });
    this.history.push({ source: this.src, file: this.ir }, { key: opts.coalesceKey ?? this.blockTxKey ?? undefined, now: this.now() });
    return true;
  }

  private writeEditor(code: string) {
    this.src = code;
    if (!this.deps.applyToEditor) return;
    this.applyingGenerated = true;
    try {
      this.deps.applyToEditor(code);
    } finally {
      this.applyingGenerated = false;
    }
  }

  /* -------------------------------- undo / redo ------------------------------ */

  /**
   * Undo restores a logical snapshot to BOTH editor and workspace. If the editor holds
   * uncommitted text (e.g. a syntax error), the first undo returns to the last valid snapshot.
   */
  undo(): boolean {
    let snap: Snapshot | null;
    if (this.src !== this.history.current.source) snap = this.history.current;
    else snap = this.history.undo();
    if (!snap) return false;
    this.restore(snap, "undo");
    return true;
  }

  redo(): boolean {
    const snap = this.history.redo();
    if (!snap) return false;
    this.restore(snap, "redo");
    return true;
  }

  private restore(snap: Snapshot, origin: ChangeOrigin) {
    this.parseLater.cancel();
    const diff = diffSketch(this.ir, snap.file);
    this.ir = snap.file;
    this.writeEditor(snap.source);
    if (this.deps.applyToWorkspace) {
      this.applyingParsed = true;
      try {
        this.deps.applyToWorkspace(snap.file, diff);
      } finally {
        this.applyingParsed = false;
      }
    }
    this.lastDiagnostics = [];
    this.emit({
      revisionId: this.st.revisionId + 1,
      origin,
      sourceRevision: this.st.sourceRevision + 1,
      blockRevision: this.st.blockRevision + 1,
      parseStatus: "ok",
      ...this.markDirty(),
    });
  }

  /* ---------------------------- compile / persistence ------------------------ */

  /** Tag a compile job with the exact revision it compiles. */
  snapshotForCompile(): { revisionId: number; source: string } {
    return { revisionId: this.st.revisionId, source: this.src };
  }
  /** A compile/parse/whatever result for `revisionId` is outdated once anything changed. */
  isCurrentRevision(revisionId: number): boolean {
    return revisionId === this.st.revisionId;
  }

  markSaving(): void {
    if (this.st.dirtyState !== "conflict") this.emit({ dirtyState: "saving" });
  }
  /** Save acknowledged for `savedSource` at server revision `serverRevision`. */
  markSaved(serverRevision: number, savedSource: string = this.src): void {
    this.serverRevision = serverRevision;
    this.savedSource = savedSource;
    this.emit({ dirtyState: savedSource === this.src ? "saved" : "local_unsaved" });
  }
  markSaveFailed(): void {
    this.emit({ dirtyState: "save_failed" });
  }
  markOffline(): void {
    this.emit({ dirtyState: "offline" });
  }

  /**
   * Another client saved `serverRevision`. If we have unsaved local edits on an older base,
   * this is a conflict (UI offers compare / reload / duplicate); nothing is overwritten here.
   */
  handleRemoteRevision(serverRevision: number): RemoteOutcome {
    if (serverRevision <= this.serverRevision) return "already_current";
    const dirty = this.src !== this.savedSource;
    if (dirty) {
      this.emit({ dirtyState: "conflict" });
      return "conflict";
    }
    return "fast_forward";
  }

  /** Accept a remote snapshot (after fast_forward or an explicit "reload" resolution). */
  applyRemote(snapshot: { source: string; file: SketchFile; serverRevision: number }): void {
    this.serverRevision = snapshot.serverRevision;
    this.savedSource = snapshot.source;
    this.restore({ source: snapshot.source, file: snapshot.file }, "remote");
    this.history.push({ source: snapshot.source, file: snapshot.file }, { now: this.now() });
    this.emit({ dirtyState: "saved" });
  }

  dispose(): void {
    this.parseLater.cancel();
  }
}
