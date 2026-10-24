import { describe, expect, it } from "vitest";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/server/password";
import { loginSchema, signupSchema, saveSchema, fqbnSchema } from "@/server/schemas";
import { sourceHashBrowser } from "@/lib/hash";
import { sourceHash } from "@pinflow/database";

describe("password hashing (scrypt)", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong horse battery", a)).toBe(false);
  });
  it("rejects malformed hashes and the dummy hash", async () => {
    expect(await verifyPassword("x", "plain")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$8$1$aa$bb")).toBe(false);
    expect(await verifyPassword("anything", DUMMY_HASH)).toBe(false);
  });
});

describe("validation schemas", () => {
  it("signup normalizes email and enforces password length", () => {
    expect(signupSchema.parse({ email: " A@B.io ", password: "0123456789" }).email).toBe("a@b.io");
    expect(signupSchema.safeParse({ email: "nope", password: "0123456789" }).success).toBe(false);
    expect(signupSchema.safeParse({ email: "a@b.io", password: "short" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.io", password: "" }).success).toBe(false);
  });
  it("save payload and FQBN validation", () => {
    expect(saveSchema.safeParse({ expectedRevision: 0, files: [{ path: "a.ino", content: "" }] }).success).toBe(false);
    expect(saveSchema.safeParse({ expectedRevision: 1, files: [] }).success).toBe(false);
    expect(fqbnSchema.safeParse("esp32:esp32:esp32").success).toBe(true);
    expect(fqbnSchema.safeParse("arduino:avr:uno; rm -rf /").success).toBe(false);
  });
});

describe("source hash", () => {
  it("browser hash equals the server hash (compile 'outdated' detection)", async () => {
    const files = [{ path: "b.h", content: "int x;" }, { path: "a.ino", content: "void setup(){}\nvoid loop(){} // é" }];
    expect(await sourceHashBrowser(files)).toBe(sourceHash(files));
  });
});
