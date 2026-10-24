import { listBoards } from "@pinflow/board-registry";
import { requireUser } from "@/server/auth";
import { repos } from "@/server/db";
import { listTemplates } from "@/server/templates";
import { AppHeader } from "@/components/app/AppHeader";
import { DashboardClient, type ProjectCard } from "./client";

import { getT } from "@/i18n/server";
import { tplCategory, tplDesc, tplTitle } from "@/i18n/content";

export async function generateMetadata() { return { title: (await getT())("meta.projects") }; }
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const user = await requireUser("/dashboard");
  const { view = "active", q = "" } = await searchParams;
  const r = await repos();
  const rows = await r.projects.list(user.id, { search: q, archived: view === "archived", deleted: view === "trash" });
  const prefs = await r.preferences.get(user.id);
  const tr = await getT();
  const projects: ProjectCard[] = rows.map((p) => ({
    id: p.id, title: p.title, boardFqbn: p.boardFqbn, updatedAt: p.updatedAt.toISOString(), coverageRatio: p.coverageRatio,
    lastCompileStatus: p.lastCompileStatus, archived: !!p.archivedAt, deleted: !!p.deletedAt, pinned: p.pinned, revision: p.activeRevision,
  }));
  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <DashboardClient
          projects={projects} view={view} query={q} defaultBoard={prefs.preferredBoard}
          boards={listBoards().map((b) => ({ fqbn: b.fqbn, name: b.name }))}
          templates={listTemplates().map((t) => ({ id: t.id, title: tplTitle(tr, t.id, t.title), description: tplDesc(tr, t.id, t.description), boardFqbn: t.boardFqbn, category: tplCategory(tr, t.category) }))}
        />
      </main>
    </div>
  );
}
