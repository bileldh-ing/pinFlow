/**
 * Typed repositories. Every project operation takes the ACTING user id and
 * enforces access (owner or member role) — callers never pass an owner id.
 * Unauthorized access is reported as NotFound so existence does not leak.
 */
import { and, asc, desc, eq, gt, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Db } from "./client";
import {
  auditEvents, authTokens, compileJobs, mailOutbox, projectDependencies, projectFiles, projectMembers, projectRevisions, projects,
  rateLimits, sessions, templates, userPreferences, users, type StoredFile,
} from "./schema";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { fileType, newId, randomToken, sha256, sourceHash } from "./util";

export type Role = "owner" | "editor" | "viewer";
const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export type UserRow = typeof users.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type RevisionRow = typeof projectRevisions.$inferSelect;
export type PreferencesRow = typeof userPreferences.$inferSelect;
export type CompileJobRow = typeof compileJobs.$inferSelect;
export type DependencyRow = typeof projectDependencies.$inferSelect;

const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 32;
const SAFE_PATH = /^(?!.*\.\.)(?!\/)[A-Za-z0-9_-][A-Za-z0-9_\-./]{0,120}\.(ino|cpp|c|h|hpp)$/;

export function validateFiles(files: StoredFile[]): void {
  if (!files.length) throw new ValidationError("A project needs at least one file");
  if (files.length > MAX_FILES) throw new ValidationError(`Too many files (max ${MAX_FILES})`);
  const seen = new Set<string>();
  for (const f of files) {
    if (!SAFE_PATH.test(f.path)) throw new ValidationError(`Invalid file path: ${f.path}`);
    if (seen.has(f.path)) throw new ValidationError(`Duplicate file path: ${f.path}`);
    seen.add(f.path);
    if (Buffer.byteLength(f.content, "utf8") > MAX_FILE_BYTES) throw new ValidationError(`File too large: ${f.path}`);
  }
}

/* --------------------------------- users -------------------------------- */

export class UsersRepo {
  constructor(private db: Db) {}
  async create(input: { email: string; passwordHash: string; displayName?: string }): Promise<UserRow> {
    const id = newId();
    const [row] = await this.db.insert(users).values({ id, email: input.email.toLowerCase(), passwordHash: input.passwordHash, displayName: input.displayName ?? "" }).returning();
    await this.db.insert(userPreferences).values({ userId: id }).onConflictDoNothing();
    return row!;
  }
  async findByEmail(email: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    return row;
  }
  async findById(id: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }
  async updateProfile(actorId: string, patch: { displayName?: string; avatarUrl?: string | null }): Promise<UserRow> {
    const [row] = await this.db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, actorId)).returning();
    if (!row) throw new NotFoundError("User");
    return row;
  }
  async setPassword(userId: string, passwordHash: string): Promise<void> {
    await this.db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
  }
  async markVerified(userId: string): Promise<void> {
    await this.db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
  }
  async delete(actorId: string): Promise<void> { await this.db.delete(users).where(eq(users.id, actorId)); }
}

/* -------------------------------- sessions ------------------------------- */

export class SessionsRepo {
  constructor(private db: Db) {}
  /** Returns the raw token (store it in the cookie); only its hash is persisted. */
  async create(userId: string, ttlMs: number, meta: { userAgent?: string; ip?: string } = {}): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.db.insert(sessions).values({ id: sha256(token), userId, expiresAt, userAgent: meta.userAgent?.slice(0, 300), ip: meta.ip?.slice(0, 64) });
    return { token, expiresAt };
  }
  async validate(token: string, opts: { slideMs?: number } = {}): Promise<{ user: UserRow; expiresAt: Date } | null> {
    if (!token || token.length > 200) return null;
    const id = sha256(token);
    const [row] = await this.db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.id, id)).limit(1);
    if (!row) return null;
    if (row.s.expiresAt.getTime() <= Date.now()) { await this.db.delete(sessions).where(eq(sessions.id, id)); return null; }
    let expiresAt = row.s.expiresAt;
    if (opts.slideMs && row.s.expiresAt.getTime() - Date.now() < opts.slideMs / 2) {
      expiresAt = new Date(Date.now() + opts.slideMs);
      await this.db.update(sessions).set({ expiresAt, lastSeenAt: new Date() }).where(eq(sessions.id, id));
    }
    return { user: row.u, expiresAt };
  }
  async revoke(token: string): Promise<void> { await this.db.delete(sessions).where(eq(sessions.id, sha256(token))); }
  async revokeAll(userId: string): Promise<void> { await this.db.delete(sessions).where(eq(sessions.userId, userId)); }
}

