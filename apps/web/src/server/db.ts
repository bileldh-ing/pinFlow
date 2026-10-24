import "server-only";
import { createDatabase, repositories, type Database, type Repositories } from "@pinflow/database";

/**
 * One database per server process (PGlite holds an exclusive lock on its data
 * dir). Cached on globalThis so Next dev HMR does not open a second instance.
 */
const g = globalThis as unknown as { __pinflowDb?: Promise<{ database: Database; repos: Repositories }> };

/** Serverless hosts (Vercel) have no persistent filesystem: embedded PGlite would silently lose data. */
export function assertPersistentDatabase(env: NodeJS.ProcessEnv = process.env): void {
  const hasPg = !!env.DATABASE_URL && /^postgres(ql)?:\/\//.test(env.DATABASE_URL);
  if ((env.VERCEL || env.PINFLOW_REQUIRE_DATABASE_URL === "1") && !hasPg) {
    throw new Error("DATABASE_URL (postgres://…) is required on serverless deployments such as Vercel — the embedded PGlite database cannot persist there. Use a hosted Postgres (e.g. Neon) and set DATABASE_URL.");
  }
}

export function getDb(): Promise<{ database: Database; repos: Repositories }> {
  if (!g.__pinflowDb) {
    assertPersistentDatabase();
    g.__pinflowDb = createDatabase().then((database) => ({ database, repos: repositories(database.db) }))
      .catch((e) => { g.__pinflowDb = undefined; throw e; });
  }
  return g.__pinflowDb;
}

export async function repos(): Promise<Repositories> {
  return (await getDb()).repos;
}
