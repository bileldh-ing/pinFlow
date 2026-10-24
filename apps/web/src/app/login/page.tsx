import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/forms";
import { loginAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/server/auth";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to open your sketches." footer={<>New to PinFlow? <Link className="text-accent hover:underline" href="/signup">Create an account</Link></>}>
      <LoginForm action={loginAction} next={next} />
    </AuthShell>
  );
}
