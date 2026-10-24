import { DocShell } from "@/components/DocShell";
import { Markdown } from "@/components/Markdown";
import { getCurrentUser } from "@/server/auth";
import { getI18n } from "@/i18n/server";
import { DOCS_BODY } from "@/i18n/docs-content";

export async function generateMetadata() { return { title: (await getI18n()).t("meta.docs") }; }
export const dynamic = "force-dynamic";

export default async function DocsPage() {
  const user = await getCurrentUser().catch(() => null);
  const { locale } = await getI18n();
  return <DocShell signedIn={!!user}><Markdown source={DOCS_BODY[locale]} /></DocShell>;
}
