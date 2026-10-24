/**
 * Applies a UI locale to Blockly: Blockly's own core messages (context
 * menus, delete/duplicate, …) plus PinFlow's block text. Block display text
 * is read when blocks are created, so the pane re-creates its workspace
 * after calling this (see BlocklyPane).
 */
import * as En from "blockly/msg/en";
import * as Fr from "blockly/msg/fr";
import * as Ar from "blockly/msg/ar";
import { setBlockLocale } from "@pinflow/block-definitions";
import { Blockly } from "@pinflow/block-definitions/blockly";
import type { Locale } from "@/i18n/config";

const CORE = { en: En, fr: Fr, ar: Ar } as const;

export function applyBlocklyLocale(locale: Locale): void {
  // English first so any key missing from a translation falls back to English.
  Blockly.setLocale(CORE.en as unknown as Record<string, string>);
  if (locale !== "en") Blockly.setLocale(CORE[locale] as unknown as Record<string, string>);
  setBlockLocale(locale);
}
