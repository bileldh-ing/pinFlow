/**
 * Database connection. Default: embedded PGlite (Postgres in WASM) stored in
 * PGLITE_DIR (default apps/web/.pglite-data). Set DATABASE_URL=postgres://…
 * to use a real PostgreSQL server through node-postgres instead (same schema,
 * same migrations).
 */
import path from "node:path";
import { sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { schema } from "./schema";
import { MIGRATIONS } from "./migrations";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  kind: "pglite" | "postgres";
  /** Execute a multi-statement SQL script (migrations). */
  exec(sqlText: string): Promise<void>;
  close(): Promise<void>;
}

export interface CreateDatabaseOptions {
  /** postgres:// URL; defaults to process.env.DATABASE_URL. */
  url?: string;
  /** PGlite data dir; "memory://" for in-memory. Defaults to PGLITE_DIR or apps/web/.pglite-data. */
  dataDir?: string;
  migrate?: boolean;
}

export function defaultPgliteDir(): string {
  if (process.env.PGLITE_DIR) return process.env.PGLITE_DIR;
  const cwd = process.cwd();
  if (path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps") return path.join(cwd, ".pglite-data");
  return path.join(cwd, "apps", "web", ".pglite-data");
}

export async function createDatabase(opts: CreateDatabaseOptions = {}): Promise<Database> {
  const url = opts.url ?? process.env.DATABASE_URL;
  let database: Database;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const pgMod = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const Pool = (pgMod as unknown as { default?: typeof pgMod }).default?.Pool ?? pgMod.Pool;
    const pool = new Pool({ connectionString: url, max: 10 });
    database = {
      db: drizzle(pool, { schema }) as unknown as Db,
      kind: "postgres",
      exec: async (s) => { await pool.query(s); },
      close: async () => { await pool.end(); },
    };
  } else {
    const dir = opts.dataDir ?? defaultPgliteDir();
    const client = dir === "memory://" ? new PGlite() : new PGlite(dir);
    await client.waitReady;
    database = {
      db: drizzlePglite(client, { schema }) as unknown as Db,
      kind: "pglite",
      exec: async (s) => { await client.exec(s); },
      close: async () => { await client.close(); },
    };
  }
  if (opts.migrate !== false) await migrate(database);
  return database;
}

export async function migrate(database: Database): Promise<string[]> {
  await database.exec(`CREATE TABLE IF NOT EXISTS __pinflow_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`);
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    const safeId = m.id.replace(/[^a-z0-9_]/gi, "");
    const res = (await database.db.execute(sql.raw(`SELECT 1 FROM __pinflow_migrations WHERE id = '${safeId}'`))) as unknown as { rows?: unknown[] } | unknown[];
    const rows = Array.isArray(res) ? res : (res.rows ?? []);
    if (rows.length) continue;
    await database.exec(`BEGIN;\n${m.sql}\nINSERT INTO __pinflow_migrations (id) VALUES ('${safeId}');\nCOMMIT;`);
    applied.push(m.id);
  }
  return applied;
}
