import { DocShell } from "./DocShell";
import { Markdown } from "./Markdown";
import { getCurrentUser } from "@/server/auth";
import { getI18n } from "@/i18n/server";

/** Legal text is authoritative in English; other locales get a short note above it. */
export async function LegalPage({ source, localized = false }: { source: string; localized?: boolean }) {
  const user = await getCurrentUser().catch(() => null);
  const { locale, t } = await getI18n();
  if (localized || locale === "en") return <DocShell signedIn={!!user}><Markdown source={source} /></DocShell>;
  return (
    <DocShell signedIn={!!user}>
      <p className="mb-4 rounded-2xl border border-line bg-surface-inner px-4 py-2.5 text-sm text-muted" data-testid="legal-english-note">{t("legal.englishOnly")}</p>
      <div lang="en" dir="ltr"><Markdown source={source} /></div>
    </DocShell>
  );
}
