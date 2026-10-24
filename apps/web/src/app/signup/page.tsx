import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/forms";
import { signupAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/server/auth";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <AuthShell title="Create your account" subtitle="Projects are private by default and saved to your account." footer={<>Already have an account? <Link className="text-accent hover:underline" href="/login">Sign in</Link></>}>
      <SignupForm action={signupAction} />
    </AuthShell>
  );
}
