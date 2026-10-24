"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_STORAGE, LOCALE_TAGS, dirOf, isLocale, type Locale } from "./config";
import { createT, type TFunction } from "./translate";

interface I18nValue { locale: Locale; dir: "ltr" | "rtl"; t: TFunction; setLocale: (l: Locale) => void; formatDate: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string }

const I18nContext = createContext<I18nValue | null>(null);

/** Apply a locale to the document + persist it (cookie for the server, localStorage for the client). */
export function persistLocale(locale: Locale) {
  const html = document.documentElement;
  html.lang = locale;
  html.dir = dirOf(locale);
  html.dataset.locale = locale;
  try { localStorage.setItem(LOCALE_STORAGE, locale); } catch { /* storage unavailable */ }
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function I18nProvider({ locale: initial, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initial);
  useEffect(() => { setLocaleState(initial); }, [initial]);
  // Keep the cookie in sync with what the server rendered (e.g. first visit negotiated from Accept-Language).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE);
      if (!document.cookie.includes(`${LOCALE_COOKIE}=`) && isLocale(stored) && stored !== initial) { persistLocale(stored); setLocaleState(stored); router.refresh(); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setLocale = useCallback((l: Locale) => {
    if (!isLocale(l)) return;
    persistLocale(l);
    setLocaleState(l);
    window.dispatchEvent(new CustomEvent("pf-locale", { detail: l }));
    router.refresh(); // re-render server components in the new language
  }, [router]);
  const value = useMemo<I18nValue>(() => ({
    locale, dir: dirOf(locale), t: createT(locale), setLocale,
    formatDate: (d, opts) => new Intl.DateTimeFormat(LOCALE_TAGS[locale], opts ?? { dateStyle: "medium", timeStyle: "short" }).format(new Date(d)),
  }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const FALLBACK: I18nValue = {
  locale: "en", dir: "ltr", t: createT("en"), setLocale: () => undefined,
  formatDate: (d, opts) => new Intl.DateTimeFormat("en-GB", opts ?? { dateStyle: "medium", timeStyle: "short" }).format(new Date(d)),
};

export function useI18n(): I18nValue { return useContext(I18nContext) ?? FALLBACK; }
export function useT(): TFunction { return useI18n().t; }
