import { z } from "zod";
import { repos } from "@/server/db";
import { json, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Latest saved revision (used for conflict "reload"). */
export const GET = route<Ctx>(async (_req, user, ctx) => {
  const { id } = await ctx.params;
  z.string().uuid().parse(id);
  const rev = await (await repos()).projects.latestRevision(user.id, id);
  return json({ revision: rev.revision, files: rev.files, workspace: rev.workspace, sourceHash: rev.sourceHash });
});
