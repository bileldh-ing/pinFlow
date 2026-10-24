"use server";
import { redirect } from "next/navigation";
import { repos } from "@/server/db";
import { clientIp, endSession, getCurrentUser, startSession } from "@/server/auth";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/server/password";
import { loginSchema, passwordSchema, resetRequestSchema, resetSchema, signupSchema } from "@/server/schemas";
import { appUrl, sendMail } from "@/server/mail";
import { getT } from "@/i18n/server";
import { tMaybe } from "@/i18n/content";
import type { TFunction } from "@/i18n/translate";

export interface FormState { error?: string; fieldErrors?: Record<string, string>; ok?: string; }

const VERIFY_TTL = 1000 * 60 * 60 * 24;
const RESET_TTL = 1000 * 60 * 60;

/** Validation messages are message keys (see server/schemas.ts); translate them for the request locale. */
function fieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>, t: TFunction): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) { const k = String(i.path[0] ?? "form"); if (!out[k]) out[k] = tMaybe(t, i.message); }
  return out;
}

function safeNext(next: unknown): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/dashboard";
}

async function sendVerification(userId: string, email: string) {
  const r = await repos();
  const token = await r.tokens.issue(userId, "verify_email", VERIFY_TTL);
  await sendMail({ to: email, kind: "verify_email", subject: "Confirm your PinFlow Studio email", body: `Confirm your email address:\n${appUrl()}/verify-email?token=${encodeURIComponent(token)}\n\nThe link expires in 24 hours.` });
}

export async function signupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({ email: form.get("email"), password: form.get("password"), displayName: form.get("displayName") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues, await getT()) };
  const r = await repos();
  const ip = await clientIp();
  const rl = await r.rateLimits.hit(`signup:${ip}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) return { error: (await getT())("auth.err.tooManySignups") };
  if (await r.users.findByEmail(parsed.data.email)) return { fieldErrors: { email: (await getT())("auth.err.emailExists") } };
  const user = await r.users.create({ email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password), displayName: parsed.data.displayName });
  await r.audit.log({ userId: user.id, action: "auth.signup", ip });
  await sendVerification(user.id, user.email);
  await startSession(user.id);
  redirect("/onboarding");
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues, await getT()) };
  const r = await repos();
  const ip = await clientIp();
  const perAccount = await r.rateLimits.hit(`login:${ip}:${parsed.data.email}`, 5, 15 * 60 * 1000);
  const perIp = await r.rateLimits.hit(`login-ip:${ip}`, 50, 15 * 60 * 1000);
  if (!perAccount.allowed || !perIp.allowed) {
    const mins = Math.ceil(Math.max(perAccount.retryAfterMs, perIp.retryAfterMs) / 60000);
    return { error: (await getT())("auth.err.tooManyLogins", { mins }) };
  }
  const user = await r.users.findByEmail(parsed.data.email);
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await r.audit.log({ userId: user?.id ?? null, action: "auth.login_failed", ip });
    return { error: (await getT())("auth.err.badCredentials") };
  }
  await r.rateLimits.reset(`login:${ip}:${parsed.data.email}`);
  await r.audit.log({ userId: user.id, action: "auth.login", ip });
  await startSession(user.id);
  const prefs = await r.preferences.get(user.id);
  redirect(prefs.onboardedAt ? safeNext(form.get("next")) : "/onboarding");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}

export async function requestResetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues, await getT()) };
  const r = await repos();
  const ip = await clientIp();
  const rl = await r.rateLimits.hit(`reset:${ip}`, 10, 60 * 60 * 1000);
  if (rl.allowed) {
    const user = await r.users.findByEmail(parsed.data.email);
    if (user) {
      const token = await r.tokens.issue(user.id, "reset_password", RESET_TTL);
      await sendMail({ to: user.email, kind: "reset_password", subject: "Reset your PinFlow Studio password", body: `Reset your password:\n${appUrl()}/reset-password?token=${encodeURIComponent(token)}\n\nThe link expires in 1 hour. If you did not ask for this, ignore this email.` });
      await r.audit.log({ userId: user.id, action: "auth.reset_requested", ip });
    }
  }
  return { ok: (await getT())("auth.ok.resetSent") };
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({ token: form.get("token"), password: form.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues, await getT()) };
  const r = await repos();
  const userId = await r.tokens.consume(parsed.data.token, "reset_password");
  if (!userId) return { error: (await getT())("auth.err.resetInvalid") };
  await r.users.setPassword(userId, await hashPassword(parsed.data.password));
  await r.sessions.revokeAll(userId);
  await r.audit.log({ userId, action: "auth.password_reset", ip: await clientIp() });
  await startSession(userId);
  redirect("/dashboard");
}

export async function verifyEmailAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const r = await repos();
  const userId = await r.tokens.consume(token, "verify_email");
  if (!userId) return { error: (await getT())("auth.err.verifyInvalid") };
  await r.users.markVerified(userId);
  await r.audit.log({ userId, action: "auth.email_verified" });
  return { ok: (await getT())("auth.ok.verified") };
}

export async function resendVerificationAction(): Promise<FormState> {
  const u = await getCurrentUser();
  if (!u) return { error: (await getT())("auth.err.signInFirst") };
  if (u.emailVerified) return { ok: (await getT())("auth.ok.alreadyVerified") };
  const r = await repos();
  const rl = await r.rateLimits.hit(`verify:${u.id}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) return { error: (await getT())("auth.err.tooManyRequests") };
  await sendVerification(u.id, u.email);
  return { ok: (await getT())("auth.ok.verifySent") };
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const u = await getCurrentUser();
  if (!u) return { error: (await getT())("auth.err.signInFirst") };
  const current = String(form.get("current") ?? "");
  const next = passwordSchema.safeParse(form.get("password"));
  if (!next.success) { const t = await getT(); return { fieldErrors: { password: tMaybe(t, next.error.issues[0]?.message) || t("auth.err.invalidPassword") } }; }
  const r = await repos();
  const user = await r.users.findById(u.id);
  if (!user || !(await verifyPassword(current, user.passwordHash))) return { fieldErrors: { current: (await getT())("auth.err.currentWrong") } };
  await r.users.setPassword(u.id, await hashPassword(next.data));
  await r.sessions.revokeAll(u.id);
  await startSession(u.id);
  await r.audit.log({ userId: u.id, action: "auth.password_changed" });
  return { ok: (await getT())("auth.ok.passwordUpdated") };
}
