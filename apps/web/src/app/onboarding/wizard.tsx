"use client";
import { useState, useTransition } from "react";
import { Check, Columns2, Code2, Blocks, Maximize2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button, Spinner } from "@/components/ui";
import { motion, useReducedMotion } from "@/components/motion";
import { HeaderToggles } from "@/components/ThemeToggle";
import { useT } from "@/i18n/client";

interface Props {
  name: string;
  boards: Array<{ fqbn: string; name: string }>;
  templates: Array<{ id: string; title: string; description: string; boardFqbn: string }>;
  action: (input: { skillLevel: string; preferredBoard: string; layout: string; templateId: string | null }) => Promise<void>;
}

function Option({ selected, onClick, title, desc, icon }: { selected: boolean; onClick: () => void; title: string; desc?: string; icon?: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={`pf-transition flex w-full items-start gap-3 rounded-2xl border p-3.5 text-start ${selected ? "border-accent-strong bg-accent/12 shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-strong)_18%,transparent)]" : "border-line hover:border-line-strong hover:bg-surface-hover"}`}>
      {icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-hover text-accent">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {desc && <span className="mt-0.5 block text-xs text-muted">{desc}</span>}
      </span>
      <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "border-transparent pf-accent-fill" : "border-line-strong"}`}>{selected && <Check size={12} />}</span>
    </button>
  );
}

export function OnboardingWizard({ name, boards, templates, action }: Props) {
  const [step, setStep] = useState(0);
  const [skill, setSkill] = useState("beginner");
  const [board, setBoard] = useState(boards[0]?.fqbn ?? "esp32:esp32:esp32");
  const [layout, setLayout] = useState("side-by-side");
  const [template, setTemplate] = useState<string | null>("dht11-esp32");
  const [pending, start] = useTransition();
  const reduce = useReducedMotion();
  const t = useT();
  const steps = [t("onb.stepExperience"), t("onb.stepBoard"), t("onb.stepLayout"), t("onb.stepFirst")];

  const finish = (tpl: string | null) => start(() => action({ skillLevel: skill, preferredBoard: board, layout, templateId: tpl }));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8"><Logo /><HeaderToggles /></header>
      <main id="main" className="flex flex-1 justify-center px-4 pb-16">
        <div className="glass w-full max-w-xl self-start rounded-[var(--radius)] p-6 sm:mt-6 sm:p-8">
          <p className="text-sm text-muted">{t("onb.welcome", { name })}</p>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight">{t("onb.title")}</h1>
          <ol className="mt-5 flex gap-2" aria-label={t("onb.progress")}>
            {steps.map((s, i) => (
              <li key={s} className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${i <= step ? "pf-accent-fill" : "bg-line-strong"}`} aria-current={i === step ? "step" : undefined}><span className="sr-only">{s}</span></li>
            ))}
          </ol>
          <motion.div key={step} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="mt-6 space-y-2.5" role="radiogroup" aria-label={steps[step]}>
            {step === 0 && (<>
              <h2 className="mb-3 font-medium">{t("onb.q1")}</h2>
              <Option selected={skill === "beginner"} onClick={() => setSkill("beginner")} title={t("onb.beginner")} desc={t("onb.beginnerD")} />
              <Option selected={skill === "intermediate"} onClick={() => setSkill("intermediate")} title={t("onb.intermediate")} desc={t("onb.intermediateD")} />
              <Option selected={skill === "advanced"} onClick={() => setSkill("advanced")} title={t("onb.advanced")} desc={t("onb.advancedD")} />
            </>)}
            {step === 1 && (<>
              <h2 className="mb-3 font-medium">{t("onb.q2")}</h2>
              {boards.map((b) => <Option key={b.fqbn} selected={board === b.fqbn} onClick={() => setBoard(b.fqbn)} title={b.name} desc={b.fqbn} />)}
            </>)}
            {step === 2 && (<>
              <h2 className="mb-3 font-medium">{t("onb.q3")}</h2>
              <Option selected={layout === "side-by-side"} onClick={() => setLayout("side-by-side")} title={t("onb.sideBySide")} desc={t("onb.sideBySideD")} icon={<Columns2 size={16} />} />
              <Option selected={layout === "blocks-first"} onClick={() => setLayout("blocks-first")} title={t("onb.blocksFirst")} desc={t("onb.blocksFirstD")} icon={<Blocks size={16} />} />
              <Option selected={layout === "code-first"} onClick={() => setLayout("code-first")} title={t("onb.codeFirst")} desc={t("onb.codeFirstD")} icon={<Code2 size={16} />} />
              <Option selected={layout === "focus"} onClick={() => setLayout("focus")} title={t("onb.focus")} desc={t("onb.focusD")} icon={<Maximize2 size={16} />} />
            </>)}
            {step === 3 && (<>
              <h2 className="mb-3 font-medium">{t("onb.q4")}</h2>
              <Option selected={template === "dht11-esp32"} onClick={() => setTemplate("dht11-esp32")} title={t("onb.guided")} desc={t("onb.guidedD")} />
              {templates.filter((tp) => tp.id !== "dht11-esp32").slice(0, 3).map((tp) => <Option key={tp.id} selected={template === tp.id} onClick={() => setTemplate(tp.id)} title={tp.title} desc={tp.description} />)}
              <Option selected={template === "blank"} onClick={() => setTemplate("blank")} title={t("onb.blank")} desc={t("onb.blankD")} />
            </>)}
          </motion.div>
          <div className="mt-7 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => (step === 0 ? finish(null) : setStep(step - 1))} disabled={pending}>{step === 0 ? t("onb.skip") : t("common.back")}</Button>
            {step < 3 ? <Button variant="primary" onClick={() => setStep(step + 1)}>{t("common.continue")}</Button>
              : <Button variant="primary" onClick={() => finish(template)} disabled={pending}>{pending && <Spinner />}{t("onb.open")}</Button>}
          </div>
        </div>
      </main>
    </div>
  );
}
