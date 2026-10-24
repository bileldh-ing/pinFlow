/** Locale configuration shared by server and client. English is the default and the fallback. */
export const LOCALES = ["en", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "pf-locale";
export const LOCALE_STORAGE = "pf-locale";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", fr: "Français", ar: "العربية" };
/** BCP 47 tags used for Intl date/number formatting. */
export const LOCALE_TAGS: Record<Locale, string> = { en: "en-GB", fr: "fr-FR", ar: "ar" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}
export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Pick the best supported locale from an Accept-Language header (q-weighted); fallback en. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const prefs = acceptLanguage.split(",").map((part, i) => {
    const [tag, ...params] = part.trim().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return { tag: (tag ?? "").toLowerCase(), q: q ? Number(q.slice(2)) || 0 : 1, i };
  }).filter((p) => p.tag && p.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
  for (const p of prefs) {
    const base = p.tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Resolve the request locale: explicit cookie first, then Accept-Language, then English. */
export function resolveLocale(cookieValue: string | undefined | null, acceptLanguage: string | null | undefined): Locale {
  return isLocale(cookieValue) ? cookieValue : negotiateLocale(acceptLanguage);
}
