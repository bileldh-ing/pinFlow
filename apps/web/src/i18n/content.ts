/** Helpers for localizing data that comes from catalogues (templates). */
import { isMessageKey, type TFunction } from "./translate";

export function tplTitle(t: TFunction, id: string, fallback: string): string {
  const k = `tpl.${id}.title`;
  return isMessageKey(k) ? t(k) : fallback;
}
export function tplDesc(t: TFunction, id: string, fallback: string): string {
  const k = `tpl.${id}.desc`;
  return isMessageKey(k) ? t(k) : fallback;
}
export function tplCategory(t: TFunction, category: string): string {
  const k = `tpl.cat.${category}`;
  return isMessageKey(k) ? t(k) : category;
}
/** Translate a message that may be a message key (server validation / action results); unknown text passes through. */
export function tMaybe(t: TFunction, s: string | undefined | null): string {
  if (!s) return "";
  return isMessageKey(s) ? t(s) : s;
}
