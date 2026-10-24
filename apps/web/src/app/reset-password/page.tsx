import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/forms";
import { resetPasswordAction } from "@/app/actions/auth";

export const metadata = { title: "Choose a new password" };
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choose a new password" footer={<Link className="text-accent hover:underline" href="/forgot-password">Request a new link</Link>}>
      {token ? <ResetForm action={resetPasswordAction} token={token} /> : <p className="text-sm text-danger">This page needs the link from your reset email.</p>}
    </AuthShell>
  );
}
