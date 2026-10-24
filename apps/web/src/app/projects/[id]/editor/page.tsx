import { notFound } from "next/navigation";
import { z } from "zod";
import { listBoards } from "@pinflow/board-registry";
import { NotFoundError } from "@pinflow/database";
import { requireUser } from "@/server/auth";
import { repos } from "@/server/db";
import { ClientWorkbench } from "@/components/workbench/ClientWorkbench";
import type { LayoutMode } from "@/components/workbench/Workbench";

import { getT } from "@/i18n/server";

export async function generateMetadata() { return { title: (await getT())("meta.workbench") }; }
export const dynamic = "force-dynamic";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/projects/${id}/editor`);
  const r = await repos();
  try {
    const project = await r.projects.get(user.id, id);
    const rev = await r.projects.latestRevision(user.id, id);
    const deps = await r.projects.dependencies(user.id, id);
    const prefs = await r.preferences.get(user.id);
    const mainPath = rev.files.find((f) => f.path.endsWith(".ino"))?.path ?? rev.files[0]!.path;
    return (
      <ClientWorkbench
        mode="project"
        project={{ id, title: project.title, boardFqbn: project.boardFqbn, revision: rev.revision, files: rev.files, mainPath, coverageRatio: project.coverageRatio, dependencies: deps.map((d) => ({ name: d.name, version: d.version })) }}
        savedWorkspace={rev.workspace ?? undefined}
        boards={listBoards().map((b) => ({ fqbn: b.fqbn, name: b.name }))}
        defaultLayout={prefs.layout as LayoutMode}
        fontSize={prefs.editorFontSize}
      />
    );
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
