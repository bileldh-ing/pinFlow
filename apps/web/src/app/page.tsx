import Link from "next/link";
import { ArrowRight, Blocks, Braces, ChevronLeft, ChevronRight, Code2, Cpu, Eye, GitBranch, Hammer, LayoutTemplate, Lock, Plus, RotateCw, ShieldCheck, Share, Usb, PanelLeft, Copy } from "lucide-react";
import { listBoards } from "@pinflow/board-registry";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { ButtonLink, Chip, IconChip, Stat } from "@/components/ui";
import { FadeIn, Reveal, Stagger, StaggerItem } from "@/components/motion";
import { ClientWorkbench } from "@/components/workbench/ClientWorkbench";
import { getCurrentUser } from "@/server/auth";
import { listTemplates } from "@/server/templates";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: <Braces size={18} />, title: "Code ↔ blocks, both ways", body: "Edit C++ in a real code editor or rearrange blocks — the other side follows within a moment, with the cursor, layout and undo history intact." },
  { icon: <Eye size={18} />, title: "Honest coverage", body: "Anything blocks cannot express — templates, lambdas, conditional compilation — stays as an “Advanced C++” block, byte-for-byte, with a plain-language reason." },
  { icon: <Hammer size={18} />, title: "Real compilation", body: "Compile runs the actual Arduino toolchain in an isolated worker. Results are tied to the exact revision and marked outdated when the code moves on." },
  { icon: <Cpu size={18} />, title: "Board-aware blocks", body: "Pick ESP32 or Uno and get warnings for input-only, strapping and flash pins, PWM/ADC differences — advisory, with how sure we are." },
  { icon: <LayoutTemplate size={18} />, title: "Sketch templates", body: "Start from DHT11 on ESP32, blink, buttons, PWM, servo or the serial monitor — each one is a normal project you own." },
  { icon: <GitBranch size={18} />, title: "Version history", body: "Every save is a revision. Compare any two, restore one, or branch it into a new project. Two tabs never silently overwrite each other." },
];

const TRUST = [
  { icon: <Usb size={18} />, title: "Local hardware bridging", body: "Uploading to a board happens on your machine through the optional PinFlow Bridge — never as a hidden server operation. Until it is connected, Upload stays disabled." },
  { icon: <Lock size={18} />, title: "Private by default", body: "Projects belong to your account and are never public unless you share them. Your code is not used to train models." },
  { icon: <ShieldCheck size={18} />, title: "Isolated compilation", body: "Each compile runs in a short-lived sandbox with resource limits and no access to other users’ files or our databases." },
  { icon: <Blocks size={18} />, title: "Transparent block coverage", body: "A live coverage meter shows exactly how much of your sketch is native blocks and which lines are preserved code — no silent rewrites." },
];

const FAQ = [
  { q: "Can PinFlow turn any C++ into blocks?", a: "No — and it never pretends to. It visualizes a documented Arduino subset (setup/loop, functions, variables, control flow, common Arduino and DHT APIs). Everything else is kept verbatim in Advanced C++ blocks so your program never changes behind your back." },
  { q: "Does editing blocks reformat my code?", a: "Block edits regenerate the affected code deterministically. Preserved regions are re-emitted exactly as written. Typing in the code editor never triggers a rewrite of your text." },
  { q: "What happens while my code has a syntax error?", a: "The blocks keep showing the last valid version with a clear banner and the error in the gutter. Nothing is cleared; fix the code and the blocks catch up." },
  { q: "Which boards are supported?", a: "ESP32 Dev Module and Arduino Uno have tested board profiles, and Arduino Nano is included. The exact FQBN and core version are always shown." },
  { q: "Can I upload to my board from the browser?", a: "Uploading needs the local PinFlow Bridge companion. Until it is installed and paired, the Upload button is disabled and says so — there is no fake upload." },
  { q: "Can I take my code elsewhere?", a: "Always. Export a plain .ino or an Arduino-CLI-ready sketch folder as a ZIP at any time." },
];

