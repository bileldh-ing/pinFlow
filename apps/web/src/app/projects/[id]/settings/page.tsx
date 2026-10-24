import { notFound } from "next/navigation";
import { z } from "zod";
import { listBoards, detectDependencies, getBoard } from "@pinflow/board-registry";
import { NotFoundError } from "@pinflow/database";
import type { SketchFile } from "@pinflow/arduino-ir";
import { requireUser } from "@/server/auth";
import { repos } from "@/server/db";
import { AppHeader } from "@/components/app/AppHeader";
import { ProjectSubnav } from "@/components/app/ProjectSubnav";
import { SettingsClient } from "./client";

export const metadata = { title: "Project settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/projects/${id}/settings`);
  const r = await repos();
  try {
    const project = await r.projects.get(user.id, id);
    const rev = await r.projects.latestRevision(user.id, id);
    const deps = await r.projects.dependencies(user.id, id);
    let detected: string[] = [];
    let unknown: string[] = [];
    if (rev.ir && typeof rev.ir === "object" && Array.isArray((rev.ir as SketchFile).items)) {
      const rep = detectDependencies(rev.ir as SketchFile, getBoard(project.boardFqbn)?.architecture);
      detected = rep.installNames; unknown = rep.unknownHeaders;
    }
    return (
      <div className="min-h-dvh">
        <AppHeader user={user} />
        <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <ProjectSubnav id={id} title={project.title} active="settings" />
          <SettingsClient id={id} title={project.title} description={project.description} boardFqbn={project.boardFqbn}
            boards={listBoards().map((b) => ({ fqbn: b.fqbn, name: b.name, core: `${b.core.packageId} (${b.core.testedVersions})`, notes: b.notes.slice(0, 3) }))}
            deps={deps.map((d) => ({ name: d.name, version: d.version, source: d.source }))} detected={detected} unknown={unknown} />
        </main>
      </div>
    );
  } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
}
