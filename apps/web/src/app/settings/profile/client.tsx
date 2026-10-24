"use client";
import { useState, useTransition } from "react";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { ChangePasswordForm } from "@/components/auth/forms";
import { useTheme } from "@/components/ThemeToggle";
import { deleteAccountAction, savePreferencesAction } from "@/app/actions/projects";
import { resendVerificationAction, type FormState } from "@/app/actions/auth";

interface Props {
  user: { email: string; displayName: string; emailVerified: boolean };
  boards: Array<{ fqbn: string; name: string }>;
  prefs: { skillLevel: string; preferredBoard: string; layout: string; theme: string; editorFontSize: number };
  changePassword: (prev: FormState, form: FormData) => Promise<FormState>;
}

const sel = "h-10 w-full rounded-full border border-line-strong bg-surface-inner px-3 text-sm text-fg";

export function ProfileClient({ user, boards, prefs, changePassword }: Props) {
  const [, setTheme] = useTheme();
  const [name, setName] = useState(user.displayName);
  const [p, setP] = useState(prefs);
  const [msg, setMsg] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [del, setDel] = useState("");
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    const r = await savePreferencesAction({ displayName: name, skillLevel: p.skillLevel as "beginner", preferredBoard: p.preferredBoard, layout: p.layout as "side-by-side", theme: p.theme as "dark", editorFontSize: p.editorFontSize });
    if (!r.error) { setTheme(p.theme === "light" ? "light" : "dark"); try { localStorage.setItem("pf-layout-mode", p.layout); } catch { /* ignore */ } }
    setMsg(r.error ?? "Preferences saved.");
  });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Account</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="p-name">Display name</Label><Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
          <div><Label htmlFor="p-email">Email</Label><Input id="p-email" value={user.email} readOnly aria-readonly className="opacity-80" /></div>
        </div>
        <div id="verify" className="mt-3 text-sm">
          {user.emailVerified ? <span className="text-ok">Email confirmed.</span> : (
            <span className="text-warn">Email not confirmed. <button type="button" className="underline" onClick={() => start(async () => { const r = await resendVerificationAction(); setVerifyMsg(r.error ?? r.ok ?? null); })}>Resend verification email</button>{verifyMsg && <span className="ml-2 text-muted">{verifyMsg}</span>}</span>
          )}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Editor preferences</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="p-skill">Skill level</Label><select id="p-skill" className={sel} value={p.skillLevel} onChange={(e) => setP({ ...p, skillLevel: e.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
          <div><Label htmlFor="p-board">Preferred board</Label><select id="p-board" className={sel} value={p.preferredBoard} onChange={(e) => setP({ ...p, preferredBoard: e.target.value })}>{boards.map((b) => <option key={b.fqbn} value={b.fqbn}>{b.name}</option>)}</select></div>
          <div><Label htmlFor="p-layout">Default layout</Label><select id="p-layout" className={sel} value={p.layout} onChange={(e) => setP({ ...p, layout: e.target.value })}><option value="side-by-side">Side by side</option><option value="blocks-first">Blocks first</option><option value="code-first">Code first</option><option value="focus">Focus</option></select></div>
          <div><Label htmlFor="p-theme">Theme</Label><select id="p-theme" className={sel} value={p.theme} onChange={(e) => setP({ ...p, theme: e.target.value })}><option value="dark">Dark graphite</option><option value="light">Light</option></select></div>
          <div><Label htmlFor="p-font">Code font size</Label><Input id="p-font" type="number" min={10} max={24} value={p.editorFontSize} onChange={(e) => setP({ ...p, editorFontSize: Number(e.target.value) })} /></div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">{msg && <span role="status" className="text-sm text-muted">{msg}</span>}<Button variant="primary" onClick={save} disabled={pending}>{pending && <Spinner />}Save preferences</Button></div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Password</h2>
        <ChangePasswordForm action={changePassword} />
      </Card>
      <Card className="border-danger/30 p-5">
        <h2 className="font-semibold text-danger">Delete account</h2>
        <p className="mt-1 text-sm text-muted">Deletes your account, all projects and their revision history. Type your email to confirm.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input aria-label="Confirm email" value={del} onChange={(e) => setDel(e.target.value)} placeholder={user.email} className="max-w-xs" />
          <Button variant="danger" disabled={del.trim().toLowerCase() !== user.email || pending} onClick={() => start(async () => { const r = await deleteAccountAction(del); if (r?.error) setMsg(r.error); })}>Delete my account</Button>
        </div>
      </Card>
    </div>
  );
}
