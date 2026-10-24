"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NotFoundError, ValidationError } from "@pinflow/database";
import { repos } from "@/server/db";
import { requireUser } from "@/server/auth";
import { dependencySchema, fqbnSchema, preferencesSchema, titleSchema } from "@/server/schemas";
import { getTemplate } from "@/server/templates";
import { BLANK_SKETCH, sketchFileName } from "@/lib/blank";
import { getT } from "@/i18n/server";
import { tMaybe } from "@/i18n/content";

export interface ActionResult { ok?: boolean; error?: string; id?: string; }

const idSchema = z.string().uuid();
const IMPORT_EXT = /\.(ino|cpp|c|h|hpp)$/i;

async function fail(e: unknown): Promise<ActionResult> {
  const t = await getT();
  if (e instanceof NotFoundError) return { error: t("proj.err.notFound") };
  if (e instanceof ValidationError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: e.issues.map((i) => tMaybe(t, i.message)).join("; ") };
  console.error("[pinflow:action]", e);
  return { error: t("proj.err.generic") };
}

const createSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("blank"), title: titleSchema, boardFqbn: fqbnSchema }),
  z.object({ source: z.literal("template"), templateId: z.string().max(80), title: titleSchema.optional(), boardFqbn: fqbnSchema.optional() }),
  z.object({
    source: z.literal("import"), title: titleSchema, boardFqbn: fqbnSchema,
    files: z.array(z.object({ path: z.string().max(128).regex(IMPORT_EXT, "val.importExt"), content: z.string().max(512 * 1024, "val.importSize") })).min(1).max(32),
  }),
]);

export async function createProjectAction(input: z.input<typeof createSchema>): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = createSchema.parse(input);
    const r = await repos();
    let created;
    if (data.source === "blank") {
      created = await r.projects.create(user.id, { title: data.title, boardFqbn: data.boardFqbn, files: [{ path: sketchFileName(data.title), content: BLANK_SKETCH }] });
    } else if (data.source === "template") {
      const t = getTemplate(data.templateId);
      if (!t) return { error: (await getT())("proj.err.unknownTemplate") };
      created = await r.projects.create(user.id, { title: data.title ?? t.title, boardFqbn: data.boardFqbn ?? t.boardFqbn, files: t.files, templateId: t.id, dependencies: t.dependencies.map((d) => ({ ...d, source: "template" })) });
    } else {
      // Keep the folder-less base name; .ino must come first for Arduino sketch layout.
      const files = data.files.map((f) => ({ path: f.path.split(/[\\/]/).pop()!.replace(/[^A-Za-z0-9_.-]/g, "_"), content: f.content }));
      if (!files.some((f) => f.path.endsWith(".ino"))) return { error: (await getT())("proj.err.needIno") };
      created = await r.projects.create(user.id, { title: data.title, boardFqbn: data.boardFqbn, files });
    }
    revalidatePath("/dashboard");
    return { ok: true, id: created.id };
  } catch (e) { return await fail(e); }
}

export async function renameProjectAction(id: string, title: string): Promise<ActionResult> {
  const user = await requireUser();
  try { await (await repos()).projects.rename(user.id, idSchema.parse(id), titleSchema.parse(title)); revalidatePath("/dashboard"); return { ok: true }; } catch (e) { return await fail(e); }
}

export async function duplicateProjectAction(id: string, fromRevision?: number): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const p = await (await repos()).projects.duplicate(user.id, idSchema.parse(id), { fromRevision: fromRevision === undefined ? undefined : z.number().int().min(1).parse(fromRevision) });
    revalidatePath("/dashboard");
    return { ok: true, id: p.id };
  } catch (e) { return await fail(e); }
}

export async function archiveProjectAction(id: string, archived: boolean): Promise<ActionResult> {
  const user = await requireUser();
  try { await (await repos()).projects.archive(user.id, idSchema.parse(id), z.boolean().parse(archived)); revalidatePath("/dashboard"); return { ok: true }; } catch (e) { return await fail(e); }
}

export async function trashProjectAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try { await (await repos()).projects.trash(user.id, idSchema.parse(id)); revalidatePath("/dashboard"); return { ok: true }; } catch (e) { return await fail(e); }
}

