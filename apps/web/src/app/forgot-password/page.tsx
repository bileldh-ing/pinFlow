import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/forms";
import { requestResetAction } from "@/app/actions/auth";

import { getT } from "@/i18n/server";

export async function generateMetadata() { return { title: (await getT())("meta.forgot") }; }
export default async function ForgotPage() {
  const t = await getT();
  return (
    <AuthShell title={t("auth.forgotTitle")} subtitle={t("auth.forgotSub")} footer={<Link className="text-accent hover:underline" href="/login">{t("auth.backToSignIn")}</Link>}>
      <ForgotForm action={requestResetAction} />
    </AuthShell>
  );
}