/* ------------------------------ auth tokens ------------------------------ */

export type TokenKind = "verify_email" | "reset_password";
export class TokensRepo {
  constructor(private db: Db) {}
  async issue(userId: string, kind: TokenKind, ttlMs: number): Promise<string> {
    const token = randomToken(32);
    await this.db.insert(authTokens).values({ id: sha256(token), userId, kind, expiresAt: new Date(Date.now() + ttlMs) });
    return token;
  }
  /** Single use. Returns the user id or null if invalid/expired/used. */
  async consume(token: string, kind: TokenKind): Promise<string | null> {
    if (!token || token.length > 200) return null;
    const [row] = await this.db.update(authTokens).set({ usedAt: new Date() })
      .where(and(eq(authTokens.id, sha256(token)), eq(authTokens.kind, kind), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
      .returning();
    return row?.userId ?? null;
  }
}

/* ------------------------------ mail outbox ------------------------------ */

export class OutboxRepo {
  constructor(private db: Db) {}
  async add(m: { to: string; subject: string; body: string; kind: string }): Promise<string> {
    const id = newId();
    await this.db.insert(mailOutbox).values({ id, toAddress: m.to.toLowerCase(), subject: m.subject, body: m.body, kind: m.kind });
    return id;
  }
  async listFor(to: string, limit = 20) {
    return this.db.select().from(mailOutbox).where(eq(mailOutbox.toAddress, to.toLowerCase())).orderBy(desc(mailOutbox.createdAt)).limit(limit);
  }
  async listAll(limit = 50) { return this.db.select().from(mailOutbox).orderBy(desc(mailOutbox.createdAt)).limit(limit); }
}

/* ------------------------------ preferences ------------------------------ */

export interface PreferencesPatch {
  skillLevel?: string; preferredBoard?: string; layout?: string; theme?: string; language?: string;
  editorFontSize?: number; onboardedAt?: Date | null; extra?: Record<string, unknown>;
}
export class PreferencesRepo {
  constructor(private db: Db) {}
  async get(actorId: string): Promise<PreferencesRow> {
    const [row] = await this.db.select().from(userPreferences).where(eq(userPreferences.userId, actorId)).limit(1);
    if (row) return row;
    await this.db.insert(userPreferences).values({ userId: actorId }).onConflictDoNothing();
    const [created] = await this.db.select().from(userPreferences).where(eq(userPreferences.userId, actorId)).limit(1);
    if (!created) throw new NotFoundError("User");
    return created;
  }
  async update(actorId: string, patch: PreferencesPatch): Promise<PreferencesRow> {
    await this.get(actorId);
    const [row] = await this.db.update(userPreferences).set({ ...patch, updatedAt: new Date() }).where(eq(userPreferences.userId, actorId)).returning();
    return row!;
  }
}

/* -------------------------------- projects ------------------------------- */

export interface CreateProjectInput {
  title: string;
  description?: string;
  boardFqbn?: string;
  files: StoredFile[];
  ir?: unknown;
  workspace?: unknown;
  templateId?: string;
  dependencies?: Array<{ name: string; version?: string | null; kind?: string; source?: string }>;
}

export interface SaveRevisionInput {
  expectedRevision: number;
  files: StoredFile[];
  ir?: unknown;
  workspace?: unknown;
  message?: string;
  coverageRatio?: number | null;
}

export interface ProjectSummary extends ProjectRow { role: Role; }

export class ProjectsRepo {
  constructor(private db: Db) {}

  /** Resolve the actor's role on a project or throw NotFound. */
  async roleOf(actorId: string, projectId: string, opts: { includeDeleted?: boolean } = {}): Promise<{ project: ProjectRow; role: Role }> {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!p || (p.deletedAt && !opts.includeDeleted)) throw new NotFoundError("Project");
    if (p.ownerId === actorId) return { project: p, role: "owner" };
    const [m] = await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actorId))).limit(1);
    if (!m) throw new NotFoundError("Project");
    return { project: p, role: m.role as Role };
  }

  async assert(actorId: string, projectId: string, need: Role, opts: { includeDeleted?: boolean } = {}): Promise<ProjectRow> {
    const { project, role } = await this.roleOf(actorId, projectId, opts);
    if (RANK[role] < RANK[need]) throw new NotFoundError("Project");
    return project;
  }

  async list(actorId: string, opts: { search?: string; archived?: boolean; deleted?: boolean } = {}): Promise<ProjectSummary[]> {
    const memberIds = this.db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, actorId));
    const conds = [or(eq(projects.ownerId, actorId), inArray(projects.id, memberIds))];
    conds.push(opts.deleted ? isNotNull(projects.deletedAt) : isNull(projects.deletedAt));
    if (!opts.deleted) conds.push(opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt));
    if (opts.search?.trim()) conds.push(ilike(projects.title, `%${opts.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
    const rows = await this.db.select().from(projects).where(and(...conds)).orderBy(desc(projects.pinned), desc(projects.updatedAt));
    return rows.map((r) => ({ ...r, role: r.ownerId === actorId ? "owner" : "editor" }));
  }

  async get(actorId: string, projectId: string): Promise<ProjectRow & { role: Role }> {
    const { project, role } = await this.roleOf(actorId, projectId);
    return { ...project, role };
  }

  async create(actorId: string, input: CreateProjectInput): Promise<ProjectRow> {
    validateFiles(input.files);
    const title = input.title.trim().slice(0, 120);
    if (!title) throw new ValidationError("Title is required");
    const id = newId();
    return this.db.transaction(async (tx) => {
      const [p] = await tx.insert(projects).values({
        id, ownerId: actorId, title, description: input.description ?? "", boardFqbn: input.boardFqbn ?? "esp32:esp32:esp32", activeRevision: 1, templateId: input.templateId ?? null,
      }).returning();
      await tx.insert(projectMembers).values({ projectId: id, userId: actorId, role: "owner" });
      await tx.insert(projectRevisions).values({ id: newId(), projectId: id, revision: 1, parentRevision: null, files: input.files, ir: input.ir ?? null, workspace: input.workspace ?? null, sourceHash: sourceHash(input.files), message: "Created", createdBy: actorId });
      for (const f of input.files) {
        await tx.insert(projectFiles).values({ id: newId(), projectId: id, path: f.path, fileType: fileType(f.path), currentRevision: 1, content: f.content, contentHash: sha256(f.content) });
      }
      for (const d of input.dependencies ?? []) {
        await tx.insert(projectDependencies).values({ id: newId(), projectId: id, name: d.name, version: d.version ?? null, kind: d.kind ?? "library", source: d.source ?? "template" }).onConflictDoNothing();
      }
      await tx.insert(auditEvents).values({ id: newId(), userId: actorId, action: "project.create", targetType: "project", targetId: id, meta: {} });
      return p!;
    });
  }

  async files(actorId: string, projectId: string): Promise<StoredFile[]> {
    await this.assert(actorId, projectId, "viewer");
    const rows = await this.db.select().from(projectFiles).where(eq(projectFiles.projectId, projectId)).orderBy(asc(projectFiles.path));
    return rows.map((r) => ({ path: r.path, content: r.content }));
  }

  async latestRevision(actorId: string, projectId: string): Promise<RevisionRow> {
    const p = await this.assert(actorId, projectId, "viewer");
    const [r] = await this.db.select().from(projectRevisions).where(and(eq(projectRevisions.projectId, projectId), eq(projectRevisions.revision, p.activeRevision))).limit(1);
    if (!r) throw new NotFoundError("Revision");
    return r;
  }

  /** Optimistic-concurrency save. Throws ConflictError if expectedRevision is stale. Idempotent for an identical retry. */
  async saveRevision(actorId: string, projectId: string, input: SaveRevisionInput): Promise<{ revision: number; sourceHash: string; unchanged: boolean }> {
    validateFiles(input.files);
    await this.assert(actorId, projectId, "editor");
    const hash = sourceHash(input.files);
    return this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!cur) throw new NotFoundError("Project");
      if (cur.activeRevision !== input.expectedRevision) {
        const [last] = await tx.select().from(projectRevisions).where(and(eq(projectRevisions.projectId, projectId), eq(projectRevisions.revision, cur.activeRevision))).limit(1);
        if (last && last.sourceHash === hash && last.parentRevision === input.expectedRevision && last.createdBy === actorId) {
          return { revision: cur.activeRevision, sourceHash: hash, unchanged: true };
        }
        throw new ConflictError(cur.activeRevision, input.expectedRevision);
      }
      const next = cur.activeRevision + 1;
      const updated = await tx.update(projects)
        .set({ activeRevision: next, updatedAt: new Date(), ...(input.coverageRatio !== undefined ? { coverageRatio: input.coverageRatio } : {}) })
        .where(and(eq(projects.id, projectId), eq(projects.activeRevision, input.expectedRevision)))
        .returning({ id: projects.id });
      if (!updated.length) throw new ConflictError(cur.activeRevision + 1, input.expectedRevision);
      await tx.insert(projectRevisions).values({ id: newId(), projectId, revision: next, parentRevision: input.expectedRevision, files: input.files, ir: input.ir ?? null, workspace: input.workspace ?? null, sourceHash: hash, message: input.message ?? "", createdBy: actorId });
      await tx.delete(projectFiles).where(and(eq(projectFiles.projectId, projectId), sql`${projectFiles.path} NOT IN (${sql.join(input.files.map((f) => sql`${f.path}`), sql`, `)})`));
      for (const f of input.files) {
        await tx.insert(projectFiles).values({ id: newId(), projectId, path: f.path, fileType: fileType(f.path), currentRevision: next, content: f.content, contentHash: sha256(f.content) })
          .onConflictDoUpdate({ target: [projectFiles.projectId, projectFiles.path], set: { content: f.content, contentHash: sha256(f.content), currentRevision: next, updatedAt: new Date() } });
      }
      return { revision: next, sourceHash: hash, unchanged: false };
    });
  }

  async listRevisions(actorId: string, projectId: string, limit = 100) {
    await this.assert(actorId, projectId, "viewer");
    return this.db.select({
      id: projectRevisions.id, projectId: projectRevisions.projectId, revision: projectRevisions.revision, parentRevision: projectRevisions.parentRevision,
      files: projectRevisions.files, sourceHash: projectRevisions.sourceHash, message: projectRevisions.message, createdBy: projectRevisions.createdBy, createdAt: projectRevisions.createdAt,
    }).from(projectRevisions).where(eq(projectRevisions.projectId, projectId)).orderBy(desc(projectRevisions.revision)).limit(limit);
  }

  async getRevision(actorId: string, projectId: string, revision: number): Promise<RevisionRow> {
    await this.assert(actorId, projectId, "viewer");
    const [r] = await this.db.select().from(projectRevisions).where(and(eq(projectRevisions.projectId, projectId), eq(projectRevisions.revision, revision))).limit(1);
    if (!r) throw new NotFoundError("Revision");
    return r;
  }

  /** Restore = new revision whose content equals an older one (history is append-only). */
  async restoreRevision(actorId: string, projectId: string, revision: number, expectedRevision: number) {
    const r = await this.getRevision(actorId, projectId, revision);
    const res = await this.saveRevision(actorId, projectId, { expectedRevision, files: r.files, ir: r.ir, workspace: r.workspace, message: `Restored revision ${revision}` });
    await this.audit(actorId, "project.restore", projectId, { revision });
    return res;
  }

  /** Record the block coverage measured by the editor for the current revision (no new revision). */
  async setCoverage(actorId: string, projectId: string, coverageRatio: number): Promise<void> {
    if (!(coverageRatio >= 0 && coverageRatio <= 1)) throw new ValidationError("coverageRatio must be within 0..1");
    await this.assert(actorId, projectId, "editor");
    await this.db.update(projects).set({ coverageRatio }).where(eq(projects.id, projectId));
  }

  async rename(actorId: string, projectId: string, title: string): Promise<void> {
    await this.assert(actorId, projectId, "editor");
    const t = title.trim().slice(0, 120);
    if (!t) throw new ValidationError("Title is required");
    await this.db.update(projects).set({ title: t, updatedAt: new Date() }).where(eq(projects.id, projectId));
  }

  async updateSettings(actorId: string, projectId: string, patch: { boardFqbn?: string; description?: string; pinned?: boolean }): Promise<void> {
    await this.assert(actorId, projectId, "editor");
    await this.db.update(projects).set({ ...patch, updatedAt: new Date() }).where(eq(projects.id, projectId));
  }

  async duplicate(actorId: string, projectId: string, opts: { title?: string; fromRevision?: number } = {}): Promise<ProjectRow> {
    const p = await this.assert(actorId, projectId, "viewer");
    const rev = opts.fromRevision !== undefined ? await this.getRevision(actorId, projectId, opts.fromRevision) : await this.latestRevision(actorId, projectId);
    const deps = await this.dependencies(actorId, projectId);
    return this.create(actorId, {
      title: opts.title ?? `${p.title} (copy)`, description: p.description, boardFqbn: p.boardFqbn, files: rev.files, ir: rev.ir, workspace: rev.workspace,
      templateId: p.templateId ?? undefined, dependencies: deps.map((d) => ({ name: d.name, version: d.version, kind: d.kind, source: d.source })),
    });
  }

  async archive(actorId: string, projectId: string, archived: boolean): Promise<void> {
    await this.assert(actorId, projectId, "owner");
    await this.db.update(projects).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(eq(projects.id, projectId));
  }

  /** Soft delete (trash). */
  async trash(actorId: string, projectId: string): Promise<void> {
    await this.assert(actorId, projectId, "owner");
    await this.db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, projectId));
    await this.audit(actorId, "project.trash", projectId);
  }
  async restoreFromTrash(actorId: string, projectId: string): Promise<void> {
    await this.assert(actorId, projectId, "owner", { includeDeleted: true });
    await this.db.update(projects).set({ deletedAt: null }).where(eq(projects.id, projectId));
  }
  async deletePermanently(actorId: string, projectId: string): Promise<void> {
    await this.assert(actorId, projectId, "owner", { includeDeleted: true });
    await this.db.delete(projects).where(eq(projects.id, projectId));
    await this.audit(actorId, "project.delete", projectId);
  }

  async dependencies(actorId: string, projectId: string): Promise<DependencyRow[]> {
    await this.assert(actorId, projectId, "viewer");
    return this.db.select().from(projectDependencies).where(eq(projectDependencies.projectId, projectId)).orderBy(asc(projectDependencies.name));
  }
  async setDependencies(actorId: string, projectId: string, deps: Array<{ name: string; version?: string | null; kind?: string; source?: string }>): Promise<void> {
    await this.assert(actorId, projectId, "editor");
    await this.db.transaction(async (tx) => {
      await tx.delete(projectDependencies).where(eq(projectDependencies.projectId, projectId));
      for (const d of deps) {
        await tx.insert(projectDependencies).values({ id: newId(), projectId, name: d.name.slice(0, 120), version: d.version ?? null, kind: d.kind ?? "library", source: d.source ?? "user" }).onConflictDoNothing();
      }
    });
  }

  async addMember(actorId: string, projectId: string, userId: string, role: Exclude<Role, "owner">): Promise<void> {
    await this.assert(actorId, projectId, "owner");
    await this.db.insert(projectMembers).values({ projectId, userId, role }).onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role } });
  }

  /* compile jobs */
  async createCompileJob(actorId: string, projectId: string, j: { revision: number; fqbn: string; sourceHash: string; workerJobId?: string | null; status: string; error?: string | null }): Promise<CompileJobRow> {
    await this.assert(actorId, projectId, "editor");
    const [row] = await this.db.insert(compileJobs).values({ id: newId(), projectId, userId: actorId, revision: j.revision, fqbn: j.fqbn, sourceHash: j.sourceHash, workerJobId: j.workerJobId ?? null, status: j.status, error: j.error ?? null }).returning();
    return row!;
  }
  async getCompileJob(actorId: string, projectId: string, jobId: string): Promise<CompileJobRow> {
    await this.assert(actorId, projectId, "viewer");
    const [row] = await this.db.select().from(compileJobs).where(and(eq(compileJobs.id, jobId), eq(compileJobs.projectId, projectId))).limit(1);
    if (!row) throw new NotFoundError("Compile job");
    return row;
  }
  async updateCompileJob(actorId: string, projectId: string, jobId: string, patch: Partial<Pick<CompileJobRow, "status" | "diagnostics" | "sizes" | "toolchain" | "log" | "error" | "finishedAt" | "workerJobId">>): Promise<CompileJobRow> {
    await this.getCompileJob(actorId, projectId, jobId);
    const [row] = await this.db.update(compileJobs).set(patch).where(eq(compileJobs.id, jobId)).returning();
    if (patch.status && ["succeeded", "failed", "canceled", "timeout", "error"].includes(patch.status)) {
      await this.db.update(projects).set({ lastCompileStatus: patch.status }).where(eq(projects.id, projectId));
    }
    return row!;
  }
  async latestCompileJob(actorId: string, projectId: string): Promise<CompileJobRow | undefined> {
    await this.assert(actorId, projectId, "viewer");
    const [row] = await this.db.select().from(compileJobs).where(eq(compileJobs.projectId, projectId)).orderBy(desc(compileJobs.createdAt)).limit(1);
    return row;
  }

  async audit(actorId: string | null, action: string, targetId?: string, meta: Record<string, unknown> = {}): Promise<void> {
    await this.db.insert(auditEvents).values({ id: newId(), userId: actorId, action, targetType: "project", targetId: targetId ?? null, meta });
  }
}

/* -------------------------------- templates ------------------------------ */

export class TemplatesRepo {
  constructor(private db: Db) {}
  async upsert(t: { id: string; title: string; description: string; category: string; boardFqbn: string; files: StoredFile[]; dependencies: Array<{ name: string; version?: string }>; version?: number }): Promise<void> {
    await this.db.insert(templates).values({ ...t, version: t.version ?? 1 }).onConflictDoUpdate({ target: templates.id, set: { title: t.title, description: t.description, category: t.category, boardFqbn: t.boardFqbn, files: t.files, dependencies: t.dependencies, version: t.version ?? 1 } });
  }
  async list() { return this.db.select().from(templates).orderBy(asc(templates.title)); }
  async get(id: string) { const [r] = await this.db.select().from(templates).where(eq(templates.id, id)).limit(1); return r; }
}

/* ------------------------------- audit + rate ---------------------------- */

export class AuditRepo {
  constructor(private db: Db) {}
  async log(e: { userId?: string | null; action: string; targetType?: string; targetId?: string; ip?: string; meta?: Record<string, unknown> }): Promise<void> {
    await this.db.insert(auditEvents).values({ id: newId(), userId: e.userId ?? null, action: e.action, targetType: e.targetType ?? null, targetId: e.targetId ?? null, ip: e.ip ?? null, meta: e.meta ?? {} });
  }
  async listFor(userId: string, limit = 50) { return this.db.select().from(auditEvents).where(eq(auditEvents.userId, userId)).orderBy(desc(auditEvents.createdAt)).limit(limit); }
}

export class RateLimitRepo {
  constructor(private db: Db) {}
  /** Fixed-window counter. */
  async hit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    const now = new Date();
    const [row] = await this.db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
    if (!row || now.getTime() - row.windowStart.getTime() >= windowMs) {
      await this.db.insert(rateLimits).values({ key, count: 1, windowStart: now }).onConflictDoUpdate({ target: rateLimits.key, set: { count: 1, windowStart: now } });
      return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
    }
    const count = row.count + 1;
    await this.db.update(rateLimits).set({ count }).where(eq(rateLimits.key, key));
    const retryAfterMs = windowMs - (now.getTime() - row.windowStart.getTime());
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterMs: count <= limit ? 0 : retryAfterMs };
  }
  async reset(key: string): Promise<void> { await this.db.delete(rateLimits).where(eq(rateLimits.key, key)); }
}

export function repositories(db: Db) {
  return {
    users: new UsersRepo(db), sessions: new SessionsRepo(db), tokens: new TokensRepo(db), outbox: new OutboxRepo(db),
    preferences: new PreferencesRepo(db), projects: new ProjectsRepo(db), templates: new TemplatesRepo(db),
    audit: new AuditRepo(db), rateLimits: new RateLimitRepo(db),
  };
}
export type Repositories = ReturnType<typeof repositories>;
