/**
 * WorkbenchEngine — glues Blockly, Monaco, the parser worker, the code
 * generator and the @pinflow/sync-engine SyncCoordinator together.
 *
 *  Monaco edit ──► coordinator.handleEditorChange ──(debounced 300 ms)──► parser worker
 *       ▲                                                                     │ revision-tagged
 *       │ applyToEditor (minimal edit, origin=generator)                       ▼
 *  coordinator ◄── handleWorkspaceChange ◄── workspaceToIr ◄── Blockly change (UI events ignored)
 *       │
 *       └─► applyToWorkspace (field patch or layout-preserving reload, events disabled)
 *
 * Undo/redo is the coordinator's unified history (both editors restore together).
 */
import type * as Monaco from "monaco-editor";
import type { CoverageReport, GenerateResult, ParseDiagnostic, ParseResult, SketchFile, SyncState } from "@pinflow/arduino-ir";
import { generate } from "@pinflow/arduino-codegen";
import { SyncCoordinator } from "@pinflow/sync-engine";
import { validateSketch, type Diagnostic } from "@pinflow/board-registry";
import {
  BLOCK_CATEGORY, TOOLBOX_ENTRIES, categoryLabel, localizeEntry, irToWorkspaceState, isRawBlockType, rootPositions, structuralKey, workspaceToIrDetailed,
  type AdapterWarning, type BlockState, type ToolboxEntry, type WorkspaceState,
} from "@pinflow/block-definitions";
import { Blockly, getBlockExtra, setBlockText } from "@pinflow/block-definitions/blockly";
import { ParserClient, type ParserMode } from "@/lib/parser-client";
import { minimalEdit } from "@/lib/sync/text-edit";
import { nodeAt, rangesFromParse, rangesFromSourceMap, type Range0, type RangeIndex } from "@/lib/sync/source-ranges";
import { createT, type TFunction } from "@/i18n/translate";

export interface CompileDiag { file: string; line: number; column: number; severity: string; message: string; }

export interface SelectedInfo {
  id: string;
  type: string;
  category: string;
  name: string;
  raw: boolean;
  text?: string;
  reason?: string;
  range?: Range0;
  diagnostics: Diagnostic[];
}

export interface EngineView {
  ready: boolean;
  parserMode: ParserMode;
  parserError?: string;
  sync: SyncState | null;
  parseDiagnostics: ParseDiagnostic[];
  coverage: CoverageReport | null;
  boardDiagnostics: Diagnostic[];
  orphanBlockIds: string[];
  adapterWarnings: AdapterWarning[];
  selected: SelectedInfo | null;
  cursor: { line: number; column: number };
  canUndo: boolean;
  canRedo: boolean;
  lastParseMs: number | null;
}

export interface EngineOptions {
  path: string;
  fqbn: string;
  initialSource: string;
  savedWorkspace?: unknown;
  onView: (v: EngineView) => void;
  /** Called after every committed content change (autosave + draft outbox). */
  onContentChange?: () => void;
  /** Raw (preserved) blocks were deleted; the UI must confirm or undo. */
  onRawDeleted?: (count: number) => void;
}

function containsRaw(json: unknown): number {
  let n = 0;
  const walk = (b: unknown) => {
    if (!b || typeof b !== "object") return;
    const s = b as BlockState;
    if (typeof s.type === "string" && isRawBlockType(s.type)) n++;
    for (const inp of Object.values(s.inputs ?? {})) walk(inp.block);
    walk(s.next?.block);
  };
  walk(json);
  return n;
}

function shapeKey(state: WorkspaceState): string {
  const strip = (b: BlockState): unknown => ({
    t: b.type, i: b.id, e: b.extraState ?? null, d: b.disabledReasons ?? null,
    in: Object.fromEntries(Object.entries(b.inputs ?? {}).map(([k, v]) => [k, v.block ? strip(v.block) : null])),
    n: b.next?.block ? strip(b.next.block) : null,
  });
  return JSON.stringify((state.blocks?.blocks ?? []).map(strip));
}

function eachBlock(state: WorkspaceState, fn: (b: BlockState) => void) {
  const walk = (b?: BlockState) => {
    if (!b) return;
    fn(b);
    for (const inp of Object.values(b.inputs ?? {})) walk(inp.block);
    walk(b.next?.block);
  };
  for (const b of state.blocks?.blocks ?? []) walk(b);
}

