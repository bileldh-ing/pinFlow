import { LegalPage } from "@/components/LegalPage";
export const metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";
export default function Privacy() {
  return <LegalPage source={`# Privacy\n\n*Draft — to be reviewed before a commercial launch.*\n\n- **What we store:** your email, a scrypt hash of your password, your preferences, your projects and their revision history, and compile job results.\n- **Where:** in the PinFlow database (cloud). Unsaved edits may also be kept in your browser’s IndexedDB until they are saved.\n- **Private by default:** projects are visible only to you unless you share them.\n- **No training:** your code is not used to train AI models.\n- **Compile logs** are kept with the compile job; temporary build directories are deleted after the job.\n- **Deletion:** delete projects any time, or delete your account in Profile settings — this removes your projects and revisions.\n- **Cookies:** one httpOnly session cookie, used only to keep you signed in.\n`} />;
}
