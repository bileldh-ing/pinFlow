import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ButtonLink } from "./ui";

export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
      <div className="glass mx-auto flex h-14 max-w-6xl items-center gap-3 rounded-full pl-4 pr-2 sm:pl-5">
        <Link href="/" aria-label="PinFlow Studio home" className="shrink-0"><Logo /></Link>
        <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 text-sm font-medium md:flex">
          <Link className="pf-transition rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg" href="/#demo">Demo</Link>
          <Link className="pf-transition rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg" href="/templates">Templates</Link>
          <Link className="pf-transition rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg" href="/docs">Docs</Link>
          <Link className="pf-transition rounded-full px-3.5 py-1.5 text-muted hover:bg-surface-hover hover:text-fg" href="/docs/arduino-subset">Coverage</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {signedIn ? (
            <ButtonLink href="/dashboard" variant="primary" size="sm">Dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">Sign in</ButtonLink>
              <span className="hidden sm:block"><ButtonLink href="/signup" variant="primary" size="sm">Create your first sketch</ButtonLink></span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="px-3 pb-6 sm:px-5">
      <div className="glass mx-auto grid max-w-6xl gap-8 rounded-[var(--radius)] px-6 py-10 text-sm sm:grid-cols-2 sm:px-8 md:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-muted">Real Arduino C++ and visual blocks, kept in sync. Code that blocks can’t express is preserved, never rewritten.</p>
        </div>
        <nav aria-label="Product" className="space-y-2">
          <h2 className="font-semibold">Product</h2>
          <ul className="space-y-1.5 text-muted">
            <li><Link href="/#demo" className="hover:text-fg">Live demo</Link></li>
            <li><Link href="/templates" className="hover:text-fg">Templates</Link></li>
            <li><Link href="/docs/arduino-subset" className="hover:text-fg">Supported C++ subset</Link></li>
          </ul>
        </nav>
        <nav aria-label="Resources" className="space-y-2">
          <h2 className="font-semibold">Resources</h2>
          <ul className="space-y-1.5 text-muted">
            <li><Link href="/docs" className="hover:text-fg">Documentation</Link></li>
            <li><Link href="/docs#changelog" className="hover:text-fg">Changelog</Link></li>
            <li><Link href="/contact" className="hover:text-fg">Contact</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal" className="space-y-2">
          <h2 className="font-semibold">Legal</h2>
          <ul className="space-y-1.5 text-muted">
            <li><Link href="/terms" className="hover:text-fg">Terms</Link></li>
            <li><Link href="/privacy" className="hover:text-fg">Privacy</Link></li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl py-4 text-center text-xs text-faint">© {new Date().getFullYear()} PinFlow Studio. Arduino is a trademark of Arduino SA; PinFlow is not affiliated with Arduino.</div>
    </footer>
  );
}
