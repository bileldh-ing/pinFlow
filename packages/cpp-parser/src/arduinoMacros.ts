/**
 * Arduino-aware normalization (spec 3.2 step 4), deliberately minimal.
 *
 * Attribute macros such as `PROGMEM` or `IRAM_ATTR` are expanded by the board core to
 * `__attribute__((...))`; tree-sitter does not know them and reports a syntax error
 * (e.g. `const char msg[] PROGMEM = "x";`, `void IRAM_ATTR isr()`). We hand tree-sitter
 * a copy of the source where those identifiers (outside strings, chars, comments and
 * preprocessor lines) are replaced by spaces of the same length, so every offset stays
 * identical. The mapper always reads text from the ORIGINAL source and turns any
 * statement / top-level item that contains a masked macro into a raw node, so the macro
 * is never dropped from generated code.
 */
export const ATTRIBUTE_MACROS = [
  "PROGMEM",
  "IRAM_ATTR",
  "DRAM_ATTR",
  "RTC_DATA_ATTR",
  "RTC_RODATA_ATTR",
  "RTC_NOINIT_ATTR",
  "ICACHE_RAM_ATTR",
  "ICACHE_FLASH_ATTR",
  "WORD_ALIGNED_ATTR",
  "EXT_RAM_ATTR",
] as const;

const SET = new Set<string>(ATTRIBUTE_MACROS);

export interface MaskResult {
  masked: string;
  /** [start, end) UTF-16 ranges that were masked, with the macro name. */
  ranges: { start: number; end: number; name: string }[];
}

export function maskAttributeMacros(src: string): MaskResult {
  const ranges: MaskResult["ranges"] = [];
  let out: string[] | null = null;
  let i = 0;
  let lineStart = true;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === "\n") {
      lineStart = true;
      i++;
      continue;
    }
    if (lineStart && (c === " " || c === "\t" || c === "\r")) {
      i++;
      continue;
    }
    if (lineStart && c === "#") {
      // skip the preprocessor line, honouring backslash continuations
      while (i < n && !(src[i] === "\n" && src[i - 1] !== "\\" && !(src[i - 1] === "\r" && src[i - 2] === "\\"))) i++;
      continue;
    }
    lineStart = false;
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      const word = src.slice(i, j);
      if (SET.has(word)) {
        ranges.push({ start: i, end: j, name: word });
        if (!out) out = src.split("");
        for (let k = i; k < j; k++) out[k] = " ";
      }
      i = j;
      continue;
    }
    i++;
  }
  return { masked: out ? out.join("") : src, ranges };
}
