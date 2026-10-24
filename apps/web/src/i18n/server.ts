import "server-only";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { createT, type TFunction } from "./translate";

/** Locale of the current request (cookie → Accept-Language → en). */
export async function getLocale(): Promise<Locale> {
  try {
    const [c, h] = await Promise.all([cookies(), headers()]);
    return resolveLocale(c.get(LOCALE_COOKIE)?.value, h.get("accept-language"));
  } catch {
    return "en"; // outside a request scope (build-time static rendering)
  }
}

export async function getT(): Promise<TFunction> {
  return createT(await getLocale());
}

export async function getI18n(): Promise<{ locale: Locale; t: TFunction }> {
  const locale = await getLocale();
  return { locale, t: createT(locale) };
}
