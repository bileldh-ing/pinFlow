"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions/auth";
import { Button, FieldError, Input, Label, Spinner } from "../ui";
import { useT } from "@/i18n/client";
import { tMaybe } from "@/i18n/content";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>{pending && <Spinner />}{children}</Button>;
}

function Field({ name, label, type = "text", autoComplete, error, defaultValue, hint }: { name: string; label: string; type?: string; autoComplete?: string; error?: string; defaultValue?: string; hint?: string }) {
  const t = useT();
  error = error ? tMaybe(t, error) : error;
  const errId = `${name}-err`;
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} autoComplete={autoComplete} defaultValue={defaultValue} aria-invalid={!!error} aria-describedby={error ? errId : undefined} required={type !== "hidden" && name !== "displayName"} />
      {hint && !error && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
      <FieldError id={errId}>{error}</FieldError>
    </div>
  );
}

function Banner({ state }: { state: FormState }) {
  const t = useT();
  if (state.error) return <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{tMaybe(t, state.error)}</div>;
  if (state.ok) return <div role="status" className="rounded-2xl border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">{tMaybe(t, state.ok)}</div>;
  return null;
}

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function SignupForm({ action }: { action: Action }) {
  const t = useT();
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Banner state={state} />
      <Field name="displayName" label={t("auth.nameOptional")} autoComplete="name" error={state.fieldErrors?.displayName} />
      <Field name="email" label={t("auth.email")} type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <Field name="password" label={t("auth.password")} type="password" autoComplete="new-password" error={state.fieldErrors?.password} hint={t("auth.passwordHint")} />
      <Submit>{t("auth.createAccount")}</Submit>
    </form>
  );
}

export function LoginForm({ action, next }: { action: Action; next?: string }) {
  const t = useT();
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Banner state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field name="email" label={t("auth.email")} type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <Field name="password" label={t("auth.password")} type="password" autoComplete="current-password" error={state.fieldErrors?.password} />
      <div className="flex justify-end text-sm"><Link className="text-accent hover:underline" href="/forgot-password">{t("auth.forgotLink")}</Link></div>
      <Submit>{t("auth.signIn")}</Submit>
    </form>
  );
}

export function ForgotForm({ action }: { action: Action }) {
  const t = useT();
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Banner state={state} />
      <Field name="email" label={t("auth.email")} type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <Submit>{t("auth.sendReset")}</Submit>
    </form>
  );
}

export function ResetForm({ action, token }: { action: Action; token: string }) {
  const t = useT();
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Banner state={state} />
      <input type="hidden" name="token" value={token} />
      <Field name="password" label={t("auth.newPassword")} type="password" autoComplete="new-password" error={state.fieldErrors?.password ?? state.fieldErrors?.token} hint={t("auth.passwordHint")} />
      <Submit>{t("auth.setNewPassword")}</Submit>
    </form>
  );
}

export function VerifyForm({ action, token }: { action: Action; token: string }) {
  const t = useT();
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <Banner state={state} />
      <input type="hidden" name="token" value={token} />
      {!state.ok && <Submit>{t("auth.confirmEmail")}</Submit>}
      {state.ok && <Link className="block text-center text-sm text-accent hover:underline" href="/dashboard">{t("auth.goDashboard")}</Link>}
    </form>
  );
}

export function ChangePasswordForm({ action }: { action: Action }) {
  const t = useT();
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Banner state={state} />
      <Field name="current" label={t("auth.currentPassword")} type="password" autoComplete="current-password" error={state.fieldErrors?.current} />
      <Field name="password" label={t("auth.newPassword")} type="password" autoComplete="new-password" error={state.fieldErrors?.password} />
      <Submit>{t("auth.changePassword")}</Submit>
    </form>
  );
}
