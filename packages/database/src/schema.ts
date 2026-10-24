/** Drizzle schema for PinFlow Studio (spec §8.2). Mirrors migrations/0001_init.sql. */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull().default(""),
  avatarUrl: text("avatar_url"),
  emailVerifiedAt: ts("email_verified_at"),
  createdAt: ts("created_at").notNull().default(sql`now()`),
  updatedAt: ts("updated_at").notNull().default(sql`now()`),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256(token) — the raw token only lives in the cookie
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().default(sql`now()`),
  expiresAt: ts("expires_at").notNull(),
  lastSeenAt: ts("last_seen_at").notNull().default(sql`now()`),
  userAgent: text("user_agent"),
  ip: text("ip"),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const authTokens = pgTable("auth_tokens", {
  id: text("id").primaryKey(), // sha256(token)
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // verify_email | reset_password
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().default(sql`now()`),
});

export const mailOutbox = pgTable("mail_outbox", {
  id: text("id").primaryKey(),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull(),
  delivered: boolean("delivered").notNull().default(false),
  createdAt: ts("created_at").notNull().default(sql`now()`),
});

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  skillLevel: text("skill_level").notNull().default("beginner"),
  preferredBoard: text("preferred_board").notNull().default("esp32:esp32:esp32"),
  layout: text("layout").notNull().default("side-by-side"),
  theme: text("theme").notNull().default("dark"),
  language: text("language").notNull().default("en"),
  editorFontSize: integer("editor_font_size").notNull().default(13),
  onboardedAt: ts("onboarded_at"),
  extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().default(sql`now()`),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  visibility: text("visibility").notNull().default("private"),
  activeRevision: integer("active_revision").notNull().default(1),
  boardFqbn: text("board_fqbn").notNull().default("esp32:esp32:esp32"),
  coverageRatio: real("coverage_ratio"),
  lastCompileStatus: text("last_compile_status"),
  templateId: text("template_id"),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: ts("created_at").notNull().default(sql`now()`),
  updatedAt: ts("updated_at").notNull().default(sql`now()`),
  archivedAt: ts("archived_at"),
  deletedAt: ts("deleted_at"),
}, (t) => [index("projects_owner_idx").on(t.ownerId)]);

export const projectMembers = pgTable("project_members", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // owner | editor | viewer
  createdAt: ts("created_at").notNull().default(sql`now()`),
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] })]);

export interface StoredFile { path: string; content: string; }

export const projectFiles = pgTable("project_files", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  fileType: text("file_type").notNull(),
  currentRevision: integer("current_revision").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  updatedAt: ts("updated_at").notNull().default(sql`now()`),
}, (t) => [uniqueIndex("project_files_path_uq").on(t.projectId, t.path)]);

export const projectRevisions = pgTable("project_revisions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  parentRevision: integer("parent_revision"),
  files: jsonb("files").$type<StoredFile[]>().notNull(),
  ir: jsonb("ir").$type<unknown>(),
  workspace: jsonb("workspace").$type<unknown>(),
  sourceHash: text("source_hash").notNull(),
  message: text("message").notNull().default(""),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: ts("created_at").notNull().default(sql`now()`),
}, (t) => [uniqueIndex("project_revisions_uq").on(t.projectId, t.revision)]);

export const projectDependencies = pgTable("project_dependencies", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("library"),
  name: text("name").notNull(),
  version: text("version"),
  source: text("source").notNull().default("user"),
}, (t) => [uniqueIndex("project_dependencies_uq").on(t.projectId, t.kind, t.name)]);

export const boardProfiles = pgTable("board_profiles", {
  fqbn: text("fqbn").primaryKey(),
  name: text("name").notNull(),
  architecture: text("architecture").notNull(),
  pinMetadataVersion: text("pin_metadata_version").notNull(),
  rules: jsonb("rules").$type<unknown>().notNull().default({}),
});

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  boardFqbn: text("board_fqbn").notNull(),
  version: integer("version").notNull().default(1),
  files: jsonb("files").$type<StoredFile[]>().notNull(),
  dependencies: jsonb("dependencies").$type<Array<{ name: string; version?: string }>>().notNull().default([]),
  createdAt: ts("created_at").notNull().default(sql`now()`),
});

export const compileJobs = pgTable("compile_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  fqbn: text("fqbn").notNull(),
  sourceHash: text("source_hash").notNull(),
  workerJobId: text("worker_job_id"),
  status: text("status").notNull(),
  diagnostics: jsonb("diagnostics").$type<unknown[]>().notNull().default([]),
  sizes: jsonb("sizes").$type<unknown>(),
  toolchain: jsonb("toolchain").$type<unknown>(),
  log: text("log").notNull().default(""),
  error: text("error"),
  createdAt: ts("created_at").notNull().default(sql`now()`),
  finishedAt: ts("finished_at"),
}, (t) => [index("compile_jobs_project_idx").on(t.projectId)]);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  ip: text("ip"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts("created_at").notNull().default(sql`now()`),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: ts("window_start").notNull(),
});

export const schema = {
  users, sessions, authTokens, mailOutbox, userPreferences, projects, projectMembers, projectFiles, projectRevisions,
  projectDependencies, boardProfiles, templates, compileJobs, auditEvents, rateLimits,
};
