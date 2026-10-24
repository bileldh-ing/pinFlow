"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator, useGroupRef } from "react-resizable-panels";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Menu from "@radix-ui/react-dropdown-menu";
import JSZip from "jszip";
import {
  AlertTriangle, Blocks, Bug, CheckCircle2, ChevronDown, CircleDashed, CloudOff, Code2, Columns2, Download, FileCode2, Gauge, History, Library,
  Loader2, Maximize2, LayoutDashboard, PanelRightClose, PanelRightOpen, Redo2, RefreshCw, Search, Cpu, Undo2, Upload, Variable, Wrench, XCircle, Hammer,
} from "lucide-react";
import { LogoMark } from "../Logo";
import { ThemeToggle, useTheme } from "../ThemeToggle";
import { Button, Chip, Spinner, Stat } from "../ui";
import { Dialog } from "../Dialog";
import { WorkbenchEngine, type EngineView } from "./engine";
import { BlocklyPane, BlocklyZoomControls } from "./BlocklyPane";
import { motion, useReducedMotion } from "motion/react";
import { MonacoPane } from "./MonacoPane";
import { CoveragePanel, DiagnosticsPanel, LibrariesPanel, PanelTitle, PinsPanel, ToolboxSearch, VariablesPanel } from "./Panels";
import { usePersistence, type ProjectInfo } from "./usePersistence";
import { SAVE_LABEL, type SaveStatus } from "@/lib/save-state";
import { createProjectAction, updateProjectSettingsAction } from "@/app/actions/projects";

export type LayoutMode = "side-by-side" | "blocks-first" | "code-first" | "focus";
type RailTab = "files" | "blocks" | "variables" | "libraries" | "pins" | "diagnostics" | "coverage";

export interface WorkbenchProps {
  mode: "project" | "demo";
  project?: ProjectInfo & { dependencies: Array<{ name: string; version?: string | null }> };
  demoSource?: string;
  demoTitle?: string;
  boards: Array<{ fqbn: string; name: string }>;
  savedWorkspace?: unknown;
  defaultLayout?: LayoutMode;
  fontSize?: number;
  /** Embedded (landing page) chrome: no rail/inspector/status extras. */
  embedded?: boolean;
}

function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const f = () => setPhone(mq.matches);
    f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return phone;
}

function IconBtn({ label, onClick, disabled, children, active, testId }: { label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode; active?: boolean; testId?: string }) {
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>
        <button type="button" aria-label={label} onClick={onClick} disabled={disabled} aria-pressed={active} data-testid={testId}
          className={`pf-transition pf-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40 disabled:active:scale-100 ${active ? "bg-accent/15 text-accent ring-1 ring-accent/35" : "text-muted hover:bg-surface-hover hover:text-fg"}`}>{children}</button>
      </Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content sideOffset={8} className="glass-solid z-50 rounded-full px-3 py-1 text-[12px] font-medium text-fg">{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Rail button: a spring-y glowing orange circle slides to the active tool. */
function RailBtn({ label, active, onClick, children, testId, reduce }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode; testId?: string; reduce: boolean | null }) {
  return (
    <Tooltip.Root delayDuration={250}>
      <Tooltip.Trigger asChild>
        <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} data-testid={testId}
          className={`pf-press relative grid h-10 w-10 shrink-0 place-items-center rounded-full ${active ? "text-accent-ink" : "text-muted hover:bg-surface-hover hover:text-fg"}`}>
          {active && <motion.span layoutId="wb-rail-dot" aria-hidden className="pf-accent-fill pf-accent-glow absolute inset-0 rounded-full" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 560, damping: 34 }} />}
          <span className="relative">{children}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content side="right" sideOffset={10} className="glass-solid z-50 rounded-full px-3 py-1 text-[12px] font-medium text-fg">{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
}

