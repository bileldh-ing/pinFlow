/** Tiny type-safe translator: flat dotted keys, `{name}` interpolation, English fallback. */
import { en, type MessageKey } from "./messages/en";
import { fr } from "./messages/fr";
import { ar } from "./messages/ar";
import type { Locale } from "./config";

export type { MessageKey };
export type Messages = Partial<Record<MessageKey, string>>;
export type Params = Record<string, string | number>;
export type TFunction = (key: MessageKey, params?: Params) => string;

export const MESSAGES: Record<Locale, Messages> = { en, fr, ar };

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  let s: string = MESSAGES[locale]?.[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function createT(locale: Locale): TFunction {
  return (key, params) => translate(locale, key, params);
}

/** Is `s` a known message key? (Used to translate server-side validation messages.) */
export function isMessageKey(s: string): s is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, s);
}
