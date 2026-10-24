/**
 * Shared catalogue of PinFlow block types. The adapter (IR <-> state), the
 * Blockly definitions and the toolbox all read from here so the three never
 * drift apart.
 */

import { bm, type BlockLocale, type BlockMessageKey } from "./i18n";

export type Category =
  | "structure" | "flow" | "logic" | "math" | "variables" | "pins"
  | "analog" | "time" | "serial" | "sensors" | "functions" | "advanced";

/** A specialised friendly block for a known Arduino API call. */
export interface FriendlyCall {
  type: string;
  /** Free function name (Call) — mutually exclusive with `method`. */
  callee?: string;
  /** Method call: object is fixed ("Serial") or taken from field OBJ (DHT). */
  object?: string;
  method?: string;
  /** Input names, one per argument, in order. */
  args: string[];
  /** "stmt" = statement block wrapping ExprStmt(Call); "value" = expression block. */
  shape: "stmt" | "value";
  category: Category;
  /** Label template. %OBJ and input names are substituted by the block builder. */
  label: string;
  tooltip: string;
  keywords: string[];
  /** Object must be a declared library object of this class (field OBJ). */
  objectClass?: string;
  output?: string | null;
}

export const FRIENDLY_CALLS: FriendlyCall[] = [
  { type: "pf_pin_mode", callee: "pinMode", args: ["PIN", "MODE"], shape: "stmt", category: "pins", label: "pinMode pin %PIN mode %MODE", tooltip: "Configure a pin as INPUT, OUTPUT or INPUT_PULLUP.", keywords: ["pin", "mode", "setup pin", "input", "output", "pullup"] },
  { type: "pf_digital_write", callee: "digitalWrite", args: ["PIN", "VALUE"], shape: "stmt", category: "pins", label: "digitalWrite pin %PIN to %VALUE", tooltip: "Set a digital pin HIGH or LOW.", keywords: ["write", "led", "on", "off", "high", "low", "digital output"] },
  { type: "pf_digital_read", callee: "digitalRead", args: ["PIN"], shape: "value", category: "pins", label: "digitalRead pin %PIN", tooltip: "Read HIGH/LOW from a digital pin.", keywords: ["read", "button", "digital input"], output: "Number" },
  { type: "pf_analog_read", callee: "analogRead", args: ["PIN"], shape: "value", category: "analog", label: "analogRead pin %PIN", tooltip: "Read the ADC value of an analog pin (0–1023 on AVR, 0–4095 on ESP32).", keywords: ["adc", "potentiometer", "analog input", "sensor"], output: "Number" },
  { type: "pf_analog_write", callee: "analogWrite", args: ["PIN", "VALUE"], shape: "stmt", category: "analog", label: "analogWrite pin %PIN value %VALUE", tooltip: "Write a PWM duty cycle. Availability depends on the board/core.", keywords: ["pwm", "fade", "dim", "brightness", "analog output"] },
  { type: "pf_delay", callee: "delay", args: ["MS"], shape: "stmt", category: "time", label: "delay %MS ms", tooltip: "Pause the program (blocks all other work).", keywords: ["wait", "sleep", "pause", "ms"] },
  { type: "pf_delay_us", callee: "delayMicroseconds", args: ["US"], shape: "stmt", category: "time", label: "delayMicroseconds %US µs", tooltip: "Pause for microseconds.", keywords: ["wait", "micro", "us"] },
  { type: "pf_millis", callee: "millis", args: [], shape: "value", category: "time", label: "millis()", tooltip: "Milliseconds since boot (unsigned long).", keywords: ["time", "timer", "non-blocking", "elapsed"], output: "Number" },
  { type: "pf_micros", callee: "micros", args: [], shape: "value", category: "time", label: "micros()", tooltip: "Microseconds since boot.", keywords: ["time", "timer", "micro"], output: "Number" },
  { type: "pf_serial_begin", object: "Serial", method: "begin", args: ["BAUD"], shape: "stmt", category: "serial", label: "Serial.begin baud %BAUD", tooltip: "Open the serial port at the given baud rate.", keywords: ["serial", "uart", "baud", "monitor", "start"] },
  { type: "pf_serial_print", object: "Serial", method: "print", args: ["VALUE"], shape: "stmt", category: "serial", label: "Serial.print %VALUE", tooltip: "Print without newline.", keywords: ["serial", "print", "log", "output", "monitor"] },
  { type: "pf_serial_println", object: "Serial", method: "println", args: ["VALUE"], shape: "stmt", category: "serial", label: "Serial.println %VALUE", tooltip: "Print followed by a newline.", keywords: ["serial", "println", "log", "line", "monitor"] },
  { type: "pf_map", callee: "map", args: ["VALUE", "FROM_LOW", "FROM_HIGH", "TO_LOW", "TO_HIGH"], shape: "value", category: "math", label: "map %VALUE from %FROM_LOW – %FROM_HIGH to %TO_LOW – %TO_HIGH", tooltip: "Re-map a number from one range to another (integer math).", keywords: ["scale", "range", "convert"], output: "Number" },
  { type: "pf_constrain", callee: "constrain", args: ["VALUE", "LOW", "HIGH"], shape: "value", category: "math", label: "constrain %VALUE between %LOW and %HIGH", tooltip: "Clamp a value to a range.", keywords: ["clamp", "limit", "bound"], output: "Number" },
  { type: "pf_min", callee: "min", args: ["A", "B"], shape: "value", category: "math", label: "min %A %B", tooltip: "Smaller of two values.", keywords: ["minimum", "smallest"], output: "Number" },
  { type: "pf_max", callee: "max", args: ["A", "B"], shape: "value", category: "math", label: "max %A %B", tooltip: "Larger of two values.", keywords: ["maximum", "largest"], output: "Number" },
  { type: "pf_abs", callee: "abs", args: ["VALUE"], shape: "value", category: "math", label: "abs %VALUE", tooltip: "Absolute value.", keywords: ["absolute", "positive"], output: "Number" },
  { type: "pf_isnan", callee: "isnan", args: ["VALUE"], shape: "value", category: "sensors", label: "isnan %VALUE", tooltip: "True when a float reading is not a number (e.g. failed sensor read).", keywords: ["nan", "failed", "invalid", "check", "error"], output: "Boolean" },
  { type: "pf_dht_begin", method: "begin", args: [], shape: "stmt", category: "sensors", objectClass: "DHT", label: "%OBJ.begin()", tooltip: "Start the DHT sensor (DHT sensor library).", keywords: ["dht", "dht11", "dht22", "sensor", "start"] },
  { type: "pf_dht_read_temp", method: "readTemperature", args: [], shape: "value", category: "sensors", objectClass: "DHT", label: "%OBJ temperature °C", tooltip: "Read temperature in °C (NaN on failure).", keywords: ["dht", "temperature", "celsius", "climate"], output: "Number" },
  { type: "pf_dht_read_hum", method: "readHumidity", args: [], shape: "value", category: "sensors", objectClass: "DHT", label: "%OBJ humidity %", tooltip: "Read relative humidity (NaN on failure).", keywords: ["dht", "humidity", "moisture", "climate"], output: "Number" },
];

