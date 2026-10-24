/** Toolbox (categories per spec 5.1) + searchable metadata. Pure data. */
import { CATEGORY_LABELS, FRIENDLY_BY_TYPE, FRIENDLY_CALLS, categoryLabel, friendlyText, type Category } from "./catalog";
import { BLOCK_MESSAGES_EN, bm, foldSearch, getBlockLocale, keywordList, type BlockLocale, type BlockMessageKey } from "./i18n";
import type { BlockState } from "./state";

export interface ToolboxEntry {
  key: string;
  type: string;
  category: Category;
  name: string;
  description: string;
  keywords: string[];
  aliases: string[];
  /** Blockly block state to insert (without id). */
  preset: Omit<BlockState, "id">;
  placement: "top" | "stmt" | "both" | "value";
}

const num = (n: string) => ({ shadow: { type: "pf_number", fields: { NUM: n } } });
const con = (n: string) => ({ shadow: { type: "pf_constant", fields: { NAME: n } } });
const ident = (n: string) => ({ block: { type: "pf_ident", fields: { NAME: n } } });
const str = (t: string) => ({ shadow: { type: "pf_string", fields: { TEXT: t } } });

const FRIENDLY_PRESET_INPUTS: Record<string, Record<string, unknown>> = {
  pf_pin_mode: { PIN: num("13"), MODE: con("OUTPUT") },
  pf_digital_write: { PIN: num("13"), VALUE: con("HIGH") },
  pf_digital_read: { PIN: num("2") },
  pf_analog_read: { PIN: num("34") },
  pf_analog_write: { PIN: num("9"), VALUE: num("128") },
  pf_delay: { MS: num("1000") },
  pf_delay_us: { US: num("10") },
  pf_serial_begin: { BAUD: num("115200") },
  pf_serial_print: { VALUE: str("Hello") },
  pf_serial_println: { VALUE: str("Hello") },
  pf_map: { VALUE: ident("value"), FROM_LOW: num("0"), FROM_HIGH: num("1023"), TO_LOW: num("0"), TO_HIGH: num("255") },
  pf_constrain: { VALUE: ident("value"), LOW: num("0"), HIGH: num("255") },
  pf_min: { A: num("0"), B: num("10") },
  pf_max: { A: num("0"), B: num("10") },
  pf_abs: { VALUE: ident("value") },
  pf_isnan: { VALUE: ident("t") },
};

function e(key: string, type: string, category: Category, name: string, description: string, keywords: string[], placement: ToolboxEntry["placement"], preset: Record<string, unknown> = {}, aliases: string[] = []): ToolboxEntry {
  return { key, type, category, name, description, keywords, aliases, placement, preset: { type, ...preset } as Omit<BlockState, "id"> };
}

const varDeclPreset = (name: string, value: string, isConst: boolean) => ({
  fields: { TYPE: "int", NAME: name, CONST: isConst ? "TRUE" : "FALSE" },
  extraState: { isArray: false, hasInit: true, itemCount: null },
  inputs: { INIT: { block: { type: "pf_number", fields: { NUM: value } } } },
});

