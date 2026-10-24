"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { DiffEditor, loader } from "@monaco-editor/react";
import { Copy, GitCompare, RotateCcw } from "lucide-react";
import { Button, Chip, Spinner } from "@/components/ui";
import { useTheme } from "@/components/ThemeToggle";
import { defineMonacoThemes } from "@/components/workbench/monaco-setup";
import type * as Monaco from "monaco-editor";
import { duplicateProjectAction, restoreRevisionAction } from "@/app/actions/projects";

loader.config({ paths: { vs: "/monaco/vs" } });

interface Rev { revision: number; message: string; createdAt: string; sourceHash: string; files: Array<{ path: string; content: string }>; }

export function HistoryClient({ projectId, currentRevision, revisions }: { projectId: string; currentRevision: number; revisions: Rev[] }) {
  const router = useRouter();
  const [theme] = useTheme();
  const [selected, setSelected] = useState<number>(revisions[1]?.revision ?? revisions[0]?.revision ?? 1);
  const [against, setAgainst] = useState<number>(currentRevision);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byRev = useMemo(() => new Map(revisions.map((r) => [r.revision, r])), [revisions]);
  const a = byRev.get(selected);
  const b = byRev.get(against);
  const main = (r?: Rev) => r?.files.find((f) => f.path.endsWith(".ino")) ?? r?.files[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <section aria-label="Revisions" className="glass max-h-[70vh] overflow-y-auto rounded-[var(--radius)] p-2">
        <ul className="space-y-1">
          {revisions.map((r) => (
            <li key={r.revision}>
              <button type="button" onClick={() => setSelected(r.revision)} aria-pressed={selected === r.revision} data-testid={`rev-${r.revision}`}
                className={`pf-transition w-full rounded-2xl px-3.5 py-2.5 text-left text-sm ${selected === r.revision ? "bg-accent/12 ring-1 ring-accent/45" : "hover:bg-surface-hover"}`}>
                <div className="flex items-center gap-2"><span className="font-medium">Revision {r.revision}</span>{r.revision === currentRevision && <Chip tone="accent">current</Chip>}</div>
                <div className="mt-0.5 text-xs text-muted">{new Date(r.createdAt).toLocaleString()}{r.message ? ` · ${r.message}` : ""}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-faint">sha256 {r.sourceHash.slice(0, 12)}…</div>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Compare" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted"><GitCompare size={15} />Compare revision {selected} with</span>
          <select aria-label="Compare against" value={against} onChange={(e) => setAgainst(Number(e.target.value))} className="h-9 rounded-full border border-line-strong bg-surface-inner px-2 text-sm text-fg">
            {revisions.map((r) => <option key={r.revision} value={r.revision}>revision {r.revision}{r.revision === currentRevision ? " (current)" : ""}</option>)}
          </select>
          <div className="ml-auto flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await duplicateProjectAction(projectId, selected); if (r.id) router.push(`/projects/${r.id}/editor`); else setMsg(r.error ?? "Failed"); })}><Copy size={14} />Duplicate as new project</Button>
            <Button size="sm" variant="primary" disabled={pending || selected === currentRevision} data-testid="restore-revision"
              onClick={() => start(async () => { const r = await restoreRevisionAction(projectId, selected, currentRevision); if (r.error) setMsg(r.error); else { setMsg(`Restored as revision ${r.revision}.`); router.refresh(); } })}>
              {pending ? <Spinner /> : <RotateCcw size={14} />}Restore this revision
            </Button>
          </div>
        </div>
        {msg && <p role="status" className="mb-3 text-sm text-accent">{msg}</p>}
        <p className="mb-2 text-xs text-faint">Restoring creates a new revision with the old content — history is never rewritten.</p>
        <div className="glass-noblur h-[60vh] overflow-hidden rounded-[var(--radius)] p-1.5"><div className="h-full overflow-hidden rounded-[18px]">
          <DiffEditor original={main(a)?.content ?? ""} modified={main(b)?.content ?? ""} language="cpp" theme={theme === "light" ? "pinflow-light" : "pinflow-dark"} beforeMount={(m) => defineMonacoThemes(m as unknown as typeof Monaco)}
            options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 12.5, scrollBeyondLastLine: false, automaticLayout: true }} />
        </div></div>
      </section>
    </div>
  );
}
