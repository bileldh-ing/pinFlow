import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "warn";
type Size = "sm" | "md" | "lg" | "icon";

const base = "pf-transition pf-press inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100";
const variants: Record<Variant, string> = {
  primary: "pf-accent-fill pf-accent-glow hover:brightness-110 hover:-translate-y-px",
  secondary: "border border-line-strong bg-surface-inner text-fg hover:bg-surface-hover hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)]",
  ghost: "text-muted hover:text-fg hover:bg-surface-hover",
  danger: "bg-[#c2362b] text-white hover:brightness-110",
  warn: "bg-warn text-warn-ink hover:brightness-105",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3.5 text-[12.5px]", md: "h-10 px-5 text-sm", lg: "h-12 px-6 text-[15px]", icon: "h-9 w-9 text-sm" };

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({ variant = "secondary", size = "md", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={props.type ?? "button"} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ href, variant = "secondary", size = "md", className = "", children, ...rest }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode; "aria-label"?: string }) {
  return <Link href={href} className={buttonClass(variant, size, className)} {...rest}>{children}</Link>;
}

export function Card({ className = "", children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" | "li" }) {
  return <As className={`glass rounded-[var(--radius)] ${className}`}>{children}</As>;
}

export function Chip({ tone = "neutral", children, className = "", title }: { tone?: "neutral" | "accent" | "warn" | "danger" | "ok" | "info"; children: ReactNode; className?: string; title?: string }) {
  const tones = {
    neutral: "border-line text-muted bg-surface-inner",
    accent: "border-accent/40 text-accent bg-accent/12",
    warn: "border-warn/45 text-warn bg-warn/10",
    danger: "border-danger/45 text-danger bg-danger/10",
    ok: "border-ok/40 text-ok bg-ok/10",
    info: "border-info/40 text-info bg-info/10",
  } as const;
  return <span title={title} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold leading-5 whitespace-nowrap ${tones[tone]} ${className}`}>{children}</span>;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`pf-transition h-11 w-full rounded-full border border-line-strong bg-surface-inner px-4 text-sm text-fg placeholder:text-faint focus:border-accent-strong focus:outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--accent-strong)_18%,transparent)] ${className}`} {...props} />;
}

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-muted">{children}</label>;
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return <p id={id} role="alert" className="mt-1.5 text-[13px] text-danger">{children}</p>;
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-e-transparent ${className}`} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-inner px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 glass-inner rounded-[var(--radius)] border-dashed border-line-strong px-6 py-14 text-center">
      {icon && <div className="grid h-14 w-14 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/30">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

/** Circular icon chip (stat tiles, feature cards) — the reference's round glass badges. */
export function IconChip({ children, tone = "neutral", size = 40, className = "" }: { children: ReactNode; tone?: "neutral" | "accent" | "mint"; size?: number; className?: string }) {
  const tones = {
    neutral: "bg-surface-hover text-fg ring-1 ring-line",
    accent: "pf-accent-fill pf-accent-glow",
    mint: "bg-[color-mix(in_srgb,var(--accent-2)_16%,transparent)] text-accent2 ring-1 ring-[color-mix(in_srgb,var(--accent-2)_35%,transparent)]",
  } as const;
  return <span aria-hidden style={{ width: size, height: size }} className={`inline-grid shrink-0 place-items-center rounded-full ${tones[tone]} ${className}`}>{children}</span>;
}

/** Stat tile: icon chip + label + value, as in the reference's top strip. */
export function Stat({ icon, label, value, tone = "neutral", testId }: { icon: ReactNode; label: string; value: ReactNode; tone?: "neutral" | "accent" | "mint"; testId?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3" data-testid={testId}>
      <IconChip tone={tone}>{icon}</IconChip>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-muted">{label}</div>
        <div className="truncate text-[17px] font-bold tracking-tight text-fg">{value}</div>
      </div>
    </div>
  );
}
