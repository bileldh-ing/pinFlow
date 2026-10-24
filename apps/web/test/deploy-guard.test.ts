import { describe, expect, it } from "vitest";
import { assertPersistentDatabase } from "@/server/db";

describe("serverless database guard", () => {
  it("refuses embedded PGlite on Vercel", () => {
    expect(() => assertPersistentDatabase({ VERCEL: "1" } as unknown as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
    expect(() => assertPersistentDatabase({ VERCEL: "1", DATABASE_URL: "file:./x" } as unknown as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
  it("accepts a postgres URL on Vercel and PGlite locally", () => {
    expect(() => assertPersistentDatabase({ VERCEL: "1", DATABASE_URL: "postgres://u:p@db.neon.tech/app" } as unknown as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertPersistentDatabase({ VERCEL: "1", DATABASE_URL: "postgresql://u@h/app" } as unknown as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertPersistentDatabase({} as unknown as NodeJS.ProcessEnv)).not.toThrow();
  });
});
