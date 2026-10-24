import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/forms";
import { signupAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/server/auth";
import { getT } from "@/i18n/server";

export async function generateMetadata() { return { title: (await getT())("meta.signUp") }; }
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const t = await getT();
  return (
    <AuthShell title={t("auth.signupTitle")} subtitle={t("auth.signupSub")} footer={<>{t("auth.signupFooter")} <Link className="text-accent hover:underline" href="/login">{t("auth.signInLink")}</Link></>}>
      <SignupForm action={signupAction} />
    </AuthShell>
  );
}
