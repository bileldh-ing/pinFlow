import { z } from "zod";
import { repos } from "@/server/db";
import { json, route } from "@/server/http";
import { CompileWorkerUnavailable, TERMINAL, cancelJob, getJob } from "@/server/compile";

type Ctx = { params: Promise<{ id: string; jobId: string }> };

function view(j: { id: string; status: string; createdAt: Date; finishedAt: Date | null; revision: number; sourceHash: string; fqbn: string; diagnostics: unknown[]; sizes: unknown; toolchain: unknown; log: string; error: string | null }) {
  return { jobId: j.id, status: j.status, createdAt: j.createdAt, finishedAt: j.finishedAt, revision: j.revision, sourceHash: j.sourceHash, fqbn: j.fqbn, diagnostics: j.diagnostics, sizes: j.sizes, toolchain: j.toolchain, log: j.log, error: j.error };
}

/** Poll: refreshes from the worker until the job is terminal. */
export const GET = route<Ctx>(async (_req, user, ctx) => {
  const { id, jobId } = await ctx.params;
  z.string().uuid().parse(id); z.string().uuid().parse(jobId);
  const r = await repos();
  let job = await r.projects.getCompileJob(user.id, id, jobId);
  if (!TERMINAL.has(job.status) && job.workerJobId) {
    try {
      const w = await getJob(job.workerJobId);
      const done = TERMINAL.has(w.status);
      job = await r.projects.updateCompileJob(user.id, id, jobId, {
        status: w.status === "cancelled" ? "canceled" : w.status, diagnostics: w.diagnostics, sizes: w.sizes, toolchain: w.toolchain,
        log: w.log, error: w.error, ...(done ? { finishedAt: new Date() } : {}),
      });
    } catch (e) {
      const message = e instanceof CompileWorkerUnavailable ? e.message : "Lost contact with the compile worker.";
      job = await r.projects.updateCompileJob(user.id, id, jobId, { status: "error", error: message, finishedAt: new Date() });
    }
  }
  return json(view(job));
});

export const POST = route<Ctx>(async (_req, user, ctx) => {
  const { id, jobId } = await ctx.params;
  z.string().uuid().parse(id); z.string().uuid().parse(jobId);
  const r = await repos();
  const job = await r.projects.getCompileJob(user.id, id, jobId);
  if (job.workerJobId && !TERMINAL.has(job.status)) {
    try { await cancelJob(job.workerJobId); } catch { /* worker may already be gone; record cancel locally */ }
  }
  const updated = await r.projects.updateCompileJob(user.id, id, jobId, { status: "canceled", finishedAt: new Date() });
  return json(view(updated));
});
