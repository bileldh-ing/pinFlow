import { notFound } from "next/navigation";
import { z } from "zod";
import { NotFoundError } from "@pinflow/database";
import { requireUser } from "@/server/auth";
import { repos } from "@/server/db";
import { AppHeader } from "@/components/app/AppHeader";
import { ProjectSubnav } from "@/components/app/ProjectSubnav";
import { HistoryClient } from "./client";

export const metadata = { title: "History" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/projects/${id}/history`);
  const r = await repos();
  try {
    const project = await r.projects.get(user.id, id);
    const revs = await r.projects.listRevisions(user.id, id, 200);
    return (
      <div className="min-h-dvh">
        <AppHeader user={user} />
        <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <ProjectSubnav id={id} title={project.title} active="history" />
          <HistoryClient projectId={id} currentRevision={project.activeRevision}
            revisions={revs.map((x) => ({ revision: x.revision, message: x.message, createdAt: x.createdAt.toISOString(), sourceHash: x.sourceHash, files: x.files }))} />
        </main>
      </div>
    );
  } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
}
