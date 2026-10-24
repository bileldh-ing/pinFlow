import Link from "next/link";
import type { ReactNode } from "react";
import { getT } from "@/i18n/server";
import { SiteFooter, SiteHeader } from "./SiteChrome";

export async function DocShell({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  const t = await getT();
  const item = "pf-transition block rounded-full px-3.5 py-2 font-medium text-muted hover:bg-surface-hover hover:text-fg";
  return (
    <div className="min-h-dvh">
      <SiteHeader signedIn={signedIn} />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[220px_1fr]">
        <nav aria-label={t("docs.nav")} className="glass rounded-[var(--radius)] p-3 text-sm md:sticky md:top-24 md:self-start">
          <ul className="flex flex-wrap gap-1 md:flex-col">
            <li><Link className={item} href="/docs">{t("docs.gettingStarted")}</Link></li>
            <li><Link className={item} href="/docs#the-workbench">{t("docs.workbench")}</Link></li>
            <li><Link className={item} href="/docs#compiling">{t("docs.compiling")}</Link></li>
            <li><Link className={item} href="/docs/arduino-subset">{t("docs.subset")}</Link></li>
            <li><Link className={item} href="/docs#changelog">{t("docs.changelog")}</Link></li>
          </ul>
        </nav>
        <main id="main" className="glass min-w-0 rounded-[var(--radius)] px-5 py-4 sm:px-9 sm:py-6">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
