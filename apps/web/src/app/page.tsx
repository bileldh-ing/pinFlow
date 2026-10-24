import Link from "next/link";
import { ArrowRight, Blocks, Braces, ChevronLeft, ChevronRight, Code2, Cpu, Eye, GitBranch, Hammer, LayoutTemplate, Lock, Plus, RotateCw, ShieldCheck, Share, Usb, PanelLeft, Copy } from "lucide-react";
import { listBoards } from "@pinflow/board-registry";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { ButtonLink, Chip, IconChip, Stat } from "@/components/ui";
import { FadeIn, Reveal, Stagger, StaggerItem } from "@/components/motion";
import { ClientWorkbench } from "@/components/workbench/ClientWorkbench";
import { getCurrentUser } from "@/server/auth";
import { listTemplates } from "@/server/templates";
import { getT } from "@/i18n/server";
import { tplCategory, tplDesc, tplTitle } from "@/i18n/content";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const user = await getCurrentUser().catch(() => null);
  const t = await getT();
  const FEATURES = [
    { icon: <Braces size={18} />, title: t("landing.f1t"), body: t("landing.f1b") },
    { icon: <Eye size={18} />, title: t("landing.f2t"), body: t("landing.f2b") },
    { icon: <Hammer size={18} />, title: t("landing.f3t"), body: t("landing.f3b") },
    { icon: <Cpu size={18} />, title: t("landing.f4t"), body: t("landing.f4b") },
    { icon: <LayoutTemplate size={18} />, title: t("landing.f5t"), body: t("landing.f5b") },
    { icon: <GitBranch size={18} />, title: t("landing.f6t"), body: t("landing.f6b") },
  ];
  const TRUST = [
    { icon: <Usb size={18} />, title: t("landing.t1t"), body: t("landing.t1b") },
    { icon: <Lock size={18} />, title: t("landing.t2t"), body: t("landing.t2b") },
    { icon: <ShieldCheck size={18} />, title: t("landing.t3t"), body: t("landing.t3b") },
    { icon: <Blocks size={18} />, title: t("landing.t4t"), body: t("landing.t4b") },
  ];
  const FAQ = ([1, 2, 3, 4, 5, 6] as const).map((n) => ({ q: t(`landing.q${n}`), a: t(`landing.a${n}`) }));
  const templates = listTemplates();
  const dht = templates.find((t) => t.id === "dht11-esp32") ?? templates[0];
  const boards = listBoards().map((b) => ({ fqbn: b.fqbn, name: b.name }));
  const cta = user ? "/dashboard" : "/signup";
  return (
    <div className="min-h-dvh overflow-x-clip">
      <SiteHeader signedIn={!!user} />
      <main id="main">
        {/* ------------------------------- hero ------------------------------- */}
        <section className="relative">
          <div aria-hidden className="pf-gridlines pointer-events-none absolute inset-0 -top-20" />
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-[38%] h-[520px] w-[980px] max-w-[120vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)] opacity-60 blur-2xl" />
          <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pt-20">
            <FadeIn>
              <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface-inner py-1 ps-1 pe-4 text-[12.5px] font-medium text-muted">
                <span className="pf-accent-fill grid h-6 w-6 place-items-center rounded-full"><Blocks size={13} /></span>{t("landing.badge")}
              </span>
            </FadeIn>
            <FadeIn delay={0.05}>
              <h1 className="mx-auto mt-6 max-w-4xl text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[4.25rem]">
                {t("landing.h1a")} <span className="pf-text-grad">{t("landing.h1b")}</span><br className="hidden sm:block" /> {t("landing.h1c")}
              </h1>
            </FadeIn>
            <FadeIn delay={0.1}>
              <p className="mx-auto mt-5 max-w-2xl text-[16.5px] leading-relaxed text-muted sm:text-[18px]">
                {t("landing.lead")}
              </p>
            </FadeIn>
            <FadeIn delay={0.15} className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href={cta} variant="primary" size="lg">{t("landing.ctaPrimary")} <ArrowRight size={16} className="pf-flip-rtl" /></ButtonLink>
              <ButtonLink href="#demo" variant="secondary" size="lg">{t("landing.ctaDemo")}</ButtonLink>
            </FadeIn>
            <p className="mt-4 text-[13px] text-faint">{t("landing.noAccount")}</p>
          </div>

          {/* Floating glass "window" with the real workbench inside */}
          <div id="demo" aria-labelledby="demo-title" className="relative mx-auto max-w-[1240px] scroll-mt-24 px-3 pb-16 sm:px-6">
            <h2 id="demo-title" className="sr-only">{t("landing.demoTitle")}</h2>
            <FadeIn delay={0.2}>
              <div className="glass mx-auto mb-4 flex h-12 max-w-[980px] items-center gap-2 rounded-full px-3 text-muted sm:h-14 sm:gap-3 sm:px-5" aria-hidden>
                <PanelLeft size={18} className="hidden sm:block" />
                <ChevronLeft size={18} className="hidden sm:block" /><ChevronRight size={18} className="hidden opacity-50 sm:block" />
                <div className="mx-auto flex min-w-0 items-center gap-2 rounded-full px-3 py-1 text-[13px] text-fg sm:text-[14px]">
                  <Lock size={13} className="shrink-0" /><span className="truncate">pinflow.studio/demo/dht11-on-esp32</span>
                </div>
                <RotateCw size={16} className="hidden sm:block" />
                <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
                <Share size={17} className="hidden sm:block" /><Plus size={18} className="hidden sm:block" /><Copy size={16} className="hidden sm:block" />
              </div>
              <div className="glass rounded-[28px] p-2 sm:p-2.5">
                <div className="h-[600px] overflow-hidden rounded-[22px] border border-line bg-canvas sm:h-[640px]" data-testid="landing-demo">
                  {dht && <ClientWorkbench mode="demo" demoSource={dht.files[0]!.content} demoTitle={t("landing.demoProject")} boards={boards} embedded />}
                </div>
              </div>
              <p className="mx-auto mt-4 max-w-3xl text-center text-[13.5px] text-muted">
                {t("landing.demoCaption1")} <code className="font-mono text-fg">delay(2000)</code> {t("landing.demoCaption2")}
              </p>
            </FadeIn>
          </div>
        </section>

        {/* ------------------------------ proof strip ------------------------------ */}
        <section aria-label={t("landing.glance")} className="px-3 sm:px-6">
          <Reveal className="glass mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-6 rounded-[var(--radius)] p-6 lg:grid-cols-4">
            <Stat icon={<Braces size={17} />} label={t("landing.statSync")} value={t("landing.statSyncV")} tone="accent" />
            <Stat icon={<Eye size={17} />} label={t("landing.statUnsupported")} value={t("landing.statUnsupportedV")} />
            <Stat icon={<Hammer size={17} />} label={t("landing.statToolchain")} value="arduino-cli 1.5.1" tone="mint" />
            <Stat icon={<Cpu size={17} />} label={t("landing.statBoards")} value="ESP32 · Uno · Nano" />
          </Reveal>
        </section>

        {/* -------------------------------- features -------------------------------- */}
        <section aria-labelledby="features-title">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-accent">{t("landing.whyEyebrow")}</p>
              <h2 id="features-title" className="mt-2 text-[2rem] font-bold tracking-tight sm:text-[2.4rem]">{t("landing.whyTitle")}</h2>
              <p className="mt-2 max-w-2xl text-[15px] text-muted">{t("landing.whyLead")}</p>
            </Reveal>
            <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <StaggerItem key={f.title} className="glass pf-lift rounded-[var(--radius)] p-6">
                  <IconChip tone={i === 0 ? "accent" : i === 2 ? "mint" : "neutral"} size={44} className="mb-5">{f.icon}</IconChip>
                  <h3 className="text-[16px] font-bold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ------------------------------ how it works ------------------------------ */}
        <section aria-labelledby="how-title" className="px-3 sm:px-6">
          <Reveal className="glass relative mx-auto max-w-6xl overflow-hidden rounded-[var(--radius)] p-6 sm:p-10">
            <div aria-hidden className="pointer-events-none absolute -end-32 -top-32 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)] opacity-60" />
            <h2 id="how-title" className="text-[1.75rem] font-bold tracking-tight">{t("landing.howTitle")}</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { icon: <Code2 size={18} />, t: t("landing.s1t"), b: t("landing.s1b") },
                { icon: <Blocks size={18} />, t: t("landing.s2t"), b: t("landing.s2b") },
                { icon: <GitBranch size={18} />, t: t("landing.s3t"), b: t("landing.s3b") },
              ].map((s, i) => (
                <li key={s.t} className="glass-inner relative p-5">
                  <div className="flex items-center gap-3"><IconChip tone={i === 1 ? "accent" : "neutral"} size={38}>{s.icon}</IconChip><span className="text-[12px] font-bold text-faint">{t("landing.step", { n: i + 1 })}</span></div>
                  <h3 className="mt-4 font-bold">{s.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.b}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* -------------------------------- templates -------------------------------- */}
        <section aria-labelledby="templates-title">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-accent">{t("landing.tplEyebrow")}</p>
                <h2 id="templates-title" className="mt-2 text-[2rem] font-bold tracking-tight">{t("landing.tplTitle")}</h2>
                <p className="mt-1 text-[15px] text-muted">{t("landing.tplLead")}</p>
              </div>
              <ButtonLink href="/templates" variant="secondary" size="sm">{t("landing.tplAll")} <ArrowRight size={14} className="pf-flip-rtl" /></ButtonLink>
            </Reveal>
            <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {templates.slice(0, 8).map((tp) => (
                <StaggerItem key={tp.id} className="glass pf-lift flex flex-col rounded-[var(--radius)] p-5">
                  <Chip className="self-start">{tplCategory(t, tp.category)}</Chip>
                  <h3 className="mt-3 font-bold">{tplTitle(t, tp.id, tp.title)}</h3>
                  <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted">{tplDesc(t, tp.id, tp.description)}</p>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-faint"><Cpu size={12} />{boards.find((b) => b.fqbn === tp.boardFqbn)?.name ?? tp.boardFqbn}</div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ---------------------------------- trust ---------------------------------- */}
        <section aria-labelledby="trust-title">
          <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
            <Reveal><h2 id="trust-title" className="text-[2rem] font-bold tracking-tight">{t("landing.trustTitle")}</h2></Reveal>
            <Stagger className="mt-8 grid gap-4 md:grid-cols-2">
              {TRUST.map((tr, i) => (
                <StaggerItem key={tr.title} className="glass flex gap-4 rounded-[var(--radius)] p-6">
                  <IconChip tone={i % 2 ? "mint" : "neutral"} size={42}>{tr.icon}</IconChip>
                  <div><h3 className="font-bold">{tr.title}</h3><p className="mt-1 text-sm leading-relaxed text-muted">{tr.body}</p></div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ----------------------------------- FAQ ----------------------------------- */}
        <section aria-labelledby="faq-title">
          <div className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
            <Reveal><h2 id="faq-title" className="text-center text-[2rem] font-bold tracking-tight">{t("landing.faqTitle")}</h2></Reveal>
            <Reveal className="glass mt-8 divide-y divide-line overflow-hidden rounded-[var(--radius)]">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6 py-4 open:bg-surface-inner">
                  <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-hover text-accent transition-transform duration-200 group-open:rotate-90 rtl:group-open:-rotate-90"><ChevronRight size={15} className="pf-flip-rtl" /></span>{f.q}
                  </summary>
                  <p className="mt-2 ps-10 text-sm leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </Reveal>
            <Reveal className="glass relative mt-12 overflow-hidden rounded-[var(--radius)] p-8 text-center sm:p-10">
              <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-24 mx-auto h-48 w-[70%] rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)]" />
              <h2 className="relative text-[1.6rem] font-bold tracking-tight">{t("landing.readyTitle")}</h2>
              <p className="relative mt-2 text-sm text-muted">{t("landing.readyLead")}</p>
              <div className="relative mt-6"><ButtonLink href={cta} variant="primary" size="lg">{t("landing.ctaPrimary")} <ArrowRight size={16} className="pf-flip-rtl" /></ButtonLink></div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
