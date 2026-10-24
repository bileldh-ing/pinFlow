"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { LanguageSwitcher } from "./LanguageSwitcher";

export type ThemePref = "light" | "dark" | "system";
const KEY = "pf-theme";

function readPref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" || v === "system" ? v : "dark"; } catch { return "dark"; }
}
function resolve(p: ThemePref): "light" | "dark" {
  if (p !== "system") return p;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Resolved theme (always light|dark), tracking `data-theme` on <html>. */
export function useTheme(): ["dark" | "light", (t: "dark" | "light") => void] {
  const [theme, setThemeState] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () => setThemeState(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const setTheme = (t: "dark" | "light") => { applyThemePref(t); setThemeState(t); };
  return [theme, setTheme];
}

/** Persist a preference and apply it to <html data-theme>. */
export function applyThemePref(p: ThemePref) {
  try { localStorage.setItem(KEY, p); } catch { /* storage unavailable */ }
  const root = document.documentElement;
  root.classList.add("pf-theme-switching");
  root.dataset.theme = resolve(p);
  root.dataset.themePref = p;
  window.setTimeout(() => root.classList.remove("pf-theme-switching"), 320);
}

/** Preference (light | dark | system) with live OS tracking while "system" is selected. */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>("dark");
  useEffect(() => {
    setPref(readPref());
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) { const p = readPref(); setPref(p); document.documentElement.dataset.theme = resolve(p); } };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const f = () => { document.documentElement.dataset.theme = mq.matches ? "light" : "dark"; };
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [pref]);
  return [pref, (p) => { applyThemePref(p); setPref(p); }];
}

const ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/** Light / dark / system theme menu. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { t, dir } = useI18n();
  const [pref, setPref] = useThemePref();
  const [resolved] = useTheme();
  const Current = pref === "system" ? Monitor : resolved === "light" ? Sun : Moon;
  const name = (p: ThemePref) => t(p === "light" ? "theme.light" : p === "dark" ? "theme.dark" : "theme.system");
  return (
    <Menu.Root dir={dir} modal={false}>
      <Menu.Trigger aria-label={t("theme.change", { name: name(pref) })} title={t("theme.label")} data-testid="theme-toggle" data-pref={pref}
        className={`pf-transition pf-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted outline-none hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] data-[state=open]:bg-surface-hover data-[state=open]:text-fg ${className}`}>
        <Current size={16} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} className="glass-solid pf-menu z-[60] min-w-[168px] rounded-2xl p-1.5 text-[13.5px]" data-testid="theme-menu">
          <Menu.Label className="px-2.5 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">{t("theme.label")}</Menu.Label>
          <Menu.RadioGroup value={pref} onValueChange={(v) => setPref(v as ThemePref)}>
            {(["light", "dark", "system"] as const).map((p) => {
              const Icon = ICON[p];
              return (
                <Menu.RadioItem key={p} value={p} data-testid={`theme-option-${p}`} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 outline-none data-[highlighted]:bg-surface-hover">
                  <Icon size={15} className="shrink-0 text-muted" aria-hidden />
                  <span className="flex-1 text-start">{name(p)}</span>
                  <Menu.ItemIndicator><Check size={14} className="text-accent" aria-hidden /></Menu.ItemIndicator>
                </Menu.RadioItem>
              );
            })}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Both pro toggles side by side (language + theme). */
export function HeaderToggles({ className = "", compactLang = false }: { className?: string; compactLang?: boolean }) {
  return <div className={`flex items-center gap-0.5 ${className}`}><LanguageSwitcher compact={compactLang} /><ThemeToggle /></div>;
}
