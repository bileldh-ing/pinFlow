import Link from "next/link";
import { BookOpen, LayoutGrid, LayoutTemplate, LogOut, Settings } from "lucide-react";
import { Logo } from "../Logo";
import { HeaderToggles } from "../ThemeToggle";
import { getT } from "@/i18n/server";
import { AppRail } from "./AppRail";

export async function AppHeader({ user }: { user: { displayName: string; email: string; emailVerified: boolean } }) {
  const t = await getT();
  return (
    <>
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
        <div className="glass mx-auto flex h-14 max-w-6xl items-center gap-2 rounded-full ps-4 pe-2 sm:ps-5">
          <Link href="/dashboard" aria-label={t("nav.dashboard")}><Logo /></Link>
          <nav aria-label={t("nav.app")} className="ms-2 hidden items-center gap-0.5 text-sm font-medium sm:flex">
            <Link href="/dashboard" className="pf-transition inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg"><LayoutGrid size={15} />{t("nav.projects")}</Link>
            <Link href="/templates" className="pf-transition inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg"><LayoutTemplate size={15} />{t("nav.templates")}</Link>
            <Link href="/docs" className="pf-transition inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg"><BookOpen size={15} />{t("nav.docs")}</Link>
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <HeaderToggles />
            <Link href="/settings/profile" className="pf-transition inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface-inner ps-1 pe-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-fg" aria-label={t("nav.profileSettings")}>
              <span aria-hidden className="pf-accent-fill grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold">{user.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="hidden max-w-[140px] truncate md:inline">{user.displayName}</span>
              <Settings size={14} className="md:hidden" />
            </Link>
            <form action="/logout" method="post">
              <button type="submit" className="pf-press inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-fg" aria-label={t("nav.signOut")} title={t("nav.signOut")}><LogOut size={15} /></button>
            </form>
          </div>
        </div>
        {!user.emailVerified && (
          <div className="mx-auto mt-2 max-w-6xl rounded-full border border-warn/35 bg-[color-mix(in_srgb,var(--bg-2)_85%,var(--warn))] px-4 py-1.5 text-center text-xs text-warn">
            {t("nav.verifyBanner")}{process.env.NODE_ENV !== "production" ? <> ({t("nav.verifyDev")} <Link className="underline" href="/dev/outbox">{t("nav.verifyDevLink")}</Link>)</> : null}. <Link className="underline" href="/settings/profile#verify">{t("nav.resend")}</Link>
          </div>
        )}
      </header>
      <AppRail />
    </>
  );
}
