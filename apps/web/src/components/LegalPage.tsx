import { DocShell } from "./DocShell";
import { Markdown } from "./Markdown";
import { getCurrentUser } from "@/server/auth";

export async function LegalPage({ source }: { source: string }) {
  const user = await getCurrentUser().catch(() => null);
  return <DocShell signedIn={!!user}><Markdown source={source} /></DocShell>;
}
