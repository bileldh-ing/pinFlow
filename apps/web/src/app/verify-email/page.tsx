import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyForm } from "@/components/auth/forms";
import { verifyEmailAction } from "@/app/actions/auth";

export const metadata = { title: "Confirm email" };
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Confirm your email" subtitle="One click and you’re done.">
      {token ? <VerifyForm action={verifyEmailAction} token={token} /> : <p className="text-sm text-danger">This page needs the link from your verification email.</p>}
    </AuthShell>
  );
}