export const TOOLBOX_ENTRIES: ToolboxEntry[] = [
  e("pf_setup", "pf_setup", "structure", "setup()", "Runs once at start-up.", ["start", "init", "once"], "top", {}, ["void setup"]),
  e("pf_loop", "pf_loop", "structure", "loop()", "Repeats forever.", ["repeat", "forever", "main"], "top", {}, ["void loop"]),
  e("pf_comment", "pf_comment", "structure", "Comment", "A note kept verbatim in the code.", ["note", "remark", "//"], "both", { extraState: { text: "// note" } }),
  e("pf_if", "pf_if", "flow", "if", "Run blocks when a condition is true.", ["condition", "branch", "when"], "stmt", { extraState: { branchIds: [null], hasElse: false } }),
  e("pf_if_else", "pf_if", "flow", "if / else", "Two-way branch.", ["condition", "otherwise", "else"], "stmt", { extraState: { branchIds: [null], hasElse: true } }, ["ifelse"]),
  e("pf_for", "pf_for", "flow", "for loop", "Counted loop.", ["repeat", "count", "iterate"], "stmt", {
    extraState: { hasInit: true, hasCond: true, update: "expr" },
    inputs: {
      INIT: { block: { type: "pf_var_decl", ...varDeclPreset("i", "0", false) } },
      COND: { block: { type: "pf_compare", fields: { OP: "<" }, inputs: { A: ident("i"), B: { block: { type: "pf_number", fields: { NUM: "10" } } } } } },
      UPDATE: { block: { type: "pf_update", fields: { OP: "++", FIX: "POST" }, inputs: { TARGET: ident("i") } } },
    },
  }),
  e("pf_while", "pf_while", "flow", "while", "Repeat while true.", ["loop", "repeat", "until"], "stmt"),
  e("pf_do_while", "pf_do_while", "flow", "do … while", "Run once then repeat while true.", ["loop", "repeat"], "stmt"),
  e("pf_switch", "pf_switch", "flow", "switch", "Choose by value.", ["case", "select", "menu"], "stmt", { extraState: { cases: [{ id: null, isDefault: false }, { id: null, isDefault: true }] } }),
  e("pf_break", "pf_break", "flow", "break", "Leave the loop/switch.", ["exit", "stop"], "stmt"),
  e("pf_continue", "pf_continue", "flow", "continue", "Skip to next iteration.", ["skip", "next"], "stmt"),
  e("pf_compare", "pf_compare", "logic", "compare", "== != < <= > >=", ["equal", "greater", "less", "comparison"], "value", { fields: { OP: "==" } }),
  e("pf_logic", "pf_logic", "logic", "and / or", "Combine conditions.", ["and", "or", "&&", "||", "boolean"], "value", { fields: { OP: "&&" } }),
  e("pf_not", "pf_not", "logic", "not", "Invert a condition.", ["negate", "!"], "value"),
  e("pf_bool", "pf_bool", "logic", "true / false", "Boolean value.", ["boolean", "yes", "no"], "value", { fields: { BOOL: "TRUE" } }),
  e("pf_ternary", "pf_ternary", "logic", "? :", "Inline choice.", ["ternary", "conditional"], "value"),
  e("pf_number", "pf_number", "math", "number", "A number literal.", ["integer", "float", "value", "digit"], "value", { fields: { NUM: "0" } }),
  e("pf_arith", "pf_arith", "math", "arithmetic", "+ − × ÷ %", ["add", "plus", "minus", "multiply", "divide", "modulo"], "value", { fields: { OP: "+" } }),
  e("pf_bitwise", "pf_bitwise", "math", "bitwise", "& | ^ << >>", ["bit", "shift", "mask"], "value", { fields: { OP: "&" } }),
  e("pf_unary", "pf_unary", "math", "negate", "Unary − + ~", ["minus", "negative"], "value", { fields: { OP: "-" } }),
  e("pf_paren", "pf_paren", "math", "( … )", "Parentheses.", ["group", "brackets"], "value"),
  e("pf_var_decl", "pf_var_decl", "variables", "declare variable", "int / float / bool / unsigned long …", ["variable", "create", "int", "float", "global", "local"], "both", varDeclPreset("value", "0", false)),
  e("pf_const_decl", "pf_var_decl", "variables", "declare constant", "const int PIN = 4;", ["constant", "const", "pin number"], "both", varDeclPreset("PIN", "4", true)),
  e("pf_assign", "pf_assign", "variables", "set variable", "Assign or update (= += -= …).", ["assign", "set", "change", "increase"], "stmt", { fields: { OP: "=" }, inputs: { TARGET: ident("value") } }),
  e("pf_ident", "pf_ident", "variables", "variable", "Read a variable.", ["get", "reference", "name"], "value", { fields: { NAME: "value" } }),
  e("pf_index", "pf_index", "variables", "array item", "a[i]", ["array", "index", "element"], "value"),
  e("pf_update", "pf_update", "variables", "++ / --", "Increment / decrement.", ["increment", "decrement", "counter"], "value", { fields: { OP: "++", FIX: "POST" } }),
  e("pf_constant", "pf_constant", "pins", "HIGH / LOW / OUTPUT …", "Arduino constants.", ["high", "low", "input", "output", "pullup", "led_builtin"], "value", { fields: { NAME: "HIGH" } }),
  e("pf_function", "pf_function", "functions", "define function", "Your own function.", ["procedure", "method", "subroutine"], "top", { fields: { RTYPE: "void", NAME: "myFunction", PARAMS: "" }, extraState: { params: [] } }),
  e("pf_call", "pf_call", "functions", "call function", "Call a function (value).", ["invoke", "run"], "value", { fields: { NAME: "myFunction" }, extraState: { argCount: 0 } }),
  e("pf_expr_stmt", "pf_expr_stmt", "functions", "do (call as statement)", "Evaluate a value block as a statement.", ["call", "statement", "run"], "stmt"),
  e("pf_return", "pf_return", "functions", "return", "Return from a function.", ["result", "exit"], "stmt", { extraState: { hasValue: true } }),
  e("pf_method_call", "pf_method_call", "functions", "object.method()", "Call a library method.", ["method", "library", "object"], "value", { fields: { OBJ: "obj", METHOD: "method" }, extraState: { argCount: 0 } }),
  e("pf_dht_object", "pf_dht_object", "sensors", "DHT sensor object", "DHT dht(pin, DHT11);", ["dht", "dht11", "dht22", "temperature", "humidity", "sensor"], "top", { fields: { NAME: "dht" }, inputs: { PIN: num("4"), TYPE: con("DHT11") } }),
  e("pf_include", "pf_include", "advanced", "#include", "Include a library header.", ["library", "header", "import"], "top", { fields: { PATH: "DHT.h", SYSTEM: "SYSTEM" } }),
  e("pf_define", "pf_define", "advanced", "#define", "Preprocessor macro.", ["macro", "preprocessor"], "top", { fields: { NAME: "LED_PIN", VALUE: "13" } }),
  e("pf_object", "pf_object", "advanced", "library object", "Servo myServo;", ["object", "instance", "class", "servo"], "top", { fields: { CLASS: "Servo", NAME: "myServo" }, extraState: { argCount: 0, hasParens: false } }),
  e("pf_raw_stmt", "pf_raw_stmt", "advanced", "Advanced C++ statement", "Raw C++ kept byte-for-byte.", ["raw", "code", "c++", "custom", "unsupported"], "stmt", { extraState: { text: "// your C++ here", reason: "user-authored raw code" } }),
  e("pf_raw_top", "pf_raw_top", "advanced", "Advanced C++ (top level)", "Raw C++ declarations kept byte-for-byte.", ["raw", "class", "struct", "template"], "top", { extraState: { text: "// your C++ here", reason: "user-authored raw code" } }),
  e("pf_raw_expr", "pf_raw_expr", "advanced", "Advanced C++ expression", "Raw C++ expression.", ["raw", "expression"], "value", { extraState: { text: "0", reason: "user-authored raw code" } }),
  e("pf_string", "pf_string", "serial", "text", "String literal.", ["string", "message", "text"], "value", { fields: { TEXT: "Hello" } }),
  e("pf_char", "pf_char", "serial", "character", "Char literal.", ["char", "letter"], "value", { fields: { TEXT: "a" } }),
  ...FRIENDLY_CALLS.map((f) => e(f.type, f.type, f.category,
    f.label.replace(/%OBJ/g, "dht").replace(/%[A-Z_]+/g, "…").replace(/\s+/g, " ").trim(), f.tooltip, f.keywords,
    f.shape === "stmt" ? "stmt" : "value",
    { ...(f.objectClass ? { fields: { OBJ: "dht" } } : {}), ...(FRIENDLY_PRESET_INPUTS[f.type] ? { inputs: FRIENDLY_PRESET_INPUTS[f.type] } : {}) },
    [f.callee ?? `${f.object ?? "dht"}.${f.method}`])),
];

