"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Blocks, CheckCircle2, Copy, Download, FileUp, LayoutGrid, List, MoreHorizontal, Pencil, Pin, Plus, Search, Trash2, Undo2, Cpu, FileCode2, FolderKanban } from "lucide-react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import JSZip from "jszip";
import { Button, Chip, EmptyState, IconChip, Input, Label, Spinner, Stat } from "@/components/ui";
import { Stagger, StaggerItem, FadeIn } from "@/components/motion";
import { Dialog } from "@/components/Dialog";
import { useI18n } from "@/i18n/client";
import type { TFunction } from "@/i18n/translate";
import {
  archiveProjectAction, createProjectAction, deleteProjectPermanentlyAction, duplicateProjectAction, pinProjectAction, renameProjectAction, restoreProjectAction, trashProjectAction,
} from "@/app/actions/projects";

export interface ProjectCard {
  id: string; title: string; boardFqbn: string; updatedAt: string; coverageRatio: number | null; lastCompileStatus: string | null;
  archived: boolean; deleted: boolean; pinned: boolean; revision: number;
}
interface Props {
  projects: ProjectCard[]; view: string; query: string; defaultBoard: string;
  boards: Array<{ fqbn: string; name: string }>;
  templates: Array<{ id: string; title: string; description: string; boardFqbn: string; category: string }>;
}

const MAX_IMPORT = 512 * 1024;

function rel(iso: string, t: TFunction, fmt: (d: string, o: Intl.DateTimeFormatOptions) => string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return t("dash.justNow");
  if (d < 3600) return t("dash.minAgo", { n: Math.floor(d / 60) });
  if (d < 86400) return t("dash.hAgo", { n: Math.floor(d / 3600) });
  return fmt(iso, { dateStyle: "medium" });
}

function compileChip(s: string | null, t: TFunction) {
  if (!s) return <Chip>{t("dash.notCompiled")}</Chip>;
  if (s === "succeeded") return <Chip tone="ok">{t("dash.compiled")}</Chip>;
  if (s === "failed") return <Chip tone="danger">{t("dash.compileFailed")}</Chip>;
  return <Chip tone="warn">{s}</Chip>;
}

