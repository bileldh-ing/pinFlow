"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CircleAlert, Info, Search, ShieldAlert } from "lucide-react";
import { searchToolbox, categoryLabel, localizedEntries, CATEGORY_COLORS, type ToolboxEntry } from "@pinflow/block-definitions";
import { useI18n } from "@/i18n/client";
import { detectDependencies, getBoard } from "@pinflow/board-registry";
import type { SketchFile } from "@pinflow/arduino-ir";
import { Chip } from "../ui";
import type { EngineView, WorkbenchEngine } from "./engine";
import type { CompileState } from "./usePersistence";

export function PanelTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return <div className="mb-2 flex items-baseline justify-between gap-2"><h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">{children}</h2>{hint && <span className="text-[11px] text-faint">{hint}</span>}</div>;
}

export function ToolboxSearch({ engine, onMessage }: { engine: WorkbenchEngine; onMessage: (m: string) => void }) {
  const [q, setQ] = useState("");
  const { t, locale } = useI18n();
  // Searches the active language and English; names/categories are shown in the active language.
  const results = useMemo(() => (q.trim() ? searchToolbox(q, 24, locale) : localizedEntries(locale).filter((e) => ["pf_pin_mode", "pf_digital_write", "pf_delay", "pf_serial_println", "pf_if", "pf_for", "pf_var_decl", "pf_dht_read_temp", "pf_raw_stmt"].includes(e.key))), [q, locale]);
  const insert = (e: ToolboxEntry) => onMessage(engine.insertEntry(e).message);
  return (
    <div>
      <PanelTitle hint={t("pnl.findHint")}>{t("pnl.findBlock")}</PanelTitle>
      <div className="relative mb-2">
        <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pnl.searchPh")} aria-label={t("pnl.searchAria")} data-testid="toolbox-search"
          className="h-9 w-full rounded-full border border-line-strong bg-surface-inner ps-8 pe-2 text-[13px] text-fg placeholder:text-faint focus:border-accent-strong focus:outline-none"
          onKeyDown={(e) => { if (e.key === "Enter" && results[0]) insert(results[0]); }} />
      </div>
      {!q && <p className="mb-2 text-[11px] text-faint">{t("pnl.popular")}</p>}
      <ul className="space-y-1" aria-label={t("pnl.results")}>
        {results.map((e) => (
          <li key={e.key}>
            <button type="button" onClick={() => insert(e)} className="pf-transition flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start text-[13px] hover:bg-surface-hover" data-testid={`insert-${e.key}`}>
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: CATEGORY_COLORS[e.category] }} />
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              <span className="shrink-0 text-[10.5px] text-faint">{categoryLabel(e.category, locale)}</span>
            </button>
          </li>
        ))}
        {q && results.length === 0 && <li className="px-2 py-3 text-[12px] text-muted">{t("pnl.noMatch", { q })}</li>}
      </ul>
    </div>
  );
}