function SaveChip({ status, error, demo }: { status: SaveStatus; error?: string; demo: boolean }) {
  if (demo) return <Chip tone="info" title="The demo is not saved anywhere">Demo<span className="max-sm:sr-only"> · not saved</span></Chip>;
  const tone = status === "saved" ? "ok" : status === "saving" ? "info" : status === "local_unsaved" ? "neutral" : status === "offline" ? "warn" : "danger";
  const icon = status === "saved" ? <CheckCircle2 size={12} /> : status === "saving" ? <Loader2 size={12} className="animate-spin" /> : status === "offline" ? <CloudOff size={12} /> : status === "local_unsaved" ? <CircleDashed size={12} /> : <AlertTriangle size={12} />;
  return <span data-testid="save-state" data-status={status} role="status" aria-live="polite"><Chip tone={tone} title={error ?? SAVE_LABEL[status]} className="max-sm:px-1.5">{icon}<span className="max-sm:sr-only">{SAVE_LABEL[status]}</span></Chip></span>;
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Workbench(props: WorkbenchProps) {
  const { mode, project, boards, embedded = false } = props;
  const demo = mode === "demo";
  const [theme] = useTheme();
  const phone = useIsPhone();
  const reduce = useReducedMotion();
  const mainPath = project?.mainPath ?? "demo.ino";
  const initialSource = useMemo(() => project?.files.find((f) => f.path === project.mainPath)?.content ?? props.demoSource ?? "", [project, props.demoSource]);
  const [fqbn, setFqbn] = useState(project?.boardFqbn ?? "esp32:esp32:esp32");
  const contentRef = useRef<() => void>(() => undefined);
  const [rawDeleted, setRawDeleted] = useState(0);
  const [view, setView] = useState<EngineView | null>(null);

  const [engine, setEngine] = useState<WorkbenchEngine | null>(null);
  useEffect(() => {
    // Created in an effect (not during render) so React StrictMode's mount/unmount/mount gets a fresh engine each time.
    const e = new WorkbenchEngine({
      path: mainPath, fqbn, initialSource, savedWorkspace: props.savedWorkspace,
      onView: (nv) => setView(nv), onContentChange: () => contentRef.current(), onRawDeleted: (n) => setRawDeleted(n),
    });
    setEngine(e);
    // Test/debug handle (no secrets): lets Playwright drive blocks without pixel-hunting SVG fields.
    void import("@pinflow/block-definitions/blockly").then((m) => { (window as unknown as { __pinflow?: unknown }).__pinflow = { engine: e, Blockly: m.Blockly }; });
    return () => { e.dispose(); setEngine((cur) => (cur === e ? null : cur)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistence = usePersistence(demo ? null : engine, demo ? null : (project ?? null));
  contentRef.current = persistence.onContentChange;

  const [layout, setLayoutState] = useState<LayoutMode>(props.defaultLayout ?? "side-by-side");
  const [focusPane, setFocusPane] = useState<"blocks" | "code">("blocks");
  const [phoneTab, setPhoneTab] = useState<"blocks" | "code" | "info">("blocks");
  const [railTab, setRailTab] = useState<RailTab>("blocks");
  const [railOpen, setRailOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(!embedded);
  const [toast, setToast] = useState<string | null>(null);
  const [rawEdit, setRawEdit] = useState<string>("");
  const [logOpen, setLogOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("pf-layout-mode") : null;
    if (!embedded && saved && ["side-by-side", "blocks-first", "code-first", "focus"].includes(saved)) setLayoutState(saved as LayoutMode);
    if (typeof window !== "undefined" && window.innerWidth < 1280) setInspectorOpen(false);
  }, [embedded]);
  const groupRef = useGroupRef();
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const setLayout = (m: LayoutMode) => {
    setLayoutState(m);
    try { localStorage.setItem("pf-layout-mode", m); } catch { /* ignore */ }
    if (m !== "focus") {
      let next: Record<string, number> = m === "blocks-first" ? { blocks: 68, code: 32 } : m === "code-first" ? { blocks: 32, code: 68 } : { blocks: 52, code: 48 };
      try { const s = localStorage.getItem(`pf-split-${m}`); if (s) next = JSON.parse(s); } catch { /* ignore */ }
      requestAnimationFrame(() => { try { groupRef.current?.setLayout(next); } catch { /* group not mounted yet */ } });
    }
  };

  const [nowTick, setNowTick] = useState(0);
  const compileStatus = persistence.compile.status;
  useEffect(() => {
    if (!["saving", "queued", "preparing", "compiling"].includes(compileStatus)) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [compileStatus]);
  useEffect(() => {
    if (compileStatus === "error" || compileStatus === "timeout") setLogOpen(true);
    if (compileStatus === "failed") { setRailTab("diagnostics"); setRailOpen(true); }
  }, [compileStatus]);
  const say = useCallback((m: string) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 4200); }, []);
  useEffect(() => { if (view?.selected?.raw) setRawEdit(view.selected.text ?? ""); }, [view?.selected?.id, view?.selected?.raw, view?.selected?.text]);

  // Report measured coverage once per open when it differs from what the dashboard shows.
  const coverageReported = useRef(false);
  const measured = view?.ready && view.sync?.parseStatus === "ok" ? view.coverage?.ratio : undefined;
  useEffect(() => {
    if (!project || measured == null || coverageReported.current) return;
    coverageReported.current = true;
    if (project.coverageRatio != null && Math.abs(project.coverageRatio - measured) < 0.001) return;
    void fetch(`/api/projects/${project.id}/coverage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coverageRatio: measured }) }).catch(() => undefined);
  }, [project, measured]);

  // Global keyboard shortcuts (outside Monaco/Blockly which handle their own).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void persistence.doSave(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [persistence]);

  if (!engine) return <div className={`grid place-items-center text-sm text-muted ${embedded ? "h-full bg-canvas" : "h-dvh"}`} data-testid="workbench-loading"><span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2"><Spinner />Preparing the workbench…</span></div>;

  const v = view;
  const engineNN: WorkbenchEngine = engine;
  const parseStatus = v?.sync?.parseStatus ?? "pending";
  const syntaxError = parseStatus === "error";
  const coverage = v?.coverage ? Math.round(v.coverage.ratio * 100) : null;
  const boardName = boards.find((b) => b.fqbn === fqbn)?.name ?? fqbn;
  const compile = persistence.compile;
  const compiling = ["saving", "queued", "preparing", "compiling", "running"].includes(compile.status);
  const title = project?.title ?? props.demoTitle ?? "Demo";
  const fileBase = title.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "sketch";

  const exportIno = () => download(`${fileBase}.ino`, new Blob([engine.getSource()], { type: "text/plain;charset=utf-8" }));
  const exportZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder(fileBase)!;
    const files = project ? persistence.filesNow() : [{ path: mainPath, content: engine.getSource() }];
    const firstIno = files.find((f) => f.path.endsWith(".ino"));
    for (const f of files) folder.file(f === firstIno ? `${fileBase}.ino` : f.path, f.content);
    folder.file("sketch.yaml", `# Generated by PinFlow Studio\ndefault_fqbn: ${fqbn}\n`);
    download(`${fileBase}.zip`, await zip.generateAsync({ type: "blob" }));
  };
  const changeBoard = async (next: string) => {
    setFqbn(next);
    engine.setFqbn(next);
    if (project) {
      const r = await updateProjectSettingsAction(project.id, { boardFqbn: next });
      say(r.error ? `Board not saved: ${r.error}` : `Board set to ${boards.find((b) => b.fqbn === next)?.name ?? next}. Pin warnings updated.`);
    }
  };
  const keepMineAsDuplicate = async () => {
    if (!project) return;
    const res = await createProjectAction({ source: "import", title: `${project.title} (my version)`, boardFqbn: fqbn, files: persistence.filesNow() });
    if (res.id) window.location.href = `/projects/${res.id}/editor`;
    else say(res.error ?? "Could not create the duplicate.");
  };

  const compileLabel = compile.status === "idle" ? "Not compiled" : compile.status === "succeeded" ? "Compiled" : compile.status === "failed" ? "Compile failed" : compile.status === "error" ? "Compile unavailable" : compile.status === "canceled" ? "Canceled" : compile.status === "timeout" ? "Timed out" : `Compile: ${compile.status}`;

  /* --------------------------------- panes --------------------------------- */
  const blocksPane = (
    <section className="relative h-full min-h-0 w-full" aria-label="Blocks">
      {syntaxError && (
        <div role="alert" data-testid="syntax-banner" className="absolute inset-x-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-warn/50 bg-[color-mix(in_srgb,var(--canvas)_86%,var(--warn))] px-3.5 py-2 text-[12.5px] font-medium text-warn shadow-[0_12px_30px_-10px_rgb(0_0_0/0.5)]">
          <AlertTriangle size={14} />
          <span className="min-w-0 flex-1">Code has syntax errors; blocks show the last valid parse.{v?.parseDiagnostics[0] ? <span className="text-muted"> — line {v.parseDiagnostics[0].span.startLine + 1}: {v.parseDiagnostics[0].message}</span> : null}</span>
          <Button size="sm" variant="warn" onClick={() => engine.retryParse()}><RefreshCw size={13} />Retry</Button>
        </div>
      )}
      {!syntaxError && (v?.orphanBlockIds.length ?? 0) > 0 && (
        <div className="absolute inset-x-3 top-3 z-10 rounded-2xl border border-line bg-surface-strong px-3.5 py-2 text-[12px] text-muted">
          {v!.orphanBlockIds.length} disconnected block stack(s) are not part of the code. Drag them into setup(), loop() or a function.
        </div>
      )}
      <BlocklyPane key={engine.uid} engine={engine} theme={theme} />
      <BlocklyZoomControls className={`absolute right-3 z-10 ${phone ? "bottom-3" : layout === "focus" ? "bottom-16" : "bottom-3"}`} />
    </section>
  );
  const codePane = (
    <section className="h-full min-h-0 w-full" aria-label="Code">
      <MonacoPane key={engine.uid} engine={engine} initialSource={initialSource} theme={theme} fontSize={props.fontSize ?? 13} />
    </section>
  );

  const sizes = layout === "blocks-first" ? [68, 32] : layout === "code-first" ? [32, 68] : [52, 48];
  const phoneTabs = [
    { id: "blocks" as const, label: "Blocks", icon: <Blocks size={15} /> },
    { id: "code" as const, label: "Code", icon: <Code2 size={15} /> },
    { id: "info" as const, label: "Inspect", icon: <Gauge size={15} /> },
  ];
  const mainArea = phone ? (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <div className={`absolute inset-0 ${phoneTab === "blocks" ? "" : "invisible"}`}>{blocksPane}</div>
        <div className={`absolute inset-0 ${phoneTab === "code" ? "" : "invisible"}`}>{codePane}</div>
        {phoneTab === "info" && <div className="absolute inset-0 overflow-y-auto bg-canvas p-4">{inspectorBody()}<div className="mt-6">{v && <DiagnosticsPanel view={v} compile={compile} engine={engine} outdated={persistence.outdated} />}</div><div className="mt-6">{v && <CoveragePanel view={v} engine={engine} />}</div></div>}
      </div>
    </div>
  ) : layout === "focus" ? (
    <div className="relative h-full min-h-0">
      <div className={`absolute inset-0 ${focusPane === "blocks" ? "" : "invisible"}`}>{blocksPane}</div>
      <div className={`absolute inset-0 ${focusPane === "code" ? "" : "invisible"}`}>{codePane}</div>
      <div className="glass-solid absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-full p-1">
        <Button size="sm" variant={focusPane === "blocks" ? "primary" : "ghost"} onClick={() => setFocusPane("blocks")}><Blocks size={14} />Blocks</Button>
        <Button size="sm" variant={focusPane === "code" ? "primary" : "ghost"} onClick={() => setFocusPane("code")}><Code2 size={14} />Code</Button>
      </div>
    </div>
  ) : (
    <Group groupRef={groupRef} orientation="horizontal" className="h-full" id="pf-split"
      defaultLayout={(() => { try { const s = localStorage.getItem(`pf-split-${layout}`); if (s) return JSON.parse(s); } catch { /* ignore */ } return { blocks: sizes[0]!, code: sizes[1]! }; })()}
      onLayoutChanged={(l) => { if (!embedded) { try { localStorage.setItem(`pf-split-${layoutRef.current}`, JSON.stringify(l)); } catch { /* ignore */ } } }}>
      <Panel id="blocks" minSize="22" className="h-full"><div className="h-full overflow-hidden rounded-[18px] border border-line bg-canvas">{blocksPane}</div></Panel>
      <Separator className="pf-handle" aria-label="Resize blocks and code panes" />
      <Panel id="code" minSize="22" className="h-full"><div className="h-full overflow-hidden rounded-[18px] border border-line bg-canvas">{codePane}</div></Panel>
    </Group>
  );

  function inspectorBody() {
    const engine = engineNN;
    const s = v?.selected;
    if (!s) return (
      <div className="space-y-4">
        <div>
          <PanelTitle>Sketch overview</PanelTitle>
          <div className="glass-inner space-y-4 p-4">
            <Stat icon={<Gauge size={16} />} label="Block coverage" value={coverage == null ? "—" : `${coverage}%`} tone="accent" />
            <Stat icon={<Cpu size={16} />} label="Board" value={boardName} />
            <Stat icon={parseStatus === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} label="Parser" value={parseStatus === "ok" ? `Parsed${v?.lastParseMs != null ? ` · ${Math.round(v.lastParseMs)} ms` : ""}` : parseStatus === "error" ? "Syntax error" : "Parsing…"} tone={parseStatus === "error" ? "neutral" : "mint"} />
          </div>
        </div>
        <div>
          <PanelTitle>Inspector</PanelTitle>
          <p className="text-[12.5px] leading-relaxed text-muted">Select a block to see its details, the code it generates and any pin warnings. Clicking in the code selects the matching block.</p>
        </div>
      </div>
    );
    return (
      <div className="space-y-4" data-testid="inspector">
        <div>
          <PanelTitle>Selected block</PanelTitle>
          <div className="text-[15px] font-bold">{s.name}</div>
          <div className="mt-1 flex flex-wrap gap-1.5"><Chip>{s.category}</Chip>{s.raw && <Chip tone="warn">preserved source</Chip>}</div>
          <div className="mt-2 font-mono text-[10.5px] text-faint break-all">id {s.id} · {s.type}</div>
        </div>
        <div>
          <PanelTitle>Source mapping</PanelTitle>
          {s.range ? (
            <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => engine.revealSource(s.range!.startLine + 1, s.range!.startCol + 1)}>
              Lines {s.range.startLine + 1}–{s.range.endLine + 1} {s.range.raw ? "(raw region)" : ""} →
            </button>
          ) : <p className="text-[12px] text-muted">No mapped range yet (disconnected or pending).</p>}
        </div>
        {s.raw && (
          <div>
            <PanelTitle>Preserved C++</PanelTitle>
            <p className="mb-2 text-[11.5px] text-muted">Not structurally visualized{s.reason ? ` (${s.reason})` : ""}. It is never interpreted and is kept byte-for-byte.</p>
            <textarea value={rawEdit} onChange={(e) => setRawEdit(e.target.value)} spellCheck={false} aria-label="Preserved C++ text" rows={8}
              className="w-full rounded-2xl border border-line bg-canvas p-2.5 font-mono text-[11.5px] text-fg focus:border-accent-strong focus:outline-none" />
            <div className="mt-1.5 flex justify-end"><Button size="sm" variant="primary" disabled={rawEdit === (s.text ?? "")} onClick={() => { engine.setRawText(s.id, rawEdit); say("Preserved code updated."); }}>Apply</Button></div>
          </div>
        )}
        <div>
          <PanelTitle>Pin & board warnings</PanelTitle>
          {s.diagnostics.length === 0 ? <p className="text-[12px] text-muted">None for this block on {boardName}.</p> : (
            <ul className="space-y-1.5">{s.diagnostics.map((d, i) => <li key={i} className="rounded-2xl border border-warn/35 bg-warn/5 p-2.5 text-[12px]"><div className="font-medium text-warn">{d.message}</div><div className="mt-0.5 text-muted">{d.explanation}</div><div className="mt-0.5 text-faint">→ {d.recommendedAction} · {d.certainty}</div></li>)}</ul>
          )}
        </div>
      </div>
    );
  }

  const railTabs: Array<{ id: RailTab; label: string; icon: React.ReactNode }> = [
    { id: "files", label: "Files", icon: <FileCode2 size={16} /> },
    { id: "blocks", label: "Find blocks", icon: <Search size={16} /> },
    { id: "variables", label: "Variables", icon: <Variable size={16} /> },
    { id: "libraries", label: "Libraries", icon: <Library size={16} /> },
    { id: "pins", label: "Pins", icon: <Cpu size={16} /> },
    { id: "diagnostics", label: "Diagnostics", icon: <Bug size={16} /> },
    { id: "coverage", label: "Coverage", icon: <Gauge size={16} /> },
  ];
  const diagCount = (v?.parseDiagnostics.length ?? 0) + compile.diagnostics.length + (v?.boardDiagnostics.filter((d) => d.severity !== "info").length ?? 0);

  return (
    <Tooltip.Provider>
      <div className={`flex min-h-0 flex-col ${embedded ? "h-full gap-0 bg-canvas" : "h-dvh gap-2 p-2"}`} data-testid="workbench" data-ready={v?.ready ? "1" : "0"} data-parse={parseStatus}>
        {/* ------------------------------ top bar ------------------------------ */}
        <header className={`flex shrink-0 items-center gap-1.5 sm:gap-2 ${embedded ? "h-12 border-b border-line bg-[var(--canvas-2)] px-2 sm:px-3" : "glass h-14 rounded-full px-2 sm:px-2.5"}`}>
          {!embedded && <Link href={demo ? "/" : "/dashboard"} aria-label={demo ? "Home" : "Back to projects"} className="pf-press shrink-0 rounded-full p-1"><LogoMark size={30} /></Link>}
          <div className="min-w-[64px] max-w-[30vw] flex-shrink truncate text-[14px] font-bold sm:max-w-[240px]" title={title} data-testid="project-title">{title}</div>
          <SaveChip status={persistence.save.status} error={persistence.save.lastError} demo={demo} />
          <div className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <IconBtn label="Undo (Ctrl+Z)" onClick={() => engine.undo()} disabled={!v?.canUndo} testId="undo"><Undo2 size={16} /></IconBtn>
          {!phone && <IconBtn label="Redo (Ctrl+Shift+Z)" onClick={() => engine.redo()} disabled={!v?.canRedo} testId="redo"><Redo2 size={16} /></IconBtn>}
          <div className="ml-auto flex items-center gap-1.5">
            <label className="sr-only" htmlFor="board-select">Target board</label>
            <select id="board-select" value={fqbn} onChange={(e) => void changeBoard(e.target.value)} data-testid="board-select"
              className="hidden h-9 max-w-[180px] rounded-full border border-line-strong bg-surface-inner px-3 text-[12.5px] font-medium text-fg md:block">
              {boards.map((b) => <option key={b.fqbn} value={b.fqbn}>{b.name}</option>)}
            </select>
            {!phone && <IconBtn label="Verify syntax (parse now)" onClick={() => { engine.retryParse(); say(syntaxError ? "Syntax errors found — see Diagnostics." : "Syntax check requested."); setRailTab("diagnostics"); setRailOpen(true); }} testId="verify"><Wrench size={16} /></IconBtn>}
            {!demo && (compiling ? (
              <Button size="sm" variant="secondary" onClick={() => void persistence.cancelCompile()} data-testid="compile-cancel"><Spinner />Cancel</Button>
            ) : (
              <Button size="sm" variant="primary" className="h-9 px-4" onClick={() => void persistence.startCompile()} data-testid="compile"><Hammer size={14} /><span className="hidden sm:inline">Compile</span></Button>
            ))}
            <Menu.Root>
              <Menu.Trigger asChild><Button size="sm" variant="secondary" className="h-9" aria-label="Export" data-testid="export-menu"><Download size={14} /><span className="hidden lg:inline">Export</span><ChevronDown size={12} /></Button></Menu.Trigger>
              <Menu.Portal>
                <Menu.Content align="end" sideOffset={6} className="glass-solid z-50 min-w-[210px] rounded-2xl p-1.5 text-[13px]">
                  <Menu.Item onSelect={exportIno} data-testid="export-ino" className="cursor-pointer rounded-xl px-3 py-2 outline-none data-[highlighted]:bg-surface-hover">Download .ino</Menu.Item>
                  <Menu.Item onSelect={() => void exportZip()} data-testid="export-zip" className="cursor-pointer rounded-xl px-3 py-2 outline-none data-[highlighted]:bg-surface-hover">Download sketch .zip</Menu.Item>
                  <Menu.Item onSelect={() => { void navigator.clipboard?.writeText(engine.getSource()); say("Code copied to clipboard."); }} className="cursor-pointer rounded-xl px-3 py-2 outline-none data-[highlighted]:bg-surface-hover">Copy code</Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
            <Tooltip.Root delayDuration={200}>
              <Tooltip.Trigger asChild>
                <span tabIndex={0} className="hidden rounded-full sm:inline-flex" aria-label="Upload requires PinFlow Bridge">
                  <Button size="sm" variant="ghost" disabled aria-disabled><Upload size={14} /><span className="hidden xl:inline">Upload</span></Button>
                </span>
              </Tooltip.Trigger>
              <Tooltip.Portal><Tooltip.Content sideOffset={6} className="glass-solid z-50 max-w-[260px] rounded-2xl px-3 py-2 text-[12px] text-fg">Upload requires the PinFlow Bridge, a local companion app that talks to your board over USB. It is not connected, so nothing will be uploaded.</Tooltip.Content></Tooltip.Portal>
            </Tooltip.Root>
            {!phone && !embedded && (
              <div className="hidden items-center gap-0.5 rounded-full border border-line bg-surface-inner p-0.5 lg:flex" role="group" aria-label="Layout">
                <IconBtn label="Side by side" onClick={() => setLayout("side-by-side")} active={layout === "side-by-side"}><Columns2 size={15} /></IconBtn>
                <IconBtn label="Blocks first" onClick={() => setLayout("blocks-first")} active={layout === "blocks-first"}><Blocks size={15} /></IconBtn>
                <IconBtn label="Code first" onClick={() => setLayout("code-first")} active={layout === "code-first"}><Code2 size={15} /></IconBtn>
                <IconBtn label="Focus mode" onClick={() => setLayout("focus")} active={layout === "focus"}><Maximize2 size={15} /></IconBtn>
              </div>
            )}
            {!embedded && <ThemeToggle />}
            {!embedded && !phone && <IconBtn label={inspectorOpen ? "Hide inspector" : "Show inspector"} onClick={() => setInspectorOpen(!inspectorOpen)}>{inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</IconBtn>}
          </div>
        </header>

        {/* --------------------------- body --------------------------- */}
        <div className={`flex min-h-0 flex-1 ${embedded ? "" : "gap-2"}`}>
          {!embedded && !phone && (
            <nav aria-label="Workbench tools" className="glass flex w-14 shrink-0 flex-col items-center gap-1.5 self-center rounded-full px-2 py-2.5">
              <RailBtn label="Workbench only (hide side panel)" active={!railOpen} onClick={() => setRailOpen(false)} testId="rail-none" reduce={reduce}><LayoutDashboard size={16} /></RailBtn>
              <div className="my-0.5 h-px w-6 bg-line" />
              {railTabs.map((t) => (
                <div key={t.id} className="relative">
                  <RailBtn label={t.label} active={railOpen && railTab === t.id} onClick={() => { if (railOpen && railTab === t.id) setRailOpen(false); else { setRailTab(t.id); setRailOpen(true); } }} testId={`rail-${t.id}`} reduce={reduce}>{t.icon}</RailBtn>
                  {t.id === "diagnostics" && diagCount > 0 && <span className="pointer-events-none absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-warn px-1 text-[9.5px] font-bold text-warn-ink ring-2 ring-[var(--bg-2)]">{diagCount}</span>}
                </div>
              ))}
              {project && <><div className="my-0.5 h-px w-6 bg-line" /><Link href={`/projects/${project.id}/history`} aria-label="History" title="Revision history" className="pf-press inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-fg"><History size={16} /></Link></>}
            </nav>
          )}
          {!embedded && !phone && railOpen && (
            <motion.aside key={railTab} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="glass w-64 shrink-0 overflow-y-auto rounded-[var(--radius)] p-4" aria-label={railTabs.find((t) => t.id === railTab)?.label}>
              {railTab === "files" && (
                <div>
                  <PanelTitle>Sketch files</PanelTitle>
                  <ul className="space-y-1 text-[12.5px]">
                    {(project?.files ?? [{ path: mainPath, content: "" }]).map((f) => (
                      <li key={f.path} className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 ${f.path === mainPath ? "bg-surface-hover text-fg" : "text-muted"}`}><FileCode2 size={13} /><span className="truncate font-mono">{f.path}</span>{f.path !== mainPath && <span className="ml-auto text-[10px] text-faint">kept as-is</span>}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11px] text-faint">The main .ino is edited here. Other sketch files are preserved unchanged and included in save, export and compile (multi-file editing is a planned slice).</p>
                  {project && <Link href={`/projects/${project.id}/settings`} className="mt-3 inline-block text-[12px] text-accent hover:underline">Project settings →</Link>}
                </div>
              )}
              {railTab === "blocks" && <ToolboxSearch engine={engine} onMessage={say} />}
              {railTab === "variables" && <VariablesPanel file={engine.getIr()} engine={engine} />}
              {railTab === "libraries" && <LibrariesPanel file={engine.getIr()} fqbn={fqbn} deps={project?.dependencies ?? []} settingsHref={project ? `/projects/${project.id}/settings` : undefined} />}
              {railTab === "pins" && <PinsPanel fqbn={fqbn} />}
              {railTab === "diagnostics" && v && <DiagnosticsPanel view={v} compile={compile} engine={engine} outdated={persistence.outdated} />}
              {railTab === "coverage" && v && <CoveragePanel view={v} engine={engine} />}
            </motion.aside>
          )}
          <main id="main" className={`min-h-0 min-w-0 flex-1 ${embedded ? "" : "glass-noblur rounded-[var(--radius)] p-1.5"}`}>
            {layout === "focus" || phone ? <div className="h-full overflow-hidden rounded-[18px] border border-line bg-canvas">{mainArea}</div> : mainArea}
          </main>
          {!embedded && !phone && inspectorOpen && <aside className="glass w-72 shrink-0 overflow-y-auto rounded-[var(--radius)] p-4" aria-label="Inspector">{inspectorBody()}</aside>}
        </div>

        {phone && (
          <nav role="tablist" aria-label="Workbench view" className={`flex shrink-0 gap-1 p-1 ${embedded ? "mx-2 mb-2 rounded-full border border-line bg-surface-strong" : "glass rounded-full"}`}>
            {phoneTabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={phoneTab === t.id} type="button" onClick={() => setPhoneTab(t.id)} data-testid={`phone-tab-${t.id}`}
                className={`pf-press relative flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold ${phoneTab === t.id ? "text-accent-ink" : "text-muted"}`}>
                {phoneTab === t.id && <motion.span layoutId={`wb-phone-tab-${engine.uid}`} aria-hidden className="pf-accent-fill pf-accent-glow absolute inset-0 rounded-full" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 36 }} />}
                <span className="relative inline-flex items-center gap-1.5">{t.icon}{t.label}</span>
              </button>
            ))}
          </nav>
        )}

        {/* ----------------------------- status bar ----------------------------- */}
        <footer className={`flex shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap text-[11.5px] font-medium text-muted ${embedded ? "h-8 border-t border-line bg-[var(--canvas-2)] px-3" : "glass h-9 rounded-full px-4"}`} data-testid="status-bar">
          <span className="inline-flex items-center gap-1.5" data-testid="parse-status">
            <span aria-hidden className={`h-2 w-2 rounded-full ${parseStatus === "ok" ? "bg-ok" : parseStatus === "error" ? "bg-danger" : "bg-warn"}`} />
            {!v?.ready ? (v?.parserMode === "failed" ? "Parser failed to load" : "Loading parser…") : parseStatus === "ok" ? "Parsed" : parseStatus === "error" ? "Syntax error" : "Parsing…"}
            {v?.lastParseMs != null && parseStatus === "ok" ? ` · ${Math.round(v.lastParseMs)} ms` : ""}
            {v?.parserMode === "main-thread" ? " · main thread" : ""}
          </span>
          <span data-testid="coverage-status">Coverage {coverage == null ? "—" : `${coverage}%`}</span>
          <span className="inline-flex items-center gap-1"><Cpu size={11} />{boardName} <span className="font-mono text-faint">{fqbn}</span></span>
          {!demo && (
            <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setLogOpen(true)} data-testid="compile-status">
              {compile.status === "succeeded" ? <CheckCircle2 size={11} className="text-ok" /> : compile.status === "failed" || compile.status === "error" ? <XCircle size={11} className="text-danger" /> : compiling ? <Loader2 size={11} className="animate-spin" /> : null}
              {compileLabel}{compile.revision ? ` · rev ${compile.revision}` : ""}{compiling && compile.startedAt ? ` · ${Math.max(0, Math.round(((nowTick || Date.now()) - compile.startedAt) / 1000))}s` : ""}{persistence.outdated && !compiling ? <span className="ml-1 rounded-full bg-warn/20 px-1.5 text-warn" data-testid="compile-outdated">outdated</span> : null}
            </button>
          )}
          <span className="ml-auto">Ln {v?.cursor.line ?? 1}, Col {v?.cursor.column ?? 1}</span>
          <span className="hidden sm:inline">{demo ? "Device: n/a" : "Device: not connected"}</span>
        </footer>

        {toast && <div role="status" className="glass-solid fixed bottom-14 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full px-5 py-2.5 text-[13px] font-medium" data-testid="toast">{toast}</div>}

        <Dialog open={rawDeleted > 0} onOpenChange={(o) => { if (!o) setRawDeleted(0); }} title="Delete preserved C++?"
          description={`You deleted ${rawDeleted} “Advanced C++ (preserved)” block${rawDeleted > 1 ? "s" : ""}. Its exact source text is no longer in the code.`}
          footer={<><Button onClick={() => { engine.undo(); setRawDeleted(0); say("Restored the preserved code."); }} data-testid="raw-delete-cancel">Keep the code</Button><Button variant="danger" onClick={() => setRawDeleted(0)} data-testid="raw-delete-confirm">Delete it</Button></>} />

        <Dialog open={persistence.save.status === "conflict"} onOpenChange={() => undefined} title="This project changed elsewhere"
          description="Another tab or device saved a newer revision. Nothing has been overwritten. Choose how to continue."
          footer={<><Button onClick={() => void persistence.reloadFromServer()} data-testid="conflict-reload">Reload latest (discard mine)</Button><Button variant="primary" onClick={() => void keepMineAsDuplicate()} data-testid="conflict-duplicate">Keep mine as a duplicate</Button></>} />

        <Dialog open={persistence.recovery.kind !== "none"} onOpenChange={(o) => { if (!o) void persistence.discardRecovery(); }} title="Recover unsaved changes?"
          description={persistence.recovery.kind === "offer_restore"
            ? `This browser kept changes from ${new Date(persistence.recovery.draft.updatedAt).toLocaleString()} that never reached the server.`
            : "This browser kept changes made on an older revision. Restoring them here would overwrite newer work, so you can save them as a separate project."}
          footer={persistence.recovery.kind === "offer_restore"
            ? <><Button onClick={() => void persistence.discardRecovery()}>Discard</Button><Button variant="primary" onClick={() => void persistence.acceptRecovery()} data-testid="recover-accept">Restore changes</Button></>
            : <><Button onClick={() => void persistence.discardRecovery()}>Discard</Button><Button variant="primary" onClick={async () => { if (persistence.recovery.kind === "none" || !project) return; const res = await createProjectAction({ source: "import", title: `${project.title} (recovered)`, boardFqbn: fqbn, files: persistence.recovery.draft.files }); await persistence.discardRecovery(); if (res.id) window.location.href = `/projects/${res.id}/editor`; }}>Save as new project</Button></>} />

        <Dialog open={logOpen} onOpenChange={setLogOpen} wide title="Compile results"
          description={compiling ? `${compileLabel} — the real Arduino toolchain is running in an isolated worker. A first ESP32 build can take 10–20 minutes while the core cache warms up; AVR boards take seconds.` : compile.status === "idle" ? "Compile runs the real Arduino toolchain in an isolated worker." : `${compileLabel}${compile.revision ? ` for saved revision ${compile.revision}` : ""}${persistence.outdated ? " — the code changed since, so these results are outdated." : ""}`}>
          {compile.error && <div role="alert" className="mb-3 rounded-2xl border border-danger/40 bg-danger/10 p-3 text-[13px] text-danger">{compile.error}</div>}
          {compile.diagnostics.length > 0 && (
            <ul className="mb-3 space-y-1">
              {compile.diagnostics.map((d, i) => <li key={i}><button type="button" className="w-full rounded-xl px-2.5 py-1.5 text-left text-[12.5px] hover:bg-surface-hover" onClick={() => { if (!d.line) return; setLogOpen(false); engine.revealSource(d.line, d.column); }}><span className={d.severity === "error" ? "text-danger" : "text-warn"}>{d.severity}</span> {d.line ? `${d.file}:${d.line}:${d.column} — ` : "project — "}{d.message}</button></li>)}
            </ul>
          )}
          {compile.sizes != null && <pre className="mb-3 overflow-x-auto rounded-2xl bg-canvas p-3 font-mono text-[11px] text-muted">{JSON.stringify(compile.sizes, null, 2)}</pre>}
          {compile.toolchain != null && <pre className="mb-3 overflow-x-auto rounded-2xl bg-canvas p-3 font-mono text-[11px] text-muted">{JSON.stringify(compile.toolchain, null, 2)}</pre>}
          {compile.log ? <pre className="max-h-[320px] overflow-auto rounded-2xl bg-canvas p-3 font-mono text-[11px] text-muted">{compile.log}</pre> : <p className="text-[12.5px] text-muted">No log yet.</p>}
          {compile.log && <div className="mt-2 flex justify-end"><Button size="sm" onClick={() => download(`${fileBase}-build.log`, new Blob([compile.log ?? ""], { type: "text/plain" }))}>Download log</Button></div>}
        </Dialog>
      </div>
    </Tooltip.Provider>
  );
}