let engineSeq = 0;

export class WorkbenchEngine {
  readonly uid = ++engineSeq;
  /** UI translator for user-facing engine messages; the workbench keeps it in sync with the active locale. */
  t: TFunction = createT("en");
  private ws?: Blockly.WorkspaceSvg;
  private editor?: Monaco.editor.IStandaloneCodeEditor;
  private monaco?: typeof Monaco;
  private coord?: SyncCoordinator;
  private parser: ParserClient;
  private lastGen?: GenerateResult;
  private ranges: RangeIndex = new Map();
  private fqbn: string;
  private disposed = false;
  private loadingBlocks = false;
  private syncTimer?: ReturnType<typeof setTimeout>;
  private pendingRawDeletes = 0;
  private selectionFromCode: { id: string; at: number } | null = null;
  private highlight?: Monaco.editor.IEditorDecorationsCollection;
  private rawDecos?: Monaco.editor.IEditorDecorationsCollection;
  private disposers: Array<() => void> = [];
  private compileDiags: CompileDiag[] = [];
  private view: EngineView = {
    ready: false, parserMode: "starting", sync: null, parseDiagnostics: [], coverage: null, boardDiagnostics: [], orphanBlockIds: [],
    adapterWarnings: [], selected: null, cursor: { line: 1, column: 1 }, canUndo: false, canRedo: false, lastParseMs: null,
  };

  constructor(private opts: EngineOptions) {
    this.fqbn = opts.fqbn;
    this.parser = new ParserClient("/wasm", (m) => this.patch({ parserMode: m, parserError: this.parser?.error }));
  }

  /* ----------------------------------------------------------------- wiring */

  private blocklyDisposers: Array<() => void> = [];
  private monacoDisposers: Array<() => void> = [];
  private keptPositions?: Record<string, { x: number; y: number }>;
  /** Full workspace state captured on detach (includes disconnected stacks), restored verbatim on re-attach. */
  private keptState?: WorkspaceState;
  private keptScale?: number;

  attachBlockly(ws: Blockly.WorkspaceSvg) {
    this.ws = ws;
    if (this.coord) { // re-attach after a pane remount (e.g. language switch): restore blocks + layout
      const kept = this.keptState;
      this.keptState = undefined;
      if (kept && this.restoreKeptState(ws, kept)) { this.applyBlockWarnings(); }
      else this.loadIntoBlockly(this.coord.file, this.keptPositions, !this.keptPositions);
      this.wireBlockly();
    } else void this.maybeInit();
  }