export function VariablesPanel({ file, engine }: { file?: SketchFile; engine: WorkbenchEngine }) {
  const { t } = useI18n();
  const vars = useMemo(() => {
    const out: Array<{ id: string; name: string; type: string; scope: string; isConst: boolean; array: boolean }> = [];
    const walk = (n: unknown, scope: string) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) { n.forEach((x) => walk(x, scope)); return; }
      const o = n as Record<string, unknown>;
      if (o.kind === "VarDecl") out.push({ id: String(o.id), name: String(o.name), type: String(o.type), scope, isConst: !!o.isConst, array: o.arraySize !== undefined });
      if (o.kind === "Define") out.push({ id: String(o.id), name: String(o.name), type: "#define", scope, isConst: true, array: false });
      const nextScope = o.kind === "Function" ? `${String(o.name)}()` : scope;
      for (const [k, v] of Object.entries(o)) if (k !== "span" && v && typeof v === "object") walk(v, nextScope);
    };
    file?.items.forEach((i) => walk(i, "global"));
    return out;
  }, [file]);
  return (
    <div>
      <PanelTitle hint={`${vars.length}`}>{t("pnl.vars")}</PanelTitle>
      {vars.length === 0 && <p className="text-[12px] text-muted">{t("pnl.noVars")}</p>}
      <ul className="space-y-0.5">
        {vars.map((v) => (
          <li key={v.id}>
            <button type="button" onClick={() => engine.focusBlock(v.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-start text-[12.5px] hover:bg-surface-hover">
              <span className="font-mono text-fg">{v.name}{v.array ? "[]" : ""}</span>
              <span className="truncate font-mono text-[11px] text-faint">{v.type}</span>
              <span className="ms-auto shrink-0 text-[10.5px] text-faint">{v.scope === "global" ? t("pnl.global") : v.scope}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LibrariesPanel({ file, fqbn, deps, settingsHref }: { file?: SketchFile; fqbn: string; deps: Array<{ name: string; version?: string | null }>; settingsHref?: string }) {
  const { t } = useI18n();
  const report = useMemo(() => (file ? detectDependencies(file, getBoard(fqbn)?.architecture) : null), [file, fqbn]);
  return (
    <div className="space-y-4">
      <div>
        <PanelTitle>{t("pnl.detected")}</PanelTitle>
        {!report || (report.libraries.length === 0 && report.unknownHeaders.length === 0) ? <p className="text-[12px] text-muted">{t("pnl.noLibs")}</p> : (
          <ul className="space-y-1.5 text-[12.5px]">
            {report.libraries.map((l) => (
              <li key={`${l.pack.id}-${l.nodeId}`} className="rounded-xl border border-line p-2">
                <div className="font-medium">{l.pack.name}</div>
                <div className="text-[11px] text-muted">&lt;{l.header}&gt; {l.via === "raw" ? t("pnl.viaRaw") : ""}</div>
              </li>
            ))}
            {report.unknownHeaders.map((h) => <li key={h} className="rounded-xl border border-warn/40 p-2 text-[12px]"><span className="font-mono">&lt;{h}&gt;</span> <span className="text-warn">{t("pnl.unknownLib")}</span></li>)}
          </ul>
        )}
        {report?.installCommand && <pre className="mt-2 overflow-x-auto rounded-lg bg-canvas p-2 font-mono text-[10.5px] text-muted">{report.installCommand}</pre>}
      </div>
      <div>
        <PanelTitle>{t("pnl.projectDeps")}</PanelTitle>
        {deps.length === 0 ? <p className="text-[12px] text-muted">{t("pnl.nonePinned")}</p> : <ul className="space-y-1 text-[12.5px]">{deps.map((d) => <li key={d.name} className="flex justify-between gap-2"><span>{d.name}</span><span className="font-mono text-[11px] text-faint">{d.version ?? t("pnl.latest")}</span></li>)}</ul>}
        {settingsHref && <a href={settingsHref} className="mt-2 inline-block text-[12px] text-accent hover:underline">{t("pnl.manageDeps")}</a>}
      </div>
    </div>
  );
}

export function PinsPanel({ fqbn }: { fqbn: string }) {
  const board = getBoard(fqbn);
  const { t } = useI18n();
  if (!board) return <p className="text-[12px] text-muted">{t("pnl.noProfile", { fqbn })}</p>;
  return (
    <div>
      <PanelTitle hint={t("pnl.profile", { v: board.profileVersion })}>{board.name}</PanelTitle>
      <p className="mb-2 text-[11px] text-faint">{t("pnl.advisory")}</p>
      <ul className="space-y-1">
        {board.pins.map((p) => (
          <li key={p.gpio} className="rounded-lg px-2 py-1 text-[12px] hover:bg-surface-hover">
            <div className="flex items-center gap-1.5">
              <span className="w-14 shrink-0 font-mono text-fg">{p.labels[0] ?? `GPIO${p.gpio}`}</span>
              <span className="flex flex-wrap gap-1">
                {p.flash && <Chip tone="danger">{t("pnl.flash")}</Chip>}
                {p.inputOnly && <Chip tone="warn">{t("pnl.inputOnly")}</Chip>}
                {p.strapping && <Chip tone="warn">{t("pnl.strapping")}</Chip>}
                {p.serial && <Chip tone="info">{t("pnl.serial")}</Chip>}
                {p.capabilities.includes("pwm") && <Chip>pwm</Chip>}
                {p.capabilities.some((c) => c.startsWith("adc")) && <Chip>adc</Chip>}
              </span>
            </div>
            {p.notes?.[0] && <div className="mt-0.5 ps-14 text-[10.5px] text-faint">{p.notes[0]}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const sevIcon = (s: string) => s === "error" ? <CircleAlert size={13} className="mt-0.5 shrink-0 text-danger" /> : s === "info" ? <Info size={13} className="mt-0.5 shrink-0 text-info" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />;

export function DiagnosticsPanel({ view, compile, engine, outdated }: { view: EngineView; compile?: CompileState; engine: WorkbenchEngine; outdated?: boolean }) {
  const { t } = useI18n();
  const items: Array<{ key: string; sev: string; source: string; message: string; detail?: string; line?: number; col?: number; nodeId?: string }> = [];
  view.parseDiagnostics.forEach((d, i) => items.push({ key: `p${i}`, sev: d.severity, source: t("pnl.srcParser"), message: d.message, line: d.span.startLine + 1, col: d.span.startCol + 1 }));
  compile?.diagnostics.forEach((d, i) => items.push({ key: `c${i}`, sev: d.severity, source: `${t("pnl.srcCompiler")}${outdated ? t("pnl.srcOutdated") : ""}`, message: d.message, line: d.line, col: d.column, detail: d.file }));
  view.boardDiagnostics.forEach((d, i) => items.push({ key: `b${i}`, sev: d.severity === "board_warning" ? "warning" : d.severity, source: `${t("pnl.srcBoard")} · ${d.certainty}`, message: d.message, detail: `${d.explanation} → ${d.recommendedAction}`, line: d.span ? d.span.startLine + 1 : undefined, col: d.span ? d.span.startCol + 1 : undefined, nodeId: d.nodeId }));
  view.adapterWarnings.forEach((w, i) => items.push({ key: `a${i}`, sev: "warning", source: t("pnl.srcBlocks"), message: w.message, nodeId: w.blockId }));
  if (view.orphanBlockIds.length) items.push({ key: "orph", sev: "warning", source: t("pnl.srcBlocks"), message: t("pnl.orphans", { n: view.orphanBlockIds.length }), nodeId: view.orphanBlockIds[0] });
  return (
    <div>
      <PanelTitle hint={`${items.length}`}>{t("pnl.diagnostics")}</PanelTitle>
      {items.length === 0 && <p className="text-[12px] text-muted">{t("pnl.noProblems")}</p>}
      <ul className="space-y-1" data-testid="diagnostics-list">
        {items.map((d) => (
          <li key={d.key}>
            <button type="button" className="flex w-full gap-2 rounded-xl px-2 py-1.5 text-start text-[12.5px] hover:bg-surface-hover"
              onClick={() => { if (d.line) engine.revealSource(d.line, d.col ?? 1); else if (d.nodeId) engine.focusBlock(d.nodeId); }}>
              {sevIcon(d.sev)}
              <span className="min-w-0 flex-1">
                <span className="block text-fg">{d.message}</span>
                {d.detail && <span className="mt-0.5 block text-[11px] text-muted">{d.detail}</span>}
                <span className="mt-0.5 block text-[10.5px] text-faint">{d.source}{d.line ? t("pnl.line", { n: d.line }) : ""}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CoveragePanel({ view, engine }: { view: EngineView; engine: WorkbenchEngine }) {
  const { t } = useI18n();
  const cov = view.coverage;
  const raws = cov?.entries.filter((e) => e.coverage === "raw_preserved") ?? [];
  const partial = cov?.entries.filter((e) => e.coverage === "partially_visualized") ?? [];
  return (
    <div>
      <PanelTitle>{t("pnl.coverage")}</PanelTitle>
      {!cov ? <p className="text-[12px] text-muted">{t("pnl.waiting")}</p> : (<>
        <div className="mb-3 flex items-center gap-3">
          <div className="text-2xl font-semibold tabular-nums" data-testid="coverage-ratio">{Math.round(cov.ratio * 100)}%</div>
          <div className="text-[11.5px] text-muted">{t("pnl.coverageLead")}</div>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden><div className="h-full bg-accent" style={{ width: `${cov.ratio * 100}%` }} /></div>
        {raws.length === 0 ? <p className="text-[12px] text-ok">{t("pnl.allNative")}</p> : (
          <ul className="space-y-1.5" data-testid="coverage-raw-list">
            {raws.map((e) => (
              <li key={e.nodeId}>
                <button type="button" onClick={() => { if (e.span) engine.revealSource(e.span.startLine + 1, e.span.startCol + 1); engine.focusBlock(e.nodeId); }} className="w-full rounded-xl border border-warn/35 bg-warn/5 p-2 text-start text-[12px] hover:bg-warn/10">
                  <div className="flex items-center gap-1.5 font-medium text-warn"><ShieldAlert size={13} />{t("pnl.preserved", { construct: e.construct })}</div>
                  <div className="mt-0.5 text-muted">{e.explanation}</div>
                  {e.span && <div className="mt-0.5 text-[10.5px] text-faint">{t("pnl.linesRange", { from: e.span.startLine + 1, to: e.span.endLine + 1 })}</div>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {partial.length > 0 && <p className="mt-3 text-[11px] text-faint">{t("pnl.partial", { n: partial.length })}</p>}
      </>)}
    </div>
  );
}
