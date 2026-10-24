import Link from "next/link";
import type { ReactNode } from "react";
import { Blocks, Code2, ShieldCheck } from "lucide-react";
import { Logo } from "../Logo";
import { HeaderToggles } from "../ThemeToggle";
import { getT } from "@/i18n/server";
import { FadeIn } from "../motion";
import { IconChip } from "../ui";

export async function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const t = await getT();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" aria-label={t("common.home")}><Logo /></Link>
        <HeaderToggles />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
        <FadeIn className="grid w-full max-w-[920px] items-stretch gap-5 md:grid-cols-[1fr_440px]">
          <aside className="glass relative hidden overflow-hidden rounded-[var(--radius)] p-8 md:flex md:flex-col" aria-hidden>
            <div className="pointer-events-none absolute -end-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)] opacity-70" />
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">{t("auth.asideEyebrow")}</p>
            <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight">{t("auth.asideTitle1")}<br />{t("auth.asideTitle2")}</h2>
            <ul className="mt-8 space-y-4 text-sm text-muted">
              <li className="flex items-center gap-3"><IconChip tone="accent" size={36}><Blocks size={16} /></IconChip>{t("auth.asideP1")}</li>
              <li className="flex items-center gap-3"><IconChip size={36}><Code2 size={16} /></IconChip>{t("auth.asideP2")}</li>
              <li className="flex items-center gap-3"><IconChip tone="mint" size={36}><ShieldCheck size={16} /></IconChip>{t("auth.asideP3")}</li>
            </ul>
            <div dir="ltr" className="glass-inner mt-auto p-4 text-left font-mono text-[12px] leading-relaxed text-muted">
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
