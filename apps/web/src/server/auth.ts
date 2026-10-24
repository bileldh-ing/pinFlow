import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRow } from "@pinflow/database";
import { repos } from "./db";

export const SESSION_COOKIE = "pf_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days, sliding

export interface CurrentUser { id: string; email: string; displayName: string; emailVerified: boolean; }

function toCurrent(u: UserRow): CurrentUser {
  return { id: u.id, email: u.email, displayName: u.displayName || u.email.split("@")[0]!, emailVerified: !!u.emailVerifiedAt };
}

function secureCookies(): boolean {
  if (process.env.COOKIE_SECURE === "0") return false;
  if (process.env.COOKIE_SECURE === "1") return true;
  return process.env.NODE_ENV === "production" && !(process.env.APP_URL ?? "").startsWith("http://");
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

export async function startSession(userId: string): Promise<void> {
  const h = await headers();
  const r = await repos();
  const { token, expiresAt } = await r.sessions.create(userId, SESSION_TTL_MS, { userAgent: h.get("user-agent") ?? undefined, ip: await clientIp() });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/", expires: expiresAt });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await (await repos()).sessions.revoke(token);
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await (await repos()).sessions.validate(token, { slideMs: SESSION_TTL_MS });
  return res ? toCurrent(res.user) : null;
}

export async function requireUser(next?: string): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return u;
}

/** Origin check for state-changing route handlers (CSRF defence in addition to SameSite=Lax). */
export async function assertSameOrigin(req: Request): Promise<boolean> {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetch from older browsers / non-browser clients carry no cookie anyway
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}
