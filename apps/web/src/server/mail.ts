import "server-only";
import { repos } from "./db";

/**
 * Mail delivery. Without SMTP configuration PinFlow uses a DEV OUTBOX: the
 * message is stored in the mail_outbox table, logged to the server console and
 * viewable at /dev/outbox (disabled when NODE_ENV=production unless
 * PINFLOW_DEV_OUTBOX=1). Real SMTP delivery needs SMTP_HOST/SMTP_PORT/
 * SMTP_USER/SMTP_PASS/MAIL_FROM and a mail transport — not bundled yet.
 */
export function mailMode(): "dev-outbox" | "smtp-unconfigured" {
  return process.env.SMTP_HOST ? "smtp-unconfigured" : "dev-outbox";
}

export function devOutboxEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PINFLOW_DEV_OUTBOX === "1";
}

export async function sendMail(m: { to: string; subject: string; body: string; kind: string }): Promise<void> {
  const r = await repos();
  await r.outbox.add({ ...m, to: m.to.toLowerCase() });
  // eslint-disable-next-line no-console
  console.info(`[pinflow:mail:${mailMode()}] to=${m.to} subject="${m.subject}"\n${m.body}`);
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
