import { z } from "zod";
import { sourceHash } from "@pinflow/database";
import { repos } from "@/server/db";
import { json, route } from "@/server/http";
import { compileSchema } from "@/server/schemas";
import { CompileWorkerUnavailable, submitJob } from "@/server/compile";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Start a compile of the SAVED revision `expectedRevision` (the client saves
 * first). The job records revision + sha256 source hash so results can be
 * labelled "outdated" when the editor moves on.
 */
export const POST = route<Ctx>(async (req, user, ctx) => {
  const { id } = await ctx.params;
  z.string().uuid().parse(id);
  const body = compileSchema.parse(await req.json());
  const r = await repos();
  const rl = await r.rateLimits.hit(`compile:${user.id}`, 30, 10 * 60 * 1000);
  if (!rl.allowed) return json({ error: "rate_limited", message: "Too many compile requests. Wait a few minutes." }, 429);
  const project = await r.projects.get(user.id, id);
  if (project.activeRevision !== body.expectedRevision) return json({ error: "conflict", currentRevision: project.activeRevision }, 409);
  const rev = await r.projects.latestRevision(user.id, id);
  const hash = sourceHash(rev.files);
  const fqbn = body.fqbn ?? project.boardFqbn;
  const job = await r.projects.createCompileJob(user.id, id, { revision: rev.revision, fqbn, sourceHash: hash, status: "queued" });
  try {
    const { jobId } = await submitJob({ projectId: id, revisionId: rev.revision, fqbn, files: rev.files, sourceHash: hash }, user.id);
    await r.projects.updateCompileJob(user.id, id, job.id, { workerJobId: jobId });
    return json({ jobId: job.id, revision: rev.revision, sourceHash: hash, status: "queued" });
  } catch (e) {
    const message = e instanceof CompileWorkerUnavailable ? e.message : "Could not reach the compile worker.";
    await r.projects.updateCompileJob(user.id, id, job.id, { status: "error", error: message, finishedAt: new Date() });
    return json({ jobId: job.id, revision: rev.revision, sourceHash: hash, status: "error", error: message }, 503);
  }
});