export default async function Landing() {
  const user = await getCurrentUser().catch(() => null);
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
              <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface-inner py-1 pl-1 pr-4 text-[12.5px] font-medium text-muted">
                <span className="pf-accent-fill grid h-6 w-6 place-items-center rounded-full"><Blocks size={13} /></span>ESP32 · Arduino Uno · real C++
              </span>
            </FadeIn>
            <FadeIn delay={0.05}>
              <h1 className="mx-auto mt-6 max-w-4xl text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[4.25rem]">
                Arduino code. <span className="pf-text-grad">Visual clarity.</span><br className="hidden sm:block" /> One living project.
              </h1>
            </FadeIn>
            <FadeIn delay={0.1}>
              <p className="mx-auto mt-5 max-w-2xl text-[16.5px] leading-relaxed text-muted sm:text-[18px]">
                PinFlow Studio keeps your sketch as real C++ and as Scratch-style blocks at the same time. Change either one and the other follows — code that blocks can’t express is preserved, never rewritten.
              </p>
            </FadeIn>
            <FadeIn delay={0.15} className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href={cta} variant="primary" size="lg">Create your first sketch <ArrowRight size={16} /></ButtonLink>
              <ButtonLink href="#demo" variant="secondary" size="lg">Try the live demo</ButtonLink>
            </FadeIn>
            <p className="mt-4 text-[13px] text-faint">No account needed for the demo. Saving to the cloud requires a free account.</p>
          </div>

          {/* Floating glass "window" with the real workbench inside */}
          <div id="demo" aria-labelledby="demo-title" className="relative mx-auto max-w-[1240px] scroll-mt-24 px-3 pb-16 sm:px-6">
            <h2 id="demo-title" className="sr-only">Live demo: the real editor</h2>
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
                  {dht && <ClientWorkbench mode="demo" demoSource={dht.files[0]!.content} demoTitle="DHT11 on ESP32 — demo" boards={boards} embedded />}
                </div>
              </div>
              <p className="mx-auto mt-4 max-w-3xl text-center text-[13.5px] text-muted">
                This is the actual PinFlow workbench running the ESP32 + DHT11 example — not a screenshot. Change the delay block or edit <code className="font-mono text-fg">delay(2000)</code> and watch the other side update. Nothing here is saved.
              </p>
            </FadeIn>
          </div>
        </section>

        {/* ------------------------------ proof strip ------------------------------ */}
        <section aria-label="At a glance" className="px-3 sm:px-6">
          <Reveal className="glass mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-6 rounded-[var(--radius)] p-6 lg:grid-cols-4">
            <Stat icon={<Braces size={17} />} label="Synchronization" value="Code ↔ blocks" tone="accent" />
            <Stat icon={<Eye size={17} />} label="Unsupported C++" value="Kept byte-for-byte" />
            <Stat icon={<Hammer size={17} />} label="Toolchain" value="arduino-cli 1.5.1" tone="mint" />
            <Stat icon={<Cpu size={17} />} label="Board profiles" value="ESP32 · Uno · Nano" />
          </Reveal>
        </section>

        {/* -------------------------------- features -------------------------------- */}
        <section aria-labelledby="features-title">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-accent">Why PinFlow</p>
              <h2 id="features-title" className="mt-2 text-[2rem] font-bold tracking-tight sm:text-[2.4rem]">Built like an engineering tool</h2>
              <p className="mt-2 max-w-2xl text-[15px] text-muted">Correctness first, then clarity. The pieces that matter when your sketch has to actually run.</p>
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
            <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)] opacity-60" />
            <h2 id="how-title" className="text-[1.75rem] font-bold tracking-tight">One sketch, two views, zero drift</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { icon: <Code2 size={18} />, t: "Write or paste C++", b: "Tree-sitter parses your sketch into a typed IR in a Web Worker, a moment after you stop typing." },
                { icon: <Blocks size={18} />, t: "See it as blocks", b: "Supported constructs become native blocks; everything else becomes an “Advanced C++” block that keeps the exact text." },
                { icon: <GitBranch size={18} />, t: "Edit either side", b: "Block edits regenerate only the code they own. Undo is unified, every save is a revision you can restore." },
              ].map((s, i) => (
                <li key={s.t} className="glass-inner relative p-5">
                  <div className="flex items-center gap-3"><IconChip tone={i === 1 ? "accent" : "neutral"} size={38}>{s.icon}</IconChip><span className="text-[12px] font-bold text-faint">STEP {i + 1}</span></div>
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
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-accent">Templates</p>
                <h2 id="templates-title" className="mt-2 text-[2rem] font-bold tracking-tight">Start from a working sketch</h2>
                <p className="mt-1 text-[15px] text-muted">Every template is plain Arduino code you can read, change and export.</p>
              </div>
              <ButtonLink href="/templates" variant="secondary" size="sm">All templates <ArrowRight size={14} /></ButtonLink>
            </Reveal>
            <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {templates.slice(0, 8).map((t) => (
                <StaggerItem key={t.id} className="glass pf-lift flex flex-col rounded-[var(--radius)] p-5">
                  <Chip className="self-start">{t.category}</Chip>
                  <h3 className="mt-3 font-bold">{t.title}</h3>
                  <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted">{t.description}</p>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-faint"><Cpu size={12} />{boards.find((b) => b.fqbn === t.boardFqbn)?.name ?? t.boardFqbn}</div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ---------------------------------- trust ---------------------------------- */}
        <section aria-labelledby="trust-title">
          <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
            <Reveal><h2 id="trust-title" className="text-[2rem] font-bold tracking-tight">Trust is a feature</h2></Reveal>
            <Stagger className="mt-8 grid gap-4 md:grid-cols-2">
              {TRUST.map((t, i) => (
                <StaggerItem key={t.title} className="glass flex gap-4 rounded-[var(--radius)] p-6">
                  <IconChip tone={i % 2 ? "mint" : "neutral"} size={42}>{t.icon}</IconChip>
                  <div><h3 className="font-bold">{t.title}</h3><p className="mt-1 text-sm leading-relaxed text-muted">{t.body}</p></div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ----------------------------------- FAQ ----------------------------------- */}
        <section aria-labelledby="faq-title">
          <div className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
            <Reveal><h2 id="faq-title" className="text-center text-[2rem] font-bold tracking-tight">Questions, answered plainly</h2></Reveal>
            <Reveal className="glass mt-8 divide-y divide-line overflow-hidden rounded-[var(--radius)]">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6 py-4 open:bg-surface-inner">
                  <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-hover text-accent transition-transform duration-200 group-open:rotate-90"><ChevronRight size={15} /></span>{f.q}
                  </summary>
                  <p className="mt-2 pl-10 text-sm leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </Reveal>
            <Reveal className="glass relative mt-12 overflow-hidden rounded-[var(--radius)] p-8 text-center sm:p-10">
              <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-24 mx-auto h-48 w-[70%] rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)]" />
              <h2 className="relative text-[1.6rem] font-bold tracking-tight">Ready to see your sketch both ways?</h2>
              <p className="relative mt-2 text-sm text-muted">Free account · private projects · export any time.</p>
              <div className="relative mt-6"><ButtonLink href={cta} variant="primary" size="lg">Create your first sketch <ArrowRight size={16} /></ButtonLink></div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
