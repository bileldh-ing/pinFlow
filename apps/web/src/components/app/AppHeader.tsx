import Link from "next/link";
import { BookOpen, LayoutGrid, LayoutTemplate, LogOut, Settings } from "lucide-react";
import { Logo } from "../Logo";
import { ThemeToggle } from "../ThemeToggle";
import { AppRail } from "./AppRail";

export function AppHeader({ user }: { user: { displayName: string; email: string; emailVerified: boolean } }) {
  return (
    <>
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
        <div className="glass mx-auto flex h-14 max-w-6xl items-center gap-2 rounded-full pl-4 pr-2 sm:pl-5">
          <Link href="/dashboard" aria-label="Dashboard"><Logo /></Link>
          <nav aria-label="App" className="ml-2 hidden items-center gap-0.5 text-sm font-medium sm:flex">
            <Link href="/dashboard" className="pf-transition inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg"><LayoutGrid size={15} />Projects</Link>
            <Link href="/templates" className="pf-transition inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg"><LayoutTemplate size={15} />Templates</Link>
            <Link href="/docs" className="pf-transition inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg"><BookOpen size={15} />Docs</Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Link href="/settings/profile" className="pf-transition inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface-inner pl-1 pr-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-fg" aria-label="Profile settings">
              <span aria-hidden className="pf-accent-fill grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold">{user.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="hidden max-w-[140px] truncate md:inline">{user.displayName}</span>
              <Settings size={14} className="md:hidden" />
            </Link>
            <form action="/logout" method="post">
              <button type="submit" className="pf-press inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-fg" aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
            </form>
          </div>
        </div>
        {!user.emailVerified && (
          <div className="mx-auto mt-2 max-w-6xl rounded-full border border-warn/35 bg-[color-mix(in_srgb,var(--bg-2)_85%,var(--warn))] px-4 py-1.5 text-center text-xs text-warn">
            Please confirm your email address — check your inbox{process.env.NODE_ENV !== "production" ? <> (development: <Link className="underline" href="/dev/outbox">open the dev outbox</Link>)</> : null}. <Link className="underline" href="/settings/profile#verify">Resend</Link>
          </div>
        )}
      </header>
      <AppRail />
    </>
  );
}
