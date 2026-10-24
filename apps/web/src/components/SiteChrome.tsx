import Link from "next/link";
import { getT } from "@/i18n/server";
import { Logo } from "./Logo";
import { HeaderToggles } from "./ThemeToggle";
import { ButtonLink } from "./ui";

export async function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  const t = await getT();
  const link = "pf-transition rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg";
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
      <div className="glass mx-auto flex h-14 max-w-6xl items-center gap-3 rounded-full ps-4 pe-2 sm:ps-5">
        <Link href="/" aria-label={t("common.home")} className="shrink-0"><Logo /></Link>
        <nav aria-label={t("nav.primary")} className="ms-2 hidden items-center gap-0.5 text-sm font-medium md:flex">
          <Link className={link} href="/#demo">{t("nav.demo")}</Link>
          <Link className={link} href="/templates">{t("nav.templates")}</Link>
          <Link className={link} href="/docs">{t("nav.docs")}</Link>
          <Link className={link} href="/docs/arduino-subset">{t("nav.coverage")}</Link>
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          <HeaderToggles />
          {signedIn ? (
            <ButtonLink href="/dashboard" variant="primary" size="sm">{t("nav.dashboard")}</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">{t("nav.signIn")}</ButtonLink>
              <span className="hidden sm:block"><ButtonLink href="/signup" variant="primary" size="sm">{t("nav.createFirst")}</ButtonLink></span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const t = await getT();
  return (
    <footer className="px-3 pb-6 sm:px-5">
      <div className="glass mx-auto grid max-w-6xl gap-8 rounded-[var(--radius)] px-6 py-10 text-sm sm:grid-cols-2 sm:px-8 md:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-muted">{t("footer.tagline")}</p>
        </div>
        <nav aria-label={t("footer.product")} className="space-y-2">
          <h2 className="font-semibold">{t("footer.product")}</h2>
          <ul className="space-y-1.5 text-muted">
            <li><Link href="/#demo" className="hover:text-fg">{t("footer.liveDemo")}</Link></li>
            <li><Link href="/templates" className="hover:text-fg">{t("nav.templates")}</Link></li>
            <li><Link href="/docs/arduino-subset" className="hover:text-fg">{t("footer.subset")}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t("footer.resources")} className="space-y-2">
          <h2 className="font-semibold">{t("footer.resources")}</h2>
          <ul className="space-y-1.5 text-muted">
            <li><Link href="/docs" className="hover:text-fg">{t("footer.documentation")}</Link></li>
            <li><Link href="/docs#changelog" className="hover:text-fg">{t("footer.changelog")}</Link></li>
            <li><Link href="/contact" className="hover:text-fg">{t("footer.contact")}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t("footer.legal")} className="space-y-2">
          <h2 className="font-semibold">{t("footer.legal")}</h2>
          <ul className="space-y-1.5 text-muted">
            <li><Link href="/terms" className="hover:text-fg">{t("footer.terms")}</Link></li>
            <li><Link href="/privacy" className="hover:text-fg">{t("footer.privacy")}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl py-4 text-center text-xs text-faint">{t("footer.copyright", { year: new Date().getFullYear() })}</div>
    </footer>
  );
}
