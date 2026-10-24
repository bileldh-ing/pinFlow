import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError, createDatabase, migrate, repositories, sourceHash, MIGRATIONS, type Database, type Repositories } from "../src/index";

let database: Database;
let repos: Repositories;
let alice: string;
let bob: string;
const ino = (c: string) => [{ path: "main.ino", content: c }];

beforeAll(async () => {
  database = await createDatabase({ dataDir: process.env.PGLITE_TEST_DIR ?? "memory://" });
  repos = repositories(database.db);
  alice = (await repos.users.create({ email: `Alice+${Date.now()}@Example.com`, passwordHash: "x", displayName: "Alice" })).id;
  bob = (await repos.users.create({ email: `bob+${Date.now()}@example.com`, passwordHash: "y" })).id;
});
afterAll(async () => { await database?.close(); });

describe("migrations", () => {
  it("embedded SQL equals migrations/*.sql and re-running is a no-op", async () => {
    const onDisk = readFileSync(path.join(__dirname, "..", "migrations", "0001_init.sql"), "utf8");
    expect(MIGRATIONS[0]!.sql).toBe(onDisk);
    expect(await migrate(database)).toEqual([]);
  });
});

describe("users, sessions, tokens", () => {
  it("emails are case-insensitive and unique", async () => {
    const u = await repos.users.findById(alice);
    expect((await repos.users.findByEmail(u!.email.toUpperCase()))?.id).toBe(alice);
    await expect(repos.users.create({ email: u!.email.toUpperCase(), passwordHash: "z" })).rejects.toThrow();
  });
  it("sessions validate, expire and revoke", async () => {
    const { token } = await repos.sessions.create(alice, 60_000);
    expect((await repos.sessions.validate(token))?.user.id).toBe(alice);
    expect(await repos.sessions.validate(token + "x")).toBeNull();
    await repos.sessions.revoke(token);
    expect(await repos.sessions.validate(token)).toBeNull();
    const expired = await repos.sessions.create(alice, -1);
    expect(await repos.sessions.validate(expired.token)).toBeNull();
  });
  it("tokens are single use, kind-scoped and expire", async () => {
    const t = await repos.tokens.issue(alice, "verify_email", 60_000);
    expect(await repos.tokens.consume(t, "reset_password")).toBeNull();
    expect(await repos.tokens.consume(t, "verify_email")).toBe(alice);
    expect(await repos.tokens.consume(t, "verify_email")).toBeNull();
    const old = await repos.tokens.issue(alice, "reset_password", -1000);
    expect(await repos.tokens.consume(old, "reset_password")).toBeNull();
  });
  it("rate limiter blocks after the limit", async () => {
    const key = `login:${Date.now()}`;
    for (let i = 0; i < 3; i++) expect((await repos.rateLimits.hit(key, 3, 60_000)).allowed).toBe(true);
    const r = await repos.rateLimits.hit(key, 3, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });
  it("preferences upsert", async () => {
    expect((await repos.preferences.get(alice)).layout).toBe("side-by-side");
    expect((await repos.preferences.update(alice, { layout: "code-first", skillLevel: "advanced" })).layout).toBe("code-first");
  });
});

describe("projects CRUD + revisions", () => {
  let pid: string;
  it("creates with revision 1 and files", async () => {
    const p = await repos.projects.create(alice, { title: "  Blink ", files: ino("void setup(){}\nvoid loop(){}\n"), dependencies: [{ name: "DHT sensor library", version: "1.4.6" }] });
    pid = p.id;
    expect(p.title).toBe("Blink");
    expect(p.activeRevision).toBe(1);
    expect(await repos.projects.files(alice, pid)).toEqual(ino("void setup(){}\nvoid loop(){}\n"));
    expect((await repos.projects.dependencies(alice, pid)).map((d) => d.name)).toEqual(["DHT sensor library"]);
  });
  it("rejects unsafe paths and empty titles", async () => {
    await expect(repos.projects.create(alice, { title: "x", files: [{ path: "../etc/passwd.ino", content: "" }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.projects.create(alice, { title: "x", files: [{ path: "/abs.ino", content: "" }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.projects.create(alice, { title: "x", files: [{ path: "evil.sh", content: "" }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.projects.create(alice, { title: "   ", files: ino("") })).rejects.toBeInstanceOf(ValidationError);
  });
  it("saves revisions with optimistic concurrency and detects conflicts", async () => {
    const r2 = await repos.projects.saveRevision(alice, pid, { expectedRevision: 1, files: ino("// v2"), workspace: { a: 1 }, ir: { items: [] } });
    expect(r2.revision).toBe(2);
    expect(r2.sourceHash).toBe(sourceHash(ino("// v2")));
    expect((await repos.projects.saveRevision(alice, pid, { expectedRevision: 1, files: ino("// v2") })).unchanged).toBe(true);
    const err = await repos.projects.saveRevision(alice, pid, { expectedRevision: 1, files: ino("// other tab") }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).currentRevision).toBe(2);
    expect((await repos.projects.saveRevision(alice, pid, { expectedRevision: 2, files: ino("// v3") })).revision).toBe(3);
    expect((await repos.projects.latestRevision(alice, pid)).files).toEqual(ino("// v3"));
  });
  it("lists history and restores an old revision as a new one", async () => {
    expect((await repos.projects.listRevisions(alice, pid)).map((h) => h.revision)).toEqual([3, 2, 1]);
    const r = await repos.projects.restoreRevision(alice, pid, 2, 3);
    expect(r.revision).toBe(4);
    expect(await repos.projects.files(alice, pid)).toEqual(ino("// v2"));
    expect((await repos.projects.getRevision(alice, pid, 4)).workspace).toEqual({ a: 1 });
  });
  it("rename, duplicate, archive, search, trash, restore, delete", async () => {
    await repos.projects.rename(alice, pid, "Blink LED");
    const dup = await repos.projects.duplicate(alice, pid);
    expect(dup.title).toBe("Blink LED (copy)");
    expect(await repos.projects.files(alice, dup.id)).toEqual(ino("// v2"));
    expect((await repos.projects.list(alice, { search: "copy" })).map((p) => p.id)).toEqual([dup.id]);
    await repos.projects.archive(alice, dup.id, true);
    expect((await repos.projects.list(alice)).map((p) => p.id)).not.toContain(dup.id);
    expect((await repos.projects.list(alice, { archived: true })).map((p) => p.id)).toContain(dup.id);
    await repos.projects.trash(alice, dup.id);
    await expect(repos.projects.get(alice, dup.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await repos.projects.list(alice, { deleted: true })).map((p) => p.id)).toContain(dup.id);
    await repos.projects.restoreFromTrash(alice, dup.id);
    expect((await repos.projects.get(alice, dup.id)).id).toBe(dup.id);
    await repos.projects.deletePermanently(alice, dup.id);
    await expect(repos.projects.get(alice, dup.id)).rejects.toBeInstanceOf(NotFoundError);
  });
  it("setCoverage records editor-measured coverage without creating a revision", async () => {
    const before = (await repos.projects.get(alice, pid)).activeRevision;
    await repos.projects.setCoverage(alice, pid, 0.75);
    const after = await repos.projects.get(alice, pid);
    expect(after.coverageRatio).toBeCloseTo(0.75);
    expect(after.activeRevision).toBe(before);
    await expect(repos.projects.setCoverage(alice, pid, 1.5)).rejects.toBeInstanceOf(ValidationError);
  });
  it("compile jobs are tied to revision + hash", async () => {
    const j = await repos.projects.createCompileJob(alice, pid, { revision: 4, fqbn: "arduino:avr:uno", sourceHash: "abc", status: "queued" });
    await repos.projects.updateCompileJob(alice, pid, j.id, { status: "failed", diagnostics: [{ line: 1 }], finishedAt: new Date() });
    expect((await repos.projects.latestCompileJob(alice, pid))?.revision).toBe(4);
    expect((await repos.projects.get(alice, pid)).lastCompileStatus).toBe("failed");
  });

  describe("tenant isolation", () => {
    it("user B cannot read, list, update, save, duplicate, compile or delete user A's project", async () => {
      expect((await repos.projects.list(bob)).length).toBe(0);
      const nf = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(NotFoundError);
      await nf(repos.projects.get(bob, pid));
      await nf(repos.projects.files(bob, pid));
      await nf(repos.projects.listRevisions(bob, pid));
      await nf(repos.projects.getRevision(bob, pid, 1));
      await nf(repos.projects.rename(bob, pid, "pwned"));
      await nf(repos.projects.saveRevision(bob, pid, { expectedRevision: 4, files: ino("pwned") }));
      await nf(repos.projects.restoreRevision(bob, pid, 1, 4));
      await nf(repos.projects.duplicate(bob, pid));
      await nf(repos.projects.archive(bob, pid, true));
      await nf(repos.projects.trash(bob, pid));
      await nf(repos.projects.deletePermanently(bob, pid));
      await nf(repos.projects.updateSettings(bob, pid, { boardFqbn: "x" }));
      await nf(repos.projects.setCoverage(bob, pid, 0.5));
      await nf(repos.projects.setDependencies(bob, pid, []));
      await nf(repos.projects.createCompileJob(bob, pid, { revision: 1, fqbn: "x", sourceHash: "x", status: "queued" }));
      await nf(repos.projects.addMember(bob, pid, bob, "editor"));
      expect((await repos.projects.get(alice, pid)).title).toBe("Blink LED");
      expect(await repos.projects.files(alice, pid)).toEqual(ino("// v2"));
    });
    it("viewer membership grants read but not write", async () => {
      await repos.projects.addMember(alice, pid, bob, "viewer");
      expect((await repos.projects.get(bob, pid)).role).toBe("viewer");
      await expect(repos.projects.saveRevision(bob, pid, { expectedRevision: 4, files: ino("x") })).rejects.toBeInstanceOf(NotFoundError);
      await expect(repos.projects.trash(bob, pid)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
