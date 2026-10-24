import Link from "next/link";
import type { ReactNode } from "react";
import { Blocks, Code2, ShieldCheck } from "lucide-react";
import { Logo } from "../Logo";
import { ThemeToggle } from "../ThemeToggle";
import { FadeIn } from "../motion";
import { IconChip } from "../ui";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" aria-label="PinFlow Studio home"><Logo /></Link>
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
        <FadeIn className="grid w-full max-w-[920px] items-stretch gap-5 md:grid-cols-[1fr_440px]">
          <aside className="glass relative hidden overflow-hidden rounded-[var(--radius)] p-8 md:flex md:flex-col" aria-hidden>
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)] opacity-70" />
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">PinFlow Studio</p>
            <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight">Real C++ and blocks,<br />one living sketch.</h2>
            <ul className="mt-8 space-y-4 text-sm text-muted">
              <li className="flex items-center gap-3"><IconChip tone="accent" size={36}><Blocks size={16} /></IconChip>Blocks and code stay in sync both ways</li>
              <li className="flex items-center gap-3"><IconChip size={36}><Code2 size={16} /></IconChip>Unsupported C++ is preserved byte-for-byte</li>
              <li className="flex items-center gap-3"><IconChip tone="mint" size={36}><ShieldCheck size={16} /></IconChip>Private projects, isolated real compiles</li>
            </ul>
            <div className="glass-inner mt-auto p-4 font-mono text-[12px] leading-relaxed text-muted">
              <span className="text-accent">void</span> loop() {"{"}<br />&nbsp;&nbsp;delay(<span className="text-accent2">2000</span>);<br />{"}"}
            </div>
          </aside>
          <div className="glass w-full rounded-[var(--radius)] p-6 sm:p-8">
            <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
            {footer && <div className="mt-6 border-t border-line pt-4 text-sm text-muted">{footer}</div>}
          </div>
        </FadeIn>
      </main>
    </div>
  );
}
