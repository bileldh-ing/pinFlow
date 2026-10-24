import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/forms";
import { loginAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/server/auth";
import { getT } from "@/i18n/server";

export async function generateMetadata() { return { title: (await getT())("meta.signIn") }; }
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  const t = await getT();
  return (
    <AuthShell title={t("auth.loginTitle")} subtitle={t("auth.loginSub")} footer={<>{t("auth.loginFooter")} <Link className="text-accent hover:underline" href="/signup">{t("auth.createAccountLink")}</Link></>}>
      <LoginForm action={loginAction} next={next} />
    </AuthShell>
  );
}
