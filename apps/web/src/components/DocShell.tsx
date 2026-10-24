import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./SiteChrome";

export function DocShell({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader signedIn={signedIn} />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[220px_1fr]">
        <nav aria-label="Documentation" className="glass rounded-[var(--radius)] p-3 text-sm md:sticky md:top-24 md:self-start">
          <ul className="flex flex-wrap gap-1 md:flex-col">
            <li><Link className="pf-transition block rounded-full px-3.5 py-2 font-medium text-muted hover:bg-surface-hover hover:text-fg" href="/docs">Getting started</Link></li>
            <li><Link className="pf-transition block rounded-full px-3.5 py-2 font-medium text-muted hover:bg-surface-hover hover:text-fg" href="/docs#the-workbench">The workbench</Link></li>
            <li><Link className="pf-transition block rounded-full px-3.5 py-2 font-medium text-muted hover:bg-surface-hover hover:text-fg" href="/docs#compiling">Compiling</Link></li>
            <li><Link className="pf-transition block rounded-full px-3.5 py-2 font-medium text-muted hover:bg-surface-hover hover:text-fg" href="/docs/arduino-subset">Supported C++ subset</Link></li>
            <li><Link className="pf-transition block rounded-full px-3.5 py-2 font-medium text-muted hover:bg-surface-hover hover:text-fg" href="/docs#changelog">Changelog</Link></li>
          </ul>
        </nav>
        <main id="main" className="glass min-w-0 rounded-[var(--radius)] px-5 py-4 sm:px-9 sm:py-6">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
