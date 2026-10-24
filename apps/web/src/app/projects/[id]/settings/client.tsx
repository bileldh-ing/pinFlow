"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, Chip, Input, Label, Spinner } from "@/components/ui";
import { setDependenciesAction, updateProjectSettingsAction } from "@/app/actions/projects";

interface Props {
  id: string; title: string; description: string; boardFqbn: string;
  boards: Array<{ fqbn: string; name: string; core: string; notes: string[] }>;
  deps: Array<{ name: string; version: string | null; source: string }>;
  detected: string[]; unknown: string[];
}

export function SettingsClient(p: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(p.title);
  const [description, setDescription] = useState(p.description);
  const [fqbn, setFqbn] = useState(p.boardFqbn);
  const [deps, setDeps] = useState(p.deps.map((d) => ({ name: d.name, version: d.version ?? "" })));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const board = p.boards.find((b) => b.fqbn === fqbn);

  const saveGeneral = () => start(async () => {
    const r = await updateProjectSettingsAction(p.id, { title, description, boardFqbn: fqbn });
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Settings saved." });
    router.refresh();
  });
  const saveDeps = () => start(async () => {
    const r = await setDependenciesAction(p.id, deps.filter((d) => d.name.trim()).map((d) => ({ name: d.name.trim(), version: d.version.trim() || null })));
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Dependencies saved." });
  });

  return (
    <div className="space-y-6">
      {msg && <div role="status" className={`rounded-2xl border px-3.5 py-2 text-sm ${msg.ok ? "border-ok/40 bg-ok/10 text-ok" : "border-danger/40 bg-danger/10 text-danger"}`}>{msg.text}</div>}
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">General</h2>
        <div className="space-y-4">
          <div><Label htmlFor="s-title">Name</Label><Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></div>
          <div><Label htmlFor="s-desc">Description</Label><textarea id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} className="w-full rounded-full border border-line-strong bg-surface-inner p-3 text-sm text-fg focus:border-accent2 focus:outline-none" /></div>
          <div>
            <Label htmlFor="s-board">Target board</Label>
            <select id="s-board" value={fqbn} onChange={(e) => setFqbn(e.target.value)} className="h-10 w-full rounded-full border border-line-strong bg-surface-inner px-3 text-sm text-fg" data-testid="settings-board">
              {p.boards.map((b) => <option key={b.fqbn} value={b.fqbn}>{b.name}</option>)}
            </select>
            {board && <div className="mt-2 space-y-1 text-xs text-muted"><div>FQBN <span className="font-mono text-fg">{board.fqbn}</span> · core {board.core}</div>{board.notes.map((n, i) => <div key={i}>• {n}</div>)}</div>}
          </div>
          <div className="flex justify-end"><Button variant="primary" onClick={saveGeneral} disabled={pending}>{pending && <Spinner />}Save settings</Button></div>
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Library dependencies</h2>
        <p className="mt-1 text-sm text-muted">Pin library versions for compilation. PinFlow never silently picks a library from a header name — detected suggestions are listed below for you to confirm.</p>
        {(p.detected.length > 0 || p.unknown.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-faint">Detected:</span>
            {p.detected.map((d) => <button key={d} type="button" onClick={() => !deps.some((x) => x.name === d) && setDeps([...deps, { name: d, version: "" }])}><Chip tone="accent">+ {d}</Chip></button>)}
            {p.unknown.map((u) => <Chip key={u} tone="warn" title="Unknown to PinFlow">&lt;{u}&gt; unknown</Chip>)}
          </div>
        )}
        <ul className="mt-4 space-y-2">
          {deps.map((d, i) => (
            <li key={i} className="flex gap-2">
              <Input aria-label="Library name" value={d.name} placeholder="Library name (as in Library Manager)" onChange={(e) => setDeps(deps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input aria-label="Version" value={d.version} placeholder="version (optional)" className="max-w-[160px] font-mono" onChange={(e) => setDeps(deps.map((x, j) => (j === i ? { ...x, version: e.target.value } : x)))} />
              <Button variant="ghost" size="icon" aria-label={`Remove ${d.name || "dependency"}`} onClick={() => setDeps(deps.filter((_, j) => j !== i))}><Trash2 size={15} /></Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between gap-2">
          <Button size="sm" onClick={() => setDeps([...deps, { name: "", version: "" }])}><Plus size={14} />Add library</Button>
          <Button variant="primary" onClick={saveDeps} disabled={pending}>Save dependencies</Button>
        </div>
      </Card>
    </div>
  );
}
