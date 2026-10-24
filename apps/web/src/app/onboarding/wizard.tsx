"use client";
import { useState, useTransition } from "react";
import { Check, Columns2, Code2, Blocks, Maximize2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button, Spinner } from "@/components/ui";
import { motion, useReducedMotion } from "@/components/motion";

interface Props {
  name: string;
  boards: Array<{ fqbn: string; name: string }>;
  templates: Array<{ id: string; title: string; description: string; boardFqbn: string }>;
  action: (input: { skillLevel: string; preferredBoard: string; layout: string; templateId: string | null }) => Promise<void>;
}

function Option({ selected, onClick, title, desc, icon }: { selected: boolean; onClick: () => void; title: string; desc?: string; icon?: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={`pf-transition flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left ${selected ? "border-accent-strong bg-accent/12 shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-strong)_18%,transparent)]" : "border-line hover:border-line-strong hover:bg-surface-hover"}`}>
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
  const steps = ["Experience", "Board", "Layout", "First sketch"];

  const finish = (tpl: string | null) => start(() => action({ skillLevel: skill, preferredBoard: board, layout, templateId: tpl }));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 py-4 sm:px-8"><Logo /></header>
      <main id="main" className="flex flex-1 justify-center px-4 pb-16">
        <div className="glass w-full max-w-xl self-start rounded-[var(--radius)] p-6 sm:mt-6 sm:p-8">
          <p className="text-sm text-muted">Welcome, {name}</p>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight">Let’s set up your workbench</h1>
          <ol className="mt-5 flex gap-2" aria-label="Progress">
            {steps.map((s, i) => (
              <li key={s} className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${i <= step ? "pf-accent-fill" : "bg-line-strong"}`} aria-current={i === step ? "step" : undefined}><span className="sr-only">{s}</span></li>
            ))}
          </ol>
          <motion.div key={step} initial={reduce ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="mt-6 space-y-2.5" role="radiogroup" aria-label={steps[step]}>
            {step === 0 && (<>
              <h2 className="mb-3 font-medium">How familiar are you with Arduino?</h2>
              <Option selected={skill === "beginner"} onClick={() => setSkill("beginner")} title="Beginner" desc="Start with blocks; the code updates alongside." />
              <Option selected={skill === "intermediate"} onClick={() => setSkill("intermediate")} title="Intermediate" desc="Comfortable with setup()/loop() and basic C++." />
              <Option selected={skill === "advanced"} onClick={() => setSkill("advanced")} title="Advanced" desc="Write C++; use blocks to explain or review." />
            </>)}
            {step === 1 && (<>
              <h2 className="mb-3 font-medium">Which board do you use most?</h2>
              {boards.map((b) => <Option key={b.fqbn} selected={board === b.fqbn} onClick={() => setBoard(b.fqbn)} title={b.name} desc={b.fqbn} />)}
            </>)}
            {step === 2 && (<>
              <h2 className="mb-3 font-medium">Default editor layout</h2>
              <Option selected={layout === "side-by-side"} onClick={() => setLayout("side-by-side")} title="Side by side" desc="Blocks left, code right." icon={<Columns2 size={16} />} />
              <Option selected={layout === "blocks-first"} onClick={() => setLayout("blocks-first")} title="Blocks first" desc="Larger block canvas, code as a side panel." icon={<Blocks size={16} />} />
              <Option selected={layout === "code-first"} onClick={() => setLayout("code-first")} title="Code first" desc="Larger code editor, blocks as a side panel." icon={<Code2 size={16} />} />
              <Option selected={layout === "focus"} onClick={() => setLayout("focus")} title="Focus" desc="One pane at a time." icon={<Maximize2 size={16} />} />
            </>)}
            {step === 3 && (<>
              <h2 className="mb-3 font-medium">Start from…</h2>
              <Option selected={template === "dht11-esp32"} onClick={() => setTemplate("dht11-esp32")} title="Guided: DHT11 on ESP32" desc="Temperature & humidity, the flagship example." />
              {templates.filter((t) => t.id !== "dht11-esp32").slice(0, 3).map((t) => <Option key={t.id} selected={template === t.id} onClick={() => setTemplate(t.id)} title={t.title} desc={t.description} />)}
              <Option selected={template === "blank"} onClick={() => setTemplate("blank")} title="Blank sketch" desc="Empty setup() and loop()." />
            </>)}
          </motion.div>
          <div className="mt-7 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => (step === 0 ? finish(null) : setStep(step - 1))} disabled={pending}>{step === 0 ? "Skip for now" : "Back"}</Button>
            {step < 3 ? <Button variant="primary" onClick={() => setStep(step + 1)}>Continue</Button>
              : <Button variant="primary" onClick={() => finish(template)} disabled={pending}>{pending && <Spinner />}Open the workbench</Button>}
          </div>
        </div>
      </main>
    </div>
  );
}
