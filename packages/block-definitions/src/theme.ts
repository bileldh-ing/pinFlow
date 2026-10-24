/**
 * "Liquid Glass" Blockly themes (dark graphite default + light). All colours
 * come from the category token table in ./catalog.
 */
import * as Blockly from "blockly";
import { CATEGORY_COLORS, type Category } from "./catalog";

function mix(hex: string, target: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex); const b = p(target);
  return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

function styles(dark: boolean) {
  const blockStyles: Record<string, Blockly.Theme.BlockStyle> = {};
  const categoryStyles: Record<string, Blockly.Theme.CategoryStyle> = {};
  for (const [cat, color] of Object.entries(CATEGORY_COLORS) as [Category, string][]) {
    blockStyles[`${cat}_blocks`] = {
      colourPrimary: color,
      colourSecondary: mix(color, dark ? "#161311" : "#ffffff", 0.35),
      colourTertiary: mix(color, dark ? "#000000" : "#21180f", 0.3),
      hat: "",
    };
    categoryStyles[`${cat}_category`] = { colour: color };
  }
  return { blockStyles, categoryStyles };
}

type ThemePair = { dark: Blockly.Theme; light: Blockly.Theme };
/** One theme pair per font stack (the Arabic UI uses an Arabic-first stack); names stay unique per pair. */
const cache = new Map<string, ThemePair>();
let lastPair: ThemePair | undefined;

export function defineGlassThemes(fontFamily?: string): ThemePair {
  if (!fontFamily && lastPair) return lastPair;
  const cacheKey = fontFamily ?? "";
  const hit = cache.get(cacheKey);
  if (hit) { lastPair = hit; return hit; }
  const suffix = cache.size ? `-${cache.size}` : "";
  const d = styles(true);
  const l = styles(false);
  const font = { family: fontFamily ? `${fontFamily}, ui-sans-serif, system-ui, sans-serif` : "\"Plus Jakarta Sans\", ui-sans-serif, system-ui, sans-serif", weight: "700", size: 11 };
  const dark = Blockly.Theme.defineTheme(`pinflow-warm-dark${suffix}`, {
    name: `pinflow-warm-dark${suffix}`,
    base: Blockly.Themes.Classic,
    blockStyles: d.blockStyles,
    categoryStyles: d.categoryStyles,
    componentStyles: {
      workspaceBackgroundColour: "#161311", toolboxBackgroundColour: "#1c1815", toolboxForegroundColour: "#f3ece5",
      flyoutBackgroundColour: "#241e1a", flyoutForegroundColour: "#f3ece5", flyoutOpacity: 0.98,
      scrollbarColour: "#6d5f53", scrollbarOpacity: 0.55, insertionMarkerColour: "#ff7a1a", insertionMarkerOpacity: 0.55,
      markerColour: "#ff7a1a", cursorColour: "#5ef0c8",
    },
    fontStyle: font,
    startHats: false,
  });
  const light = Blockly.Theme.defineTheme(`pinflow-warm-light${suffix}`, {
    name: `pinflow-warm-light${suffix}`,
    base: Blockly.Themes.Classic,
    blockStyles: l.blockStyles,
    categoryStyles: l.categoryStyles,
    componentStyles: {
      workspaceBackgroundColour: "#fbf8f5", toolboxBackgroundColour: "#f4eee8", toolboxForegroundColour: "#21180f",
      flyoutBackgroundColour: "#fffcf9", flyoutForegroundColour: "#21180f", flyoutOpacity: 0.98,
      scrollbarColour: "#b9a999", scrollbarOpacity: 0.7, insertionMarkerColour: "#e8590c", insertionMarkerOpacity: 0.45,
      markerColour: "#e8590c", cursorColour: "#0f7a5f",
    },
    fontStyle: font,
    startHats: false,
  });
  const pair = { dark, light };
  cache.set(cacheKey, pair);
  lastPair = pair;
  return pair;
}