export function DashboardClient({ projects, view, query, defaultBoard, boards, templates }: Props) {
  const router = useRouter();
  const { t, formatDate, dir } = useI18n();
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"updated" | "title">("updated");
  const [q, setQ] = useState(query);
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<ProjectCard | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = projects.filter((p) => !term || p.title.toLowerCase().includes(term));
    return [...list].sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1) || (sort === "title" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [projects, q, sort]);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string; id?: string }>, after?: (id?: string) => void) => start(async () => {
    setError(null);
    const r = await fn();
    if (r.error) setError(r.error);
    else { after?.(r.id); router.refresh(); }
  });

  const tabs = [{ id: "active", label: t("dash.tabProjects") }, { id: "archived", label: t("dash.tabArchived") }, { id: "trash", label: t("dash.tabTrash") }];

  return (
    <div>
      <FadeIn className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">{t("dash.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("dash.lead")}</p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)} data-testid="new-project"><Plus size={16} />{t("dash.new")}</Button>
      </FadeIn>

      {view === "active" && (
        <FadeIn delay={0.04} className="glass mt-6 grid grid-cols-2 gap-x-4 gap-y-5 rounded-[var(--radius)] p-5 sm:p-6 lg:grid-cols-4" >
          <Stat icon={<FolderKanban size={17} />} label={t("dash.statProjects")} value={projects.length} tone="accent" testId="stat-projects" />
          <Stat icon={<Blocks size={17} />} label={t("dash.statVisual")} value={projects.filter((p) => (p.coverageRatio ?? 0) >= 0.999).length} />
          <Stat icon={<CheckCircle2 size={17} />} label={t("dash.statCompiled")} value={projects.filter((p) => p.lastCompileStatus === "succeeded").length} tone="mint" />
          <Stat icon={<Cpu size={17} />} label={t("dash.statBoards")} value={new Set(projects.map((p) => p.boardFqbn)).size} />
        </FadeIn>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <nav aria-label={t("dash.views")} className="flex rounded-full border border-line bg-surface-inner p-1">
          {tabs.map((t) => (
            <Link key={t.id} href={t.id === "active" ? "/dashboard" : `/dashboard?view=${t.id}`} aria-current={view === t.id ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 font-medium text-sm ${view === t.id ? "bg-surface-hover text-fg" : "text-muted hover:text-fg"}`}>{t.label}</Link>
          ))}
        </nav>
        <form className="relative min-w-[200px] flex-1" role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/dashboard?${new URLSearchParams({ ...(view !== "active" ? { view } : {}), ...(q ? { q } : {}) })}`); }}>
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input aria-label={t("dash.search")} placeholder={t("dash.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} className="ps-9" />
        </form>
        <label className="sr-only" htmlFor="sort">{t("dash.sort")}</label>
        <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as "updated" | "title")} className="h-10 rounded-full border border-line-strong bg-surface-inner px-3 text-sm text-fg">
          <option value="updated">{t("dash.sortUpdated")}</option>
          <option value="title">{t("dash.sortName")}</option>
        </select>
        <div className="flex rounded-full border border-line bg-surface-inner p-1" role="group" aria-label={t("dash.layout")}>
          <button type="button" aria-pressed={layout === "grid"} aria-label={t("dash.grid")} onClick={() => setLayout("grid")} className={`rounded-full p-2 ${layout === "grid" ? "bg-surface-hover text-fg" : "text-muted"}`}><LayoutGrid size={15} /></button>
          <button type="button" aria-pressed={layout === "list"} aria-label={t("dash.list")} onClick={() => setLayout("list")} className={`rounded-full p-2 ${layout === "list" ? "bg-surface-hover text-fg" : "text-muted"}`}><List size={15} /></button>
        </div>
      </div>

      {error && <div role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {view === "trash" && <p className="mt-4 text-sm text-muted">{t("dash.trashNote")}</p>}

      <div className="mt-6">
        {shown.length === 0 ? (
          <EmptyState icon={<FileCode2 size={28} />} title={view === "active" ? (q ? t("dash.noMatch") : t("dash.noProjects")) : view === "trash" ? t("dash.nothingTrash") : t("dash.nothingArchived")}
            action={view === "active" && !q ? <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={16} />{t("dash.createFirst")}</Button> : undefined}>
            {view === "active" && !q ? t("dash.emptyLead") : null}
          </EmptyState>
        ) : (
          <Stagger key={`${layout}-${view}`} className={layout === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2"} data-testid="project-list">
            {shown.map((p) => (
              <StaggerItem key={p.id} className={`glass pf-lift group relative rounded-[var(--radius)] ${layout === "grid" ? "p-5" : "flex items-center gap-4 rounded-[var(--radius-md)] px-4 py-3"}`} data-testid="project-card">
                {layout === "grid" && <IconChip tone={p.pinned ? "accent" : "neutral"} size={42} className="mb-4"><Cpu size={18} /></IconChip>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {p.pinned && <Pin size={13} className="shrink-0 text-accent" aria-label={t("dash.pinned")} />}
                    {p.deleted ? <span className="truncate font-medium">{p.title}</span> : (
                      <Link href={`/projects/${p.id}/editor`} className="truncate text-[15px] font-semibold hover:text-accent after:absolute after:inset-0 after:rounded-[inherit] after:content-['']">{p.title}</Link>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="inline-flex items-center gap-1"><Cpu size={12} />{boards.find((b) => b.fqbn === p.boardFqbn)?.name ?? p.boardFqbn}</span>
                    <span aria-hidden>·</span><span>{t("dash.edited", { when: rel(p.updatedAt, t, formatDate) })}</span><span aria-hidden>·</span><span>{t("dash.rev", { n: p.revision })}</span>
                  </div>
                  <div className={`flex flex-wrap gap-1.5 ${layout === "grid" ? "mt-3" : "mt-1.5"}`}>
                    {p.coverageRatio != null ? <Chip tone={p.coverageRatio >= 0.999 ? "accent" : "warn"} title={t("dash.coverageTitle")}>{t("dash.blocksPct", { n: Math.round(p.coverageRatio * 100) })}</Chip> : <Chip>{t("dash.coveragePending")}</Chip>}
                    {compileChip(p.lastCompileStatus, t)}
                  </div>
                </div>
                <div className={`${layout === "grid" ? "absolute end-3 top-3" : "relative"} z-10`}>
                  <Menu.Root dir={dir}>
                    <Menu.Trigger className="pf-press grid h-9 w-9 place-items-center rounded-full border border-line bg-surface-inner text-muted hover:bg-surface-hover hover:text-fg" aria-label={t("dash.actionsFor", { title: p.title })}><MoreHorizontal size={16} /></Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Content align="end" sideOffset={4} className="glass-solid z-50 min-w-[190px] rounded-2xl p-1.5 text-sm">
                        {!p.deleted && <>
                          <MenuItem icon={<Pencil size={14} />} onSelect={() => setRenaming(p)}>{t("dash.rename")}</MenuItem>
                          <MenuItem icon={<Copy size={14} />} onSelect={() => run(() => duplicateProjectAction(p.id))}>{t("dash.duplicate")}</MenuItem>
                          <MenuItem icon={<Pin size={14} />} onSelect={() => run(() => pinProjectAction(p.id, !p.pinned))}>{p.pinned ? t("dash.unpin") : t("dash.pin")}</MenuItem>
                          <MenuItem icon={<Download size={14} />} onSelect={() => { window.location.href = `/api/projects/${p.id}/export?format=zip`; }}>{t("dash.exportZip")}</MenuItem>
                          <MenuItem icon={p.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} onSelect={() => run(() => archiveProjectAction(p.id, !p.archived))}>{p.archived ? t("dash.unarchive") : t("dash.archive")}</MenuItem>
                          <Menu.Separator className="my-1 h-px bg-line" />
                          <MenuItem icon={<Trash2 size={14} />} danger onSelect={() => run(() => trashProjectAction(p.id))}>{t("dash.trash")}</MenuItem>
                        </>}
                        {p.deleted && <>
                          <MenuItem icon={<Undo2 size={14} />} onSelect={() => run(() => restoreProjectAction(p.id))}>{t("dash.restore")}</MenuItem>
                          <MenuItem icon={<Trash2 size={14} />} danger onSelect={() => setConfirmDelete(p)}>{t("dash.deletePerm")}</MenuItem>
                        </>}
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu.Root>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} boards={boards} templates={templates} defaultBoard={defaultBoard}
        onCreated={(id) => router.push(`/projects/${id}/editor`)} />

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)} title={t("dash.renameTitle")}>
        {renaming && (
          <form onSubmit={(e) => { e.preventDefault(); const t = String(new FormData(e.currentTarget).get("title") ?? ""); run(() => renameProjectAction(renaming.id, t), () => setRenaming(null)); }} className="space-y-4">
            <div><Label htmlFor="rename">{t("common.name")}</Label><Input id="rename" name="title" defaultValue={renaming.title} autoFocus maxLength={120} required /></div>
            <div className="flex justify-end gap-2"><Button onClick={() => setRenaming(null)}>{t("common.cancel")}</Button><Button type="submit" variant="primary" disabled={pending}>{pending && <Spinner />}{t("common.save")}</Button></div>
          </form>
        )}
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)} title={t("dash.deleteTitle")}
        description={t("dash.deleteDesc", { title: confirmDelete?.title ?? "" })}
        footer={<><Button onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={() => confirmDelete && run(() => deleteProjectPermanentlyAction(confirmDelete.id), () => setConfirmDelete(null))}>{t("dash.deleteForever")}</Button></>} />
    </div>
  );
}

function MenuItem({ children, icon, onSelect, danger }: { children: React.ReactNode; icon: React.ReactNode; onSelect: () => void; danger?: boolean }) {
  return <Menu.Item onSelect={onSelect} className={`flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 outline-none data-[highlighted]:bg-surface-hover ${danger ? "text-danger" : ""}`}>{icon}{children}</Menu.Item>;
}

function CreateDialog({ open, onOpenChange, boards, templates, defaultBoard, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; boards: Props["boards"]; templates: Props["templates"]; defaultBoard: string; onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"template" | "blank" | "import">("template");
  const [title, setTitle] = useState("");
  const [board, setBoard] = useState(defaultBoard);
  const [tpl, setTpl] = useState(templates[0]?.id ?? "");
  const [files, setFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [warn, setWarn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(list: FileList | null) {
    setWarn(null); setError(null); setFiles([]);
    const f = list?.[0];
    if (!f) return;
    if (f.size > 4 * MAX_IMPORT) { setError(t("dash.errTooLarge")); return; }
    try {
      if (/\.zip$/i.test(f.name)) {
        const zip = await JSZip.loadAsync(await f.arrayBuffer());
        const out: Array<{ path: string; content: string }> = [];
        const skipped: string[] = [];
        for (const entry of Object.values(zip.files)) {
          if (entry.dir) continue;
          const name = entry.name;
          if (name.includes("..") || name.startsWith("/") || name.includes("\\")) { skipped.push(name); continue; }
          if (!/\.(ino|cpp|c|h|hpp)$/i.test(name) || name.startsWith("__MACOSX")) { skipped.push(name); continue; }
          const content = await entry.async("string");
          if (content.length > MAX_IMPORT) { skipped.push(`${name} ${t("dash.tooLargeSuffix")}`); continue; }
          out.push({ path: name.split("/").pop()!, content });
        }
        if (!out.some((x) => x.path.endsWith(".ino"))) { setError(t("dash.errNoIno")); return; }
        if (skipped.length) setWarn(t("dash.warnSkipped", { n: skipped.length, list: `${skipped.slice(0, 4).join(", ")}${skipped.length > 4 ? "…" : ""}` }));
        setFiles(out.slice(0, 32));
        if (!title) setTitle(f.name.replace(/\.zip$/i, ""));
      } else if (/\.(ino|cpp|h)$/i.test(f.name)) {
        if (f.size > MAX_IMPORT) { setError(t("dash.errFileLarge")); return; }
        const content = await f.text();
        const path = /\.ino$/i.test(f.name) ? f.name : f.name.replace(/\.[^.]+$/, ".ino");
        if (!/\.ino$/i.test(f.name)) setWarn(t("dash.warnMainIno"));
        setFiles([{ path: path.replace(/[^A-Za-z0-9_.-]/g, "_"), content }]);
        if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
      } else setError(t("dash.errChoose"));
    } catch { setError(t("dash.errRead")); }
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = tab === "template" ? await createProjectAction({ source: "template", templateId: tpl, title: title.trim() || undefined })
        : tab === "blank" ? await createProjectAction({ source: "blank", title: title.trim() || t("dash.untitled"), boardFqbn: board })
          : await createProjectAction({ source: "import", title: title.trim() || t("dash.imported"), boardFqbn: board, files });
      if (res.error) setError(res.error);
      else if (res.id) { onOpenChange(false); onCreated(res.id); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("dash.newTitle")} wide description={t("dash.newDesc")}>
      <div role="tablist" className="mb-4 flex gap-1 rounded-full border border-line bg-surface-inner p-1 text-sm">
        {(["template", "blank", "import"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-full px-3.5 py-1.5 font-medium ${tab === k ? "bg-surface-hover text-fg" : "text-muted"}`}>{k === "import" ? t("dash.tabImport") : k === "blank" ? t("dash.tabBlank") : t("dash.tabTemplate")}</button>
        ))}
      </div>
      <div className="space-y-4">
        {tab === "template" && (
          <div className="grid max-h-[300px] gap-2 overflow-y-auto sm:grid-cols-2" role="radiogroup" aria-label={t("dash.template")}>
            {templates.map((tp) => (
              <button key={tp.id} type="button" role="radio" aria-checked={tpl === tp.id} onClick={() => setTpl(tp.id)} data-testid={`template-${tp.id}`}
                className={`pf-transition rounded-2xl border p-3.5 text-start ${tpl === tp.id ? "border-accent-strong bg-accent/12" : "border-line hover:bg-surface-hover"}`}>
                <div className="text-sm font-medium">{tp.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted">{tp.description}</div>
                <div className="mt-1.5 text-[11px] text-faint">{boards.find((b) => b.fqbn === tp.boardFqbn)?.name ?? tp.boardFqbn}</div>
              </button>
            ))}
          </div>
        )}
        {tab === "import" && (
          <div>
            <input ref={fileRef} type="file" accept=".ino,.cpp,.h,.zip" className="sr-only" id="import-file" onChange={(e) => onFile(e.target.files)} data-testid="import-file" />
            <label htmlFor="import-file" className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted hover:bg-surface-hover">
              <FileUp size={22} className="text-accent" />{t("dash.chooseFile")}
            </label>
            {files.length > 0 && (
              <div className="mt-3 glass-inner p-3 text-xs">
                <div className="mb-1 font-medium text-fg">{t("dash.importPreview")}</div>
                <ul className="space-y-0.5 font-mono text-muted">{files.map((f) => <li key={f.path}>{f.path} · {t("dash.lines", { n: f.content.split("\n").length })}</li>)}</ul>
                <p className="mt-2 text-faint">{t("dash.importNote")}</p>
              </div>
            )}
            {warn && <p className="mt-2 text-xs text-warn">{warn}</p>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="np-title">{t("common.name")}</Label><Input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tab === "template" ? templates.find((tp) => tp.id === tpl)?.title : t("dash.untitled")} maxLength={120} /></div>
          {tab !== "template" && (
            <div><Label htmlFor="np-board">{t("common.board")}</Label>
              <select id="np-board" value={board} onChange={(e) => setBoard(e.target.value)} className="h-10 w-full rounded-full border border-line-strong bg-surface-inner px-3 text-sm text-fg">
                {boards.map((b) => <option key={b.fqbn} value={b.fqbn}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={submit} disabled={pending || (tab === "import" && files.length === 0)} data-testid="create-project">{pending && <Spinner />}{t("dash.createProject")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
