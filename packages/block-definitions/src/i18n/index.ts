/**
 * Block-text localization. Pure data + a tiny lookup; DOM-free so it also
 * runs in Node/Web Workers. English is the source and the fallback.
 *
 * The active locale only changes what blocks DISPLAY (labels, dropdown
 * captions, tooltips, menus, toolbox names). Block types, field names, field
 * values and the IR/C++ round trip never depend on it.
 */
import { BLOCK_MESSAGES_EN, type BlockMessageKey, type BlockMessages } from "./en";
import { BLOCK_MESSAGES_FR } from "./fr";
import { BLOCK_MESSAGES_AR } from "./ar";

export type BlockLocale = "en" | "fr" | "ar";
export const BLOCK_LOCALES: readonly BlockLocale[] = ["en", "fr", "ar"] as const;
export { BLOCK_MESSAGES_EN, type BlockMessageKey, type BlockMessages };

export const BLOCK_MESSAGES: Record<BlockLocale, BlockMessages> = {
  en: BLOCK_MESSAGES_EN,
  fr: BLOCK_MESSAGES_FR,
  ar: BLOCK_MESSAGES_AR,
};

let current: BlockLocale = "en";

export function setBlockLocale(locale: BlockLocale): void {
  current = BLOCK_LOCALES.includes(locale) ? locale : "en";
}
export function getBlockLocale(): BlockLocale { return current; }

/** Look up block text in `locale` (default: the active one), falling back to English. */
export function bm(key: BlockMessageKey, params?: Record<string, string | number>, locale: BlockLocale = current): string {
  let s = BLOCK_MESSAGES[locale]?.[key] ?? BLOCK_MESSAGES_EN[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Has `key` a dedicated translation in `locale`? (English always does.) */
export function hasBlockMessage(key: string, locale: BlockLocale = current): boolean {
  return (BLOCK_MESSAGES[locale] as Record<string, string | undefined>)[key] !== undefined;
}

/** Split a comma-separated keyword list. */
export function keywordList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Lowercase + strip Latin diacritics (é → e) for accent-insensitive search; Arabic is kept, tashkeel removed. */
export function foldSearch(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}