  /**
   * Re-create the exact previous workspace (same block IDs, fields, extra
   * state, disconnected stacks) in a fresh — possibly translated / RTL —
   * workspace. Only display text differs, so the IR and the code are
   * untouched; no change events reach the sync pipeline.
   */
  private restoreKeptState(ws: Blockly.WorkspaceSvg, state: WorkspaceState): boolean {
    this.loadingBlocks = true;
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(state as never, ws, { recordUndo: false });
      if (this.keptScale) ws.setScale(this.keptScale);
      const content = ws.getMetricsManager().getContentMetrics();
      const view = ws.getMetricsManager().getViewMetrics();
      // Pin the content to the reading-start corner (top-left in LTR, top-right in RTL).
      if (ws.RTL) ws.scroll(view.width - 20 - (content.left + content.width), 20 - content.top);
      else ws.scroll(20 - content.left, 20 - content.top);
      return true;
    } catch {
      return false;
    } finally {
      Blockly.Events.enable();
      this.loadingBlocks = false;
    }
  }
  /** Call before disposing a workspace so its layout survives a remount. */
  detachBlockly(ws: Blockly.WorkspaceSvg) {
    if (this.ws !== ws) return;
    try {
      const st = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
      this.keptPositions = rootPositions(st);
      this.keptState = this.coord ? st : undefined;
      this.keptScale = ws.scale;
    } catch { /* disposed */ }
    for (const d of this.blocklyDisposers) d();
    this.blocklyDisposers = [];
    this.ws = undefined;
  }
  attachMonaco(editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) {
    for (const d of this.monacoDisposers) d();
    this.monacoDisposers = [];
    this.editor = editor; this.monaco = monaco;
    this.highlight = undefined; this.rawDecos = undefined;
    if (this.coord) {
      const model = editor.getModel()!;
      if (model.getValue() !== this.coord.source) model.setValue(this.coord.source);
      this.wireMonaco();
      void this.backgroundParse();
    } else void this.maybeInit();
  }

  private patch(p: Partial<EngineView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...p, canUndo: this.coord?.canUndo() ?? false, canRedo: this.coord?.canRedo() ?? false, sync: this.coord ? { ...this.coord.state } : null };
    this.opts.onView(this.view);
  }

  private initStarted = false;
  private async maybeInit() {
    if (!this.ws || !this.editor || !this.monaco || this.initStarted) return;
    this.initStarted = true;
    const source = this.opts.initialSource;
    const model = this.editor.getModel()!;
    if (model.getValue() !== source) model.setValue(source);
    await this.parser.ready();
    if (this.disposed) return;
    const res = await this.parser.parse(source, this.opts.path, undefined, "edit");
    if (this.disposed) return;
    const empty: SketchFile = { path: this.opts.path, items: [], eol: source.includes("\r\n") ? "\r\n" : "\n" };
    const initialFile = res?.result.ok ? res.result.file : empty;

    this.coord = new SyncCoordinator({ source, file: initialFile }, {
      generate: (f) => { const g = generate(f); this.lastGen = g; return g; },
      requestParse: (rev, src, prev) => { void this.runParse(rev, src, prev); },
      applyToEditor: (code) => this.writeEditor(code),
      applyToWorkspace: (file) => this.loadIntoBlockly(file),
      onStateChange: () => this.patch({}),
      parseDebounceMs: 300,
    });

    const saved = this.opts.savedWorkspace as WorkspaceState | undefined;
    const positions = saved?.blocks ? rootPositions(saved) : undefined;
    this.loadIntoBlockly(initialFile, positions, !positions);
    if (res) {
      if (res.result.ok) this.afterGoodParse(res.result, source);
      else {
        this.coord.handleParseResult(0, res.result);
        this.setParseMarkers(res.result.diagnostics);
      }
    }
    this.wireEvents();
    this.patch({ ready: true, lastParseMs: res?.elapsedMs ?? null, parseDiagnostics: res && !res.result.ok ? res.result.diagnostics : [] });
  }

  private wireEvents() { this.wireBlockly(); this.wireMonaco(); }

  private wireBlockly() {
    const ws = this.ws!;
    const listener = (e: Blockly.Events.Abstract) => this.onBlocklyEvent(e);
    ws.addChangeListener(listener);
    this.blocklyDisposers.push(() => ws.removeChangeListener(listener));
  }

  private wireMonaco() {
    const editor = this.editor!;
    const d1 = editor.onDidChangeModelContent(() => {
      if (!this.coord || this.coord.isApplyingGenerated) return;
      if (this.coord.handleEditorChange(editor.getModel()!.getValue())) { this.opts.onContentChange?.(); this.patch({}); }
    });
    const d2 = editor.onDidChangeCursorPosition((e) => {
      this.patch({ cursor: { line: e.position.lineNumber, column: e.position.column } });
      if (e.source === "mouse" || e.source === "keyboard") this.selectBlockAtCursor(e.position.lineNumber - 1, e.position.column - 1);
    });
    this.monacoDisposers.push(() => d1.dispose(), () => d2.dispose());
    // Monaco's native undo would create a second, drifting history: route it to the unified one.
    const m = this.monaco!;
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyZ, () => this.undo());
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.KeyZ, () => this.redo());
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyY, () => this.redo());
  }

  /* ---------------------------------------------------------- code -> blocks */

  private async runParse(rev: number, src: string, prev: SketchFile) {
    const res = await this.parser.parse(src, this.opts.path, prev, "edit");
    if (!res || !this.coord || this.disposed) return;
    const out = this.coord.handleParseResult(rev, res.result);
    if (out.applied) {
      this.afterGoodParse(res.result, src);
      this.patch({ lastParseMs: res.elapsedMs, parseDiagnostics: [] });
    } else if (out.reason === "syntax_error") {
      this.setParseMarkers(res.result.diagnostics);
      this.patch({ lastParseMs: res.elapsedMs, parseDiagnostics: res.result.diagnostics });
    }
  }

  /** Update ranges, coverage, markers and board diagnostics from a successful parse of `src`. */
  private afterGoodParse(result: ParseResult, src: string) {
    if (!this.editor || this.editor.getModel()?.getValue() !== src) return;
    this.ranges = rangesFromParse(result.file);
    this.setParseMarkers([]);
    this.updateRawDecorations(result.coverage);
    this.refreshBoardDiagnostics();
    this.patch({ coverage: result.coverage });
  }

  /** Background parse of generated text: coverage + ranges only (never applied to blocks). */
  private async backgroundParse() {
    if (!this.editor || !this.coord) return;
    const src = this.editor.getModel()!.getValue();
    const res = await this.parser.parse(src, this.opts.path, this.coord.file, "background");
    if (res?.result.ok) this.afterGoodParse(res.result, src);
  }

  private initialViewFitted = false;
  /** First layout: scale so the widest stack fits the pane (0.5–0.78) and pin the content to the top-left. */
  private fitInitialView(ws: Blockly.WorkspaceSvg) {
    try {
      const view = ws.getMetricsManager().getViewMetrics();
      if (!view.width || ws.getTopBlocks(false).length === 0) return;
      const box = ws.getBlocksBoundingBox();
      const contentW = (box.right - box.left) || 1;
      const minScale = view.width < 360 ? 0.5 : 0.58;
      const target = Math.min(0.8, Math.max(minScale, (view.width - 40) / contentW));
      ws.setScale(target);
      const content = ws.getMetricsManager().getContentMetrics();
      ws.scroll(20 - content.left, 20 - content.top);
    } catch { /* not rendered yet */ }
  }

  private loadIntoBlockly(file: SketchFile, positionsOverride?: Record<string, { x: number; y: number }>, cleanUp = false) {
    const ws = this.ws;
    if (!ws) return;
    const current = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
    const next = irToWorkspaceState(file, { positions: positionsOverride ?? rootPositions(current) });
    if (structuralKey(next) === structuralKey(current)) return;
    this.loadingBlocks = true;
    Blockly.Events.disable();
    try {
      if (shapeKey(next) === shapeKey(current) && !cleanUp) {
        // Same blocks, only field values differ: patch in place (keeps selection, viewport, layout).
        eachBlock(next, (b) => {
          const blk = ws.getBlockById(b.id);
          for (const [name, value] of Object.entries(b.fields ?? {})) {
            const f = blk?.getField(name);
            if (f && String(f.getValue()) !== String(value)) f.setValue(value);
          }
        });
      } else {
        const sx = ws.scrollX, sy = ws.scrollY, scale = ws.scale;
        const selected = (Blockly.getSelected() as Blockly.BlockSvg | null)?.id;
        Blockly.serialization.workspaces.load(next as never, ws, { recordUndo: false });
        if (cleanUp) ws.cleanUp();
        else { ws.setScale(scale); ws.scroll(sx, sy); }
        if (!this.initialViewFitted) { this.initialViewFitted = true; this.fitInitialView(ws); }
        if (selected) (ws.getBlockById(selected) as Blockly.BlockSvg | null)?.select();
      }
    } finally {
      Blockly.Events.enable();
      this.loadingBlocks = false;
    }
    this.applyBlockWarnings();
  }

  /* ---------------------------------------------------------- blocks -> code */

  private onBlocklyEvent(e: Blockly.Events.Abstract) {
    if (!this.coord) return;
    if (e.isUiEvent) {
      if (e.type === Blockly.Events.SELECTED) this.onBlockSelected((e as Blockly.Events.Selected).newElementId ?? null);
      if (e.type === Blockly.Events.BLOCK_DRAG) {
        if ((e as Blockly.Events.BlockDrag).isStart) this.coord.beginBlockTransaction(); else this.coord.endBlockTransaction();
      }
      return;
    }
    if (this.loadingBlocks || this.coord.isApplyingParsed) return;
    if (e.type === Blockly.Events.FINISHED_LOADING) return;
    if (e.type === Blockly.Events.BLOCK_DELETE) this.pendingRawDeletes += containsRaw((e as Blockly.Events.BlockDelete).oldJson);
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.syncFromBlocks(), 90);
  }

  /** Flush pending block edits into code now. */
  syncFromBlocks() {
    clearTimeout(this.syncTimer);
    if (!this.ws || !this.coord) return;
    const res = workspaceToIrDetailed(this.ws as never, { path: this.opts.path, eol: this.coord.file.eol });
    const changed = this.coord.handleWorkspaceChange(res.file);
    if (changed) {
      if (this.lastGen) this.ranges = rangesFromSourceMap(this.lastGen);
      this.refreshBoardDiagnostics();
      this.opts.onContentChange?.();
      void this.backgroundParse();
    }
    this.patch({ orphanBlockIds: res.orphanBlockIds, adapterWarnings: res.warnings, parseDiagnostics: changed ? [] : this.view.parseDiagnostics });
    if (changed) this.setParseMarkers([]);
    if (this.pendingRawDeletes > 0) {
      const n = this.pendingRawDeletes;
      this.pendingRawDeletes = 0;
      if (changed) this.opts.onRawDeleted?.(n);
    }
  }

  private writeEditor(code: string) {
    const editor = this.editor, monaco = this.monaco;
    if (!editor || !monaco) return;
    const model = editor.getModel()!;
    const old = model.getValue();
    const e = minimalEdit(old, code);
    if (!e) return;
    const a = model.getPositionAt(e.start), b = model.getPositionAt(e.end);
    editor.pushUndoStop();
    editor.executeEdits("pinflow-blocks", [{ range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), text: e.text, forceMoveMarkers: true }]);
    editor.pushUndoStop();
  }

  /* --------------------------------------------------------------- selection */

  private onBlockSelected(id: string | null) {
    if (!id) { this.highlight?.clear(); this.patch({ selected: null }); return; }
    const fromCode = this.selectionFromCode && this.selectionFromCode.id === id && Date.now() - this.selectionFromCode.at < 600;
    const r = this.ranges.get(id);
    if (r && this.editor && this.monaco) {
      const range = new this.monaco.Range(r.startLine + 1, r.startCol + 1, r.endLine + 1, r.endCol + 1);
      const decos = [{ range, options: { className: "pf-code-highlight", isWholeLine: false, stickiness: 1 as const } }];
      if (this.highlight) this.highlight.set(decos); else this.highlight = this.editor.createDecorationsCollection(decos);
      if (!fromCode) this.editor.revealRangeInCenterIfOutsideViewport(range);
    }
    this.patch({ selected: this.selectedInfo(id) });
  }

  private selectedInfo(id: string): SelectedInfo | null {
    const blk = this.ws?.getBlockById(id);
    if (!blk) return null;
    const type = blk.type;
    const extra = getBlockExtra(blk);
    const found = TOOLBOX_ENTRIES.find((t) => t.type === type);
    const entry = found ? localizeEntry(found) : undefined;
    const cat = BLOCK_CATEGORY[type] ?? "advanced";
    return {
      id, type, category: categoryLabel(cat), name: entry?.name ?? type, raw: isRawBlockType(type),
      text: typeof extra.text === "string" ? extra.text : undefined, reason: typeof extra.reason === "string" ? extra.reason : undefined,
      range: this.ranges.get(id), diagnostics: this.view.boardDiagnostics.filter((d) => d.nodeId === id),
    };
  }

  private selectBlockAtCursor(line0: number, col0: number) {
    const ws = this.ws;
    if (!ws) return;
    const id = nodeAt(this.ranges, line0, col0, (nid) => !!ws.getBlockById(nid));
    if (!id || (Blockly.getSelected() as Blockly.BlockSvg | null)?.id === id) return;
    const blk = ws.getBlockById(id) as Blockly.BlockSvg | null;
    if (!blk) return;
    this.selectionFromCode = { id, at: Date.now() };
    blk.select();
    this.scrollBlockIntoView(blk);
  }

  private scrollBlockIntoView(blk: Blockly.BlockSvg) {
    const ws = this.ws as unknown as { scrollBoundsIntoView?: (b: unknown) => void; centerOnBlock: (id: string) => void };
    try { if (ws.scrollBoundsIntoView) ws.scrollBoundsIntoView(blk.getBoundingRectangle()); else ws.centerOnBlock(blk.id); } catch { /* not rendered yet */ }
  }

  /** Focus a block (diagnostic click / inspector). */
  focusBlock(id: string) {
    const blk = this.ws?.getBlockById(id) as Blockly.BlockSvg | null;
    if (!blk) return;
    blk.select();
    this.ws!.centerOnBlock(id);
  }

  /** Jump to a source line (1-based) and select the owning block if the source map knows one. */
  revealSource(line: number, column = 1) {
    const editor = this.editor;
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column });
    editor.focus();
    const ws = this.ws;
    const id = ws ? nodeAt(this.ranges, line - 1, Math.max(0, column - 1), (nid) => !!ws.getBlockById(nid)) : undefined;
    if (id) { this.selectionFromCode = { id, at: Date.now() }; this.focusBlock(id); }
  }

  /* ------------------------------------------------------------ diagnostics */

  private setParseMarkers(diags: ParseDiagnostic[]) {
    const model = this.editor?.getModel();
    if (!model || !this.monaco) return;
    this.monaco.editor.setModelMarkers(model, "pinflow-parser", diags.map((d) => ({
      severity: d.severity === "error" ? this.monaco!.MarkerSeverity.Error : d.severity === "warning" ? this.monaco!.MarkerSeverity.Warning : this.monaco!.MarkerSeverity.Info,
      message: `${d.message}\nBlocks keep showing the last valid parse until this is fixed.`,
      startLineNumber: d.span.startLine + 1, startColumn: d.span.startCol + 1, endLineNumber: d.span.endLine + 1, endColumn: Math.max(d.span.endCol + 1, d.span.startCol + 2),
    })));
  }

  setCompileDiagnostics(diags: CompileDiag[]) {
    this.compileDiags = diags;
    const model = this.editor?.getModel();
    if (!model || !this.monaco) return;
    const S = this.monaco.MarkerSeverity;
    this.monaco.editor.setModelMarkers(model, "pinflow-compile", diags.filter((d) => d.line > 0).map((d) => ({
      severity: d.severity === "error" ? S.Error : d.severity === "warning" ? S.Warning : S.Info,
      message: `[compiler] ${d.message}`, startLineNumber: d.line, startColumn: Math.max(1, d.column), endLineNumber: d.line, endColumn: model.getLineMaxColumn(Math.min(d.line, model.getLineCount())),
    })));
  }

  private refreshBoardDiagnostics() {
    if (!this.coord) return;
    let diags: Diagnostic[] = [];
    try { diags = validateSketch(this.coord.file, this.fqbn); } catch { diags = []; }
    const model = this.editor?.getModel();
    if (model && this.monaco) {
      const S = this.monaco.MarkerSeverity;
      this.monaco.editor.setModelMarkers(model, "pinflow-board", diags.filter((d) => d.span).map((d) => ({
        severity: d.severity === "error" ? S.Error : d.severity === "info" ? S.Info : S.Warning,
        message: `${d.message}\n${d.explanation}\n→ ${d.recommendedAction} (${d.certainty})`,
        startLineNumber: d.span!.startLine + 1, startColumn: d.span!.startCol + 1, endLineNumber: d.span!.endLine + 1, endColumn: d.span!.endCol + 1,
      })));
    }
    this.view = { ...this.view, boardDiagnostics: diags };
    this.applyBlockWarnings();
    this.patch({ boardDiagnostics: diags, selected: this.view.selected ? this.selectedInfo(this.view.selected.id) : null });
  }

  private applyBlockWarnings() {
    const ws = this.ws;
    if (!ws) return;
    const byNode = new Map<string, string[]>();
    for (const d of this.view.boardDiagnostics) if (d.nodeId && d.severity !== "info") byNode.set(d.nodeId, [...(byNode.get(d.nodeId) ?? []), d.message]);
    Blockly.Events.disable();
    try {
      for (const b of ws.getAllBlocks(false)) {
        const msg = byNode.get(b.id)?.join("\n") ?? null;
        (b as Blockly.BlockSvg).setWarningText(msg);
      }
    } catch { /* rendering not ready */ } finally { Blockly.Events.enable(); }
  }

  private updateRawDecorations(coverage: CoverageReport) {
    if (!this.editor || !this.monaco) return;
    const decos = coverage.entries.filter((e) => e.coverage === "raw_preserved" && e.span).map((e) => ({
      range: new this.monaco!.Range(e.span!.startLine + 1, 1, e.span!.endLine + 1, 1),
      options: { isWholeLine: true, className: "pf-code-raw", hoverMessage: { value: `**Preserved C++** (${e.construct}) — ${e.explanation}` } },
    }));
    if (this.rawDecos) this.rawDecos.set(decos); else this.rawDecos = this.editor.createDecorationsCollection(decos);
  }

  /* ---------------------------------------------------------------- actions */

  undo() { this.syncFromBlocks(); if (this.coord?.undo()) { this.afterRestore(); } }
  redo() { if (this.coord?.redo()) { this.afterRestore(); } }
  private afterRestore() { this.lastGen = undefined; this.opts.onContentChange?.(); this.refreshBoardDiagnostics(); void this.backgroundParse(); this.patch({ parseDiagnostics: [] }); this.setParseMarkers([]); }

  retryParse() { this.coord?.flushParse(); }

  setFqbn(fqbn: string) { this.fqbn = fqbn; this.refreshBoardDiagnostics(); }

  /** Insert a toolbox entry, connected to the selected block when that is valid. */
  insertEntry(entry: ToolboxEntry): { ok: boolean; message: string } {
    const ws = this.ws;
    const t = this.t;
    entry = localizeEntry(entry);
    if (!ws) return { ok: false, message: t("wb.insertNotReady") };
    const selected = Blockly.getSelected() as Blockly.BlockSvg | null;
    let blk: Blockly.BlockSvg;
    try { blk = Blockly.serialization.blocks.append(entry.preset as never, ws) as Blockly.BlockSvg; } catch (e) { return { ok: false, message: t("wb.insertFailed", { error: e instanceof Error ? e.message : String(e) }) }; }
    const m = ws.getMetricsManager().getViewMetrics(true);
    blk.moveBy(m.left + 40 - blk.getRelativeToSurfaceXY().x, m.top + 40 - blk.getRelativeToSurfaceXY().y);
    if (selected && !selected.isDeadOrDying()) {
      try {
        if (blk.previousConnection && selected.nextConnection && selected.nextConnection.getConnectionChecker().canConnect(selected.nextConnection, blk.previousConnection, false)) {
          selected.nextConnection.connect(blk.previousConnection);
          blk.select();
          return { ok: true, message: t("wb.insertAfter", { name: entry.name }) };
        }
        if (blk.outputConnection) {
          for (const input of selected.inputList) {
            const c = input.connection;
            if (c && c.type === Blockly.ConnectionType.INPUT_VALUE && (!c.targetBlock() || c.targetBlock()!.isShadow()) && c.getConnectionChecker().canConnect(c, blk.outputConnection, false)) {
              c.connect(blk.outputConnection);
              blk.select();
              return { ok: true, message: t("wb.insertPlugged", { name: entry.name, input: input.name }) };
            }
          }
        }
      } catch { /* fall through to free placement */ }
    }
    blk.select();
    if (entry.placement === "stmt") return { ok: true, message: t("wb.insertStmt", { name: entry.name }) };
    if (entry.placement === "value") return { ok: true, message: t("wb.insertValue", { name: entry.name }) };
    return { ok: true, message: t("wb.insertAdded", { name: entry.name }) };
  }

  /** Replace the verbatim text of a raw/comment block from the inspector. */
  setRawText(id: string, text: string) {
    const blk = this.ws?.getBlockById(id);
    if (blk) { setBlockText(blk, text); this.syncFromBlocks(); }
  }

  /** Load whole new content (conflict reload / draft recovery). */
  async loadSource(source: string, serverRevision: number) {
    if (!this.coord || !this.editor) return;
    const res = await this.parser.parse(source, this.opts.path, this.coord.file, "edit");
    if (res?.result.ok) {
      this.coord.applyRemote({ source, file: res.result.file, serverRevision });
      this.afterGoodParse(res.result, source);
    } else {
      this.editor.getModel()!.setValue(source); // parse error path keeps last good blocks
    }
    this.opts.onContentChange?.();
  }

  getSource(): string { return this.editor?.getModel()?.getValue() ?? this.opts.initialSource; }
  getIr(): SketchFile | undefined { return this.coord?.file; }
  getWorkspaceState(): WorkspaceState | undefined { return this.ws ? (Blockly.serialization.workspaces.save(this.ws) as WorkspaceState) : undefined; }
  getCoverageRatio(): number | null { return this.view.coverage?.ratio ?? null; }
  getCompileDiagnostics(): CompileDiag[] { return this.compileDiags; }
  getView(): EngineView { return this.view; }

  dispose() {
    this.disposed = true;
    clearTimeout(this.syncTimer);
    for (const d of [...this.disposers, ...this.blocklyDisposers, ...this.monacoDisposers]) d();
    this.coord?.dispose();
    this.parser.dispose();
  }
}
