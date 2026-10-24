import { notFound } from "next/navigation";
import { repos } from "@/server/db";
import { devOutboxEnabled, mailMode } from "@/server/mail";
import { getCurrentUser } from "@/server/auth";

export const metadata = { title: "Dev mail outbox" };
export const dynamic = "force-dynamic";

/** DEVELOPMENT ONLY: shows mail that would have been sent. Disabled in production unless PINFLOW_DEV_OUTBOX=1. */
export default async function OutboxPage() {
  if (!devOutboxEnabled()) notFound();
  const user = await getCurrentUser();
  const r = await repos();
  const mails = user ? await r.outbox.listFor(user.email) : await r.outbox.listAll(30);
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 rounded-2xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-warn">
        <strong>Development mail outbox.</strong> No email was actually delivered (mode: {mailMode()}). Configure SMTP for production — see README.
      </div>
      <h1 className="mb-4 text-2xl font-semibold">Outbox {user ? `for ${user.email}` : "(all recipients)"}</h1>
      {mails.length === 0 && <p className="text-muted">No messages.</p>}
      <ul className="space-y-4">
        {mails.map((m) => (
          <li key={m.id} className="glass rounded-xl p-4" data-testid="outbox-mail">
            <div className="text-xs text-faint">{m.createdAt.toISOString()} · {m.kind} · to {m.toAddress}</div>
            <div className="mt-1 font-medium">{m.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-muted">{m.body}</pre>
          </li>
        ))}
      </ul>
    </main>
  );
}