export const CATEGORY_ORDER: Category[] = ["structure", "flow", "logic", "math", "variables", "pins", "analog", "time", "serial", "sensors", "functions", "advanced"];

/** Display name of a friendly-call template (`%OBJ` -> "dht", inputs -> "…"). */
function friendlyName(label: string): string {
  return label.replace(/%OBJ/g, "dht").replace(/%[A-Z_]+/g, "…").replace(/\s+/g, " ").trim();
}

/**
 * The entry with its name/description/keywords in `locale` (default: the
 * active block locale). Key, type, preset and placement never change.
 */
export function localizeEntry(entry: ToolboxEntry, locale: BlockLocale = getBlockLocale()): ToolboxEntry {
  if (locale === "en") return entry;
  const f = FRIENDLY_BY_TYPE.get(entry.key);
  if (f) {
    const t = friendlyText(f, locale);
    return { ...entry, name: friendlyName(t.label), description: t.tooltip, keywords: t.keywords };
  }
  const k = (p: string) => `tb.${entry.key}.${p}` as BlockMessageKey;
  if (!(k("name") in BLOCK_MESSAGES_EN)) return entry;
  return { ...entry, name: bm(k("name"), undefined, locale), description: bm(k("desc"), undefined, locale), keywords: keywordList(bm(k("kw"), undefined, locale)) };
}

