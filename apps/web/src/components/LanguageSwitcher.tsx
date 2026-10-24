"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, Globe } from "lucide-react";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";

/** Globe + current language code; dropdown lists every language in its own name with a check on the active one. */
export function LanguageSwitcher({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { locale, setLocale, t, dir } = useI18n();
  return (
    <Menu.Root dir={dir} modal={false}>
      <Menu.Trigger
        className={`pf-transition pf-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold text-muted outline-none hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] data-[state=open]:bg-surface-hover data-[state=open]:text-fg ${className}`}
        aria-label={t("lang.change", { name: LOCALE_NAMES[locale] })} title={t("lang.label")} data-testid="lang-switcher">
        <Globe size={16} aria-hidden />
        {!compact && <span className="uppercase tracking-wide" data-testid="lang-current">{locale}</span>}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} className="glass-solid pf-menu z-[60] min-w-[176px] rounded-2xl p-1.5 text-[13.5px]" data-testid="lang-menu">
          <Menu.Label className="px-2.5 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">{t("lang.label")}</Menu.Label>
          <Menu.RadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
            {LOCALES.map((l) => (
              <Menu.RadioItem key={l} value={l} lang={l} dir={l === "ar" ? "rtl" : "ltr"} data-testid={`lang-option-${l}`}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 outline-none data-[highlighted]:bg-surface-hover ${l === "ar" ? "pf-font-ar" : ""}`}>
                <span className="w-6 shrink-0 text-[10.5px] font-bold uppercase text-faint" dir="ltr">{l}</span>
                <span className="flex-1 text-start">{LOCALE_NAMES[l]}</span>
                <Menu.ItemIndicator><Check size={14} className="text-accent" aria-hidden /></Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
