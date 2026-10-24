import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/forms";
import { requestResetAction } from "@/app/actions/auth";

export const metadata = { title: "Reset password" };
export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a single-use link that expires in one hour." footer={<Link className="text-accent hover:underline" href="/login">Back to sign in</Link>}>
      <ForgotForm action={requestResetAction} />
    </AuthShell>
  );
}