export const FRIENDLY_BY_TYPE = new Map(FRIENDLY_CALLS.map((f) => [f.type, f]));

export const KNOWN_CONSTANTS = [
  "HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP", "LED_BUILTIN", "DHT11", "DHT22",
] as const;

export const ARITH_OPS = ["+", "-", "*", "/", "%"] as const;
export const COMPARE_OPS = ["==", "!=", "<", "<=", ">", ">="] as const;
export const LOGIC_OPS = ["&&", "||"] as const;
export const BITWISE_OPS = ["&", "|", "^", "<<", ">>"] as const;
export const ASSIGN_OPS = ["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="] as const;
export const UNARY_OPS = ["-", "+", "~"] as const;

/** Category design tokens (Liquid Glass palette). */
/** Warm-harmonized category colours (white label contrast >= 3.7:1, see docs/design-system.md). */
export const CATEGORY_COLORS: Record<Category, string> = {
  structure: "#D4520F",
  flow: "#1C9483",
  logic: "#3A7FC0",
  math: "#7556CC",
  variables: "#C2457B",
  pins: "#20906A",
  analog: "#1B889C",
  time: "#A86F17",
  serial: "#4A6CCB",
  sensors: "#CF4A4A",
  functions: "#8650C4",
  advanced: "#75695F",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  structure: "Structure",
  flow: "Flow",
  logic: "Logic",
  math: "Math",
  variables: "Variables",
  pins: "Pins & Digital I/O",
  analog: "Analog & PWM",
  time: "Time",
  serial: "Serial",
  sensors: "Sensors",
  functions: "Functions",
  advanced: "Advanced C++",
};

/** Category name in `locale` (default: the active block locale). */
export function categoryLabel(cat: Category, locale?: BlockLocale): string {
  return bm(`cat.${cat}` as BlockMessageKey, undefined, locale);
}

/** Friendly-call label template / tooltip / keywords in `locale` (default: active). */
export function friendlyText(f: FriendlyCall, locale?: BlockLocale): { label: string; tooltip: string; keywords: string[] } {
  const k = (s: string) => `fc.${f.type}.${s}` as BlockMessageKey;
  return {
    label: bm(k("label"), undefined, locale),
    tooltip: bm(k("tip"), undefined, locale),
    keywords: bm(k("kw"), undefined, locale).split(",").map((x) => x.trim()).filter(Boolean),
  };
}

/** Block type -> category, for every block type (including friendly ones). */
export const BLOCK_CATEGORY: Record<string, Category> = {
  pf_include: "advanced", pf_define: "advanced", pf_object: "advanced", pf_dht_object: "sensors",
  pf_setup: "structure", pf_loop: "structure", pf_function: "functions", pf_comment: "structure",
  pf_raw_top: "advanced", pf_raw_stmt: "advanced", pf_raw_expr: "advanced",
  pf_var_decl: "variables", pf_assign: "variables", pf_ident: "variables", pf_index: "variables",
  pf_expr_stmt: "functions", pf_if: "flow", pf_while: "flow", pf_do_while: "flow", pf_for: "flow",
  pf_switch: "flow", pf_break: "flow", pf_continue: "flow", pf_return: "functions",
  pf_number: "math", pf_bool: "logic", pf_string: "serial", pf_char: "serial", pf_constant: "pins",
  pf_arith: "math", pf_compare: "logic", pf_logic: "logic", pf_bitwise: "math", pf_not: "logic",
  pf_unary: "math", pf_update: "variables", pf_paren: "math", pf_ternary: "logic",
  pf_call: "functions", pf_method_call: "functions",
  ...Object.fromEntries(FRIENDLY_CALLS.map((f) => [f.type, f.category])),
};
