import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/forms";
import { resetPasswordAction } from "@/app/actions/auth";

import { getT } from "@/i18n/server";

export async function generateMetadata() { return { title: (await getT())("meta.reset") }; }
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const t = await getT();
  return (
    <AuthShell title={t("auth.resetTitle")} footer={<Link className="text-accent hover:underline" href="/forgot-password">{t("auth.requestNewLink")}</Link>}>
      {token ? <ResetForm action={resetPasswordAction} token={token} /> : <p className="text-sm text-danger">{t("auth.resetNeedsLink")}</p>}
    </AuthShell>
  );
}