/** All toolbox entries in `locale`. */
export function localizedEntries(locale: BlockLocale = getBlockLocale()): ToolboxEntry[] {
  return TOOLBOX_ENTRIES.map((e) => localizeEntry(e, locale));
}

/** Blockly categoryToolbox JSON (category names in `locale`, default: active). */
export function buildToolbox(locale: BlockLocale = getBlockLocale()): { kind: "categoryToolbox"; contents: Array<Record<string, unknown>> } {
  return {
    kind: "categoryToolbox",
    contents: CATEGORY_ORDER.map((cat) => ({
      kind: "category",
      name: categoryLabel(cat, locale),
      categorystyle: `${cat}_category`,
      contents: TOOLBOX_ENTRIES.filter((t) => t.category === cat).map((t) => ({ kind: "block", ...t.preset })),
    })),
  };
}

const splitWords = (s: string) => foldSearch(s).split(/[\s,;:/()[\]{}.\-–—«»"'’]+/).filter(Boolean);

function scoreEntry(t: ToolboxEntry, terms: string[], catLabel: string): number {
  let score = 0;
  const name = foldSearch(t.name);
  for (const term of terms) {
    const wordStart = (s: string) => splitWords(s).some((w) => w.startsWith(term));
    if (name === term) score += 10;
    else if (name.startsWith(term)) score += 6;
    else if (name.includes(term)) score += 3;
    if (t.aliases.some((a) => foldSearch(a).includes(term))) score += 5;
    if (t.keywords.some((k) => foldSearch(k) === term)) score += 4;
    else if (t.keywords.some(wordStart)) score += 3;
    if (wordStart(t.description)) score += 1;
    if (foldSearch(catLabel).includes(term)) score += 1;
  }
  return score;
}

/**
 * Rank toolbox entries for a query across names, keywords, descriptions and
 * aliases — in the active language AND in English, so "led", "humidité" and
 * "رطوبة" all find their blocks. Returned entries are localized to `locale`.
 */
export function searchToolbox(query: string, limit = 20, locale: BlockLocale = getBlockLocale()): ToolboxEntry[] {
  const q = foldSearch(query.trim());
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored = TOOLBOX_ENTRIES.map((en) => {
    const loc = localizeEntry(en, locale);
    const enScore = scoreEntry(en, terms, CATEGORY_LABELS[en.category]);
    const locScore = locale === "en" ? 0 : scoreEntry(loc, terms, categoryLabel(en.category, locale));
    return { t: loc, score: Math.max(enScore, locScore) };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name));
  return scored.slice(0, limit).map((x) => x.t);
}
