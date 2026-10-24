"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutGrid, LayoutTemplate, LogOut, Settings } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

const ITEMS = [
  { href: "/dashboard", label: "Projects", icon: LayoutGrid, match: (p: string) => p === "/dashboard" || p.startsWith("/projects") },
  { href: "/templates", label: "Templates", icon: LayoutTemplate, match: (p: string) => p.startsWith("/templates") },
  { href: "/docs", label: "Docs", icon: BookOpen, match: (p: string) => p.startsWith("/docs") },
  { href: "/settings/profile", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

/** Floating vertical pill rail with a spring-y glowing orange active circle (wide screens only). */
export function AppRail() {
  const path = usePathname() ?? "";
  const reduce = useReducedMotion();
  return (
    <nav aria-label="App sections" className="glass fixed left-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-2 rounded-full p-2 min-[1400px]:flex">
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const active = match(path);
        return (
          <Link key={href} href={href} aria-label={label} title={label} aria-current={active ? "page" : undefined}
            className={`pf-press relative grid h-11 w-11 place-items-center rounded-full ${active ? "text-accent-ink" : "text-muted hover:bg-surface-hover hover:text-fg"}`}>
            {active && <motion.span layoutId="app-rail-dot" className="pf-accent-fill pf-accent-glow absolute inset-0 rounded-full" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 34 }} />}
            <Icon size={18} className="relative" />
          </Link>
        );
      })}
      <div className="my-1 h-px w-6 bg-line" />
      <form action="/logout" method="post">
        <button type="submit" aria-label="Sign out" title="Sign out" className="pf-press grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-fg"><LogOut size={18} /></button>
      </form>
    </nav>
  );
}