export async function restoreProjectAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try { await (await repos()).projects.restoreFromTrash(user.id, idSchema.parse(id)); revalidatePath("/dashboard"); return { ok: true }; } catch (e) { return await fail(e); }
}

export async function deleteProjectPermanentlyAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try { await (await repos()).projects.deletePermanently(user.id, idSchema.parse(id)); revalidatePath("/dashboard"); return { ok: true }; } catch (e) { return await fail(e); }
}

export async function pinProjectAction(id: string, pinned: boolean): Promise<ActionResult> {
  const user = await requireUser();
  try { await (await repos()).projects.updateSettings(user.id, idSchema.parse(id), { pinned: z.boolean().parse(pinned) }); revalidatePath("/dashboard"); return { ok: true }; } catch (e) { return await fail(e); }
}

export async function updateProjectSettingsAction(id: string, input: { boardFqbn?: string; description?: string; title?: string }): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const pid = idSchema.parse(id);
    const r = await repos();
    const patch = z.object({ boardFqbn: fqbnSchema.optional(), description: z.string().max(2000).optional(), title: titleSchema.optional() }).parse(input);
    if (patch.title) await r.projects.rename(user.id, pid, patch.title);
    await r.projects.updateSettings(user.id, pid, { boardFqbn: patch.boardFqbn, description: patch.description });
    revalidatePath(`/projects/${pid}/settings`);
    return { ok: true };
  } catch (e) { return await fail(e); }
}

export async function setDependenciesAction(id: string, deps: Array<{ name: string; version?: string | null }>): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const list = z.array(dependencySchema).max(50).parse(deps);
    await (await repos()).projects.setDependencies(user.id, idSchema.parse(id), list.map((d) => ({ ...d, source: "user" })));
    return { ok: true };
  } catch (e) { return await fail(e); }
}

export async function restoreRevisionAction(id: string, revision: number, expectedRevision: number): Promise<ActionResult & { revision?: number }> {
  const user = await requireUser();
  try {
    const res = await (await repos()).projects.restoreRevision(user.id, idSchema.parse(id), z.number().int().min(1).parse(revision), z.number().int().min(1).parse(expectedRevision));
    return { ok: true, revision: res.revision };
  } catch (e) {
    if (e instanceof Error && e.name === "ConflictError") return { error: (await getT())("proj.err.historyConflict") };
    return await fail(e);
  }
}

export async function savePreferencesAction(input: z.input<typeof preferencesSchema> & { completeOnboarding?: boolean; displayName?: string }): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = preferencesSchema.parse(input);
    const r = await repos();
    await r.preferences.update(user.id, { ...data, ...(input.completeOnboarding ? { onboardedAt: new Date() } : {}) });
    if (typeof input.displayName === "string") await r.users.updateProfile(user.id, { displayName: z.string().trim().max(80).parse(input.displayName) });
    return { ok: true };
  } catch (e) { return await fail(e); }
}

export async function finishOnboardingAction(input: { skillLevel: string; preferredBoard: string; layout: string; templateId: string | null }): Promise<void> {
  const user = await requireUser();
  const data = preferencesSchema.parse({ skillLevel: input.skillLevel, preferredBoard: input.preferredBoard, layout: input.layout });
  const r = await repos();
  await r.preferences.update(user.id, { ...data, onboardedAt: new Date() });
  let target = "/dashboard";
  if (input.templateId) {
    const res = await createProjectAction(input.templateId === "blank" ? { source: "blank", title: (await getT())("proj.firstSketch"), boardFqbn: data.preferredBoard ?? "esp32:esp32:esp32" } : { source: "template", templateId: input.templateId });
    if (res.id) target = `/projects/${res.id}/editor`;
  }
  redirect(target);
}

export async function deleteAccountAction(confirmEmail: string): Promise<ActionResult> {
  const user = await requireUser();
  if (confirmEmail.trim().toLowerCase() !== user.email) return { error: (await getT())("proj.err.confirmEmail") };
  const r = await repos();
  await r.audit.log({ userId: null, action: "account.delete", meta: { email: user.email } });
  await r.users.delete(user.id); // sessions cascade-delete with the user
  redirect("/");
}
