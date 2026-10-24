import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyForm } from "@/components/auth/forms";
import { verifyEmailAction } from "@/app/actions/auth";

import { getT } from "@/i18n/server";

export async function generateMetadata() { return { title: (await getT())("meta.verify") }; }
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const t = await getT();
  return (
    <AuthShell title={t("auth.verifyTitle")} subtitle={t("auth.verifySub")}>
      {token ? <VerifyForm action={verifyEmailAction} token={token} /> : <p className="text-sm text-danger">{t("auth.verifyNeedsLink")}</p>}
    </AuthShell>
  );
}
