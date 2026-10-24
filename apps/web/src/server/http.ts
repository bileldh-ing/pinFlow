import "server-only";
import { NextResponse } from "next/server";
import { ConflictError, NotFoundError, ValidationError } from "@pinflow/database";
import { ZodError } from "zod";
import { assertSameOrigin, getCurrentUser, type CurrentUser } from "./auth";

export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }

/** Wrap a route handler: same-origin check, auth, and safe error mapping. */
export function route<C>(fn: (req: Request, user: CurrentUser, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      if (req.method !== "GET" && !(await assertSameOrigin(req))) return json({ error: "bad_origin" }, 403);
      const user = await getCurrentUser();
      if (!user) return json({ error: "unauthenticated" }, 401);
      return await fn(req, user, ctx);
    } catch (e) {
      if (e instanceof ConflictError) return json({ error: "conflict", currentRevision: e.currentRevision }, 409);
      if (e instanceof NotFoundError) return json({ error: "not_found" }, 404);
      if (e instanceof ValidationError) return json({ error: "validation", message: e.message }, 400);
      if (e instanceof ZodError) return json({ error: "validation", message: e.issues.map((i) => i.message).join("; ") }, 400);
      console.error("[pinflow:route]", e);
      return json({ error: "internal" }, 500);
    }
  };
}
