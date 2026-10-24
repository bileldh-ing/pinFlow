import { z } from "zod";
import { repos } from "@/server/db";
import { json, route } from "@/server/http";
import { saveSchema } from "@/server/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Autosave: optimistic concurrency via expectedRevision; 409 on conflict. */
export const POST = route<Ctx>(async (req, user, ctx) => {
  const { id } = await ctx.params;
  z.string().uuid().parse(id);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 4 * 1024 * 1024) return json({ error: "too_large" }, 413);
  const body = saveSchema.parse(await req.json());
  const r = await repos();
  const res = await r.projects.saveRevision(user.id, id, body);
  return json({ ok: true, revision: res.revision, sourceHash: res.sourceHash, unchanged: res.unchanged });
});
