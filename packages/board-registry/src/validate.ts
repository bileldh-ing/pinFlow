/**
 * Non-destructive, advisory diagnostics (spec 10). Every diagnostic says what was
 * detected, why it matters, how certain we are, where, and what to do.
 */
import type { Expr, NodeId, SketchFile, SourceSpan } from "@pinflow/arduino-ir";
import { walkIr } from "@pinflow/arduino-ir";
import { getBoard, getPin, type BoardProfile } from "./boards";
import { findLibraryClass, detectDependencies } from "./libraries";

export type DiagnosticSeverity = "info" | "warning" | "error" | "board_warning";
export type Certainty = "certain" | "likely" | "heuristic";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  certainty: Certainty;
  /** What was detected. */
  message: string;
  /** Why it matters. */
  explanation: string;
  recommendedAction: string;
  boardFqbn: string;
  pin?: number;
  nodeId?: NodeId;
  span?: SourceSpan;
}

interface PinUse {
  fn: string;
  pin: number | undefined;
  /** Source text of the pin argument (for unresolved pins and pinMode matching). */
  pinText: string;
  /** How the pin value was resolved. */
  resolution: "literal" | "constant" | "variable" | "board_constant" | "unresolved";
  mode?: string;
  nodeId: NodeId;
  span?: SourceSpan;
}

type Symbols = Map<string, { value: number; certain: boolean }>;

export function parseIntLiteral(raw: string): number | undefined {
  const t = raw.replace(/[uUlL]+$/, "");
  if (/^-?0[xX][0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
  if (/^-?0[bB][01]+$/.test(t)) return parseInt(t.replace(/^-?0[bB]/, ""), 2) * (t.startsWith("-") ? -1 : 1);
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  return undefined;
}

function buildSymbols(file: SketchFile): Symbols {
  const syms: Symbols = new Map();
  for (const item of file.items) {
    if (item.kind === "Define") {
      const v = parseIntLiteral(item.value.trim());
      if (v !== undefined) syms.set(item.name, { value: v, certain: true });
    } else if (item.kind === "VarDecl" && item.arraySize === undefined && item.init?.kind === "NumberLit") {
      const v = parseIntLiteral(item.init.raw);
      // A non-const global may be reassigned later: treat as "likely".
      if (v !== undefined) syms.set(item.name, { value: v, certain: item.isConst });
    }
  }
  return syms;
}

function exprText(e: Expr): string {
  switch (e.kind) {
    case "NumberLit":
    case "StringLit":
    case "CharLit":
      return e.raw;
    case "Ident":
      return e.name;
    case "RawExpr":
      return e.text;
    default:
      return `<${e.kind}>`;
  }
}

function resolvePin(e: Expr | undefined, syms: Symbols, board: BoardProfile): Pick<PinUse, "pin" | "resolution" | "pinText"> {
  if (!e) return { pin: undefined, resolution: "unresolved", pinText: "" };
  const pinText = exprText(e);
  if (e.kind === "NumberLit") {
    const v = parseIntLiteral(e.raw);
    return { pin: v, resolution: v === undefined ? "unresolved" : "literal", pinText };
  }
  if (e.kind === "Ident") {
    const s = syms.get(e.name);
    if (s) return { pin: s.value, resolution: s.certain ? "constant" : "variable", pinText };
    if (board.constants[e.name] !== undefined) return { pin: board.constants[e.name], resolution: "board_constant", pinText };
  }
  if (e.kind === "Paren") return { ...resolvePin(e.inner, syms, board), pinText };
  return { pin: undefined, resolution: "unresolved", pinText };
}

const PIN_FUNCS: Record<string, number> = {
  pinMode: 0, digitalWrite: 0, digitalRead: 0, analogRead: 0, analogWrite: 0, tone: 0, noTone: 0, pulseIn: 0, pulseInLong: 0,
};

function collectUses(file: SketchFile, board: BoardProfile) {
  const syms = buildSymbols(file);
  const uses: PinUse[] = [];
  const delays: { ms: number; nodeId: NodeId; span?: SourceSpan }[] = [];
  let serialBegin = false;
  let wifi = false;
  for (const item of file.items) {
    if (item.kind === "Include" && /^WiFi(Multi|Client|ClientSecure)?\.h$/.test(item.path)) wifi = true;
    if (item.kind === "ObjectDecl") {
      const lib = findLibraryClass(item.className);
      const pinIdx = lib?.cls.ctorParams.findIndex((p) => p.kind === "pin") ?? -1;
      if (lib && pinIdx >= 0) {
        const r = resolvePin(item.args[pinIdx], syms, board);
        uses.push({ fn: `${item.className}()`, ...r, mode: "LIBRARY_IO", nodeId: item.id, span: item.span });
      }
    }
  }
  walkIr(file, (n) => {
    const node = n as unknown as Expr;
    if (node.kind === "Call") {
      const idx = PIN_FUNCS[node.callee];
      if (idx !== undefined) {
        const r = resolvePin(node.args[idx], syms, board);
        const modeArg = node.callee === "pinMode" ? node.args[1] : undefined;
        uses.push({ fn: node.callee, ...r, mode: modeArg ? exprText(modeArg) : undefined, nodeId: node.id, span: node.span });
      }
      if (node.callee === "delay" && node.args[0]?.kind === "NumberLit") {
        const ms = parseIntLiteral(node.args[0].raw);
        if (ms !== undefined) delays.push({ ms, nodeId: node.id, span: node.span });
      }
    } else if (node.kind === "MethodCall") {
      if (node.object === "Serial" && node.method === "begin") serialBegin = true;
      if (node.object === "WiFi") wifi = true;
    } else if (["RawStatement", "RawExpr", "RawTopLevel"].includes((node as { kind: string }).kind)) {
      // Wi-Fi use inside preserved code still turns ADC2 off; detect it conservatively.
      if (/\bWiFi\s*\.\s*(begin|softAP|mode)\s*\(/.test(String((node as { text?: string }).text))) wifi = true;
    }
  });
  return { uses, delays, serialBegin, wifi };
}

/**
 * Advisory pin / timing diagnostics for the selected board. Unknown FQBN -> one info diagnostic.
 * Rules never block compilation; they explain and suggest.
 */
export function validatePins(file: SketchFile, fqbn: string): Diagnostic[] {
  const board = getBoard(fqbn);
  if (!board) {
    return [{
      code: "unknown-board", severity: "info", certainty: "certain", boardFqbn: fqbn,
      message: `No PinFlow board profile for "${fqbn}".`,
      explanation: "Pin checks need a board profile; without one PinFlow cannot tell which pins are safe.",
      recommendedAction: "Pick a supported board (ESP32 Dev Module, Arduino Uno, Arduino Nano) or verify pins against your board's pinout.",
    }];
  }
  const out: Diagnostic[] = [];
  const { uses, delays, serialBegin, wifi } = collectUses(file, board);
  const d = (x: Omit<Diagnostic, "boardFqbn">) => out.push({ ...x, boardFqbn: board.fqbn });
  const certaintyOf = (u: PinUse): Certainty => (u.resolution === "variable" ? "likely" : "certain");

  for (const u of uses) {
    if (u.pin === undefined) continue;
    const info = getPin(board, u.pin);
    const base = { pin: u.pin, nodeId: u.nodeId, span: u.span };
    const where = `${u.fn}(${u.pinText}${u.pinText !== String(u.pin) ? ` = ${u.pin}` : ""})`;
    if (!info) {
      d({ ...base, code: "pin-not-on-board", severity: "warning", certainty: certaintyOf(u),
        message: `${where}: pin ${u.pin} does not exist on ${board.name}.`,
        explanation: `${board.name} exposes pins ${board.pins.map((p) => p.gpio).join(", ")}. Another number does nothing or targets the wrong pin.`,
        recommendedAction: "Choose a pin from the board's pin list." });
      continue;
    }
    const drives = (u.fn === "pinMode" && (u.mode === "OUTPUT" || u.mode === "OUTPUT_OPEN_DRAIN")) || u.fn === "digitalWrite" || u.fn === "analogWrite" || u.fn === "tone" || u.mode === "LIBRARY_IO";
    if (info.flash) {
      d({ ...base, code: "flash-pin", severity: "board_warning", certainty: certaintyOf(u),
        message: `${where}: GPIO${u.pin} is wired to the module's SPI flash.`,
        explanation: "GPIO6-11 connect to the flash chip on ESP32-WROOM/WROVER modules; touching them usually crashes the running sketch.",
        recommendedAction: "Move this connection to a free GPIO such as 4, 13, 16-19, 21-23, 25-27 or 32-33." });
    }
    if (info.inputOnly && drives) {
      d({ ...base, code: "input-only-pin-output", severity: "board_warning", certainty: certaintyOf(u),
        message: `${where}: ${info.labels[0]} is input-only on ${board.name}${u.mode === "LIBRARY_IO" ? " but this library needs to drive the line" : ""}.`,
        explanation: board.architecture === "esp32"
          ? "GPIO34-39 have no output driver and no internal pull-up/pull-down; writes are silently ignored."
          : "This pin can only be read with analogRead().",
        recommendedAction: board.architecture === "esp32" ? "Use an output-capable GPIO (e.g. 4, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33)." : "Use a digital pin instead." });
    }
    if (info.inputOnly && u.fn === "pinMode" && (u.mode === "INPUT_PULLUP" || u.mode === "INPUT_PULLDOWN") && board.architecture === "esp32") {
      d({ ...base, code: "input-only-no-pullup", severity: "board_warning", certainty: certaintyOf(u),
        message: `${where}: GPIO${u.pin} has no internal ${u.mode === "INPUT_PULLUP" ? "pull-up" : "pull-down"}.`,
        explanation: "On ESP32, GPIO34-39 ignore INPUT_PULLUP/INPUT_PULLDOWN, so the input floats and reads random values.",
        recommendedAction: "Add an external 10k resistor, or move the input to a pin with internal pulls." });
    }
    if (info.strapping && (u.fn === "pinMode" || u.mode === "LIBRARY_IO")) {
      d({ ...base, code: "strapping-pin", severity: "info", certainty: "likely",
        message: `${where}: GPIO${u.pin} is a boot strapping pin.`,
        explanation: "Its level during reset selects boot mode or flash voltage. External circuits that pull it the wrong way can stop the board from booting or uploading.",
        recommendedAction: "Fine for simple outputs like an LED; for sensors, buttons or pull-ups prefer a non-strapping pin." });
    }
    if (info.serial && serialBegin) {
      const rx = u.pin === 0 || u.pin === 3;
      d({ ...base, code: "serial-pin-conflict", severity: "warning", certainty: "likely",
        message: `${where}: pin ${u.pin} is the USB serial ${rx ? "RX" : "TX"} line and Serial.begin() is used.`,
        explanation: "Using it for other I/O corrupts Serial Monitor output and can interfere with uploading.",
        recommendedAction: "Use another pin, or stop using Serial." });
    }
    if (u.fn === "analogWrite") {
      if (!info.capabilities.includes("pwm") && !info.inputOnly) {
        d({ ...base, code: "analogwrite-no-pwm", severity: "board_warning", certainty: certaintyOf(u),
          message: `${where}: pin ${u.pin} has no hardware PWM on ${board.name}.`,
          explanation: board.analogWrite.note,
          recommendedAction: board.architecture === "avr" ? "Use one of the PWM pins 3, 5, 6, 9, 10, 11." : "Use an output-capable pin." });
      } else if (board.architecture === "esp32") {
        d({ ...base, code: "analogwrite-core-note", severity: "info", certainty: "certain",
          message: `${where}: analogWrite() on ESP32 depends on the core version.`,
          explanation: board.analogWrite.note,
          recommendedAction: "Keep arduino-esp32 core 3.x selected (the PinFlow default) or switch to the LEDC API on older cores." });
      }
    }
    if (u.fn === "analogRead") {
      if (!info.capabilities.includes("adc")) {
        const channel = board.architecture === "avr" && u.pin >= 0 && u.pin <= 5;
        d({ ...base, code: channel ? "analogread-channel-number" : "analogread-no-adc",
          severity: channel ? "info" : "board_warning", certainty: certaintyOf(u),
          message: channel
            ? `${where}: on AVR boards analogRead(${u.pin}) reads analog channel A${u.pin}, not digital pin ${u.pin}.`
            : `${where}: pin ${u.pin} is not an analog input pin.`,
          explanation: "analogRead() needs an ADC-capable pin.",
          recommendedAction: board.architecture === "avr" ? "Write A0-A5 explicitly for clarity." : "Use an ADC1 pin (GPIO32-39)." });
      } else if (info.capabilities.includes("adc2")) {
        d({ ...base, code: "adc2-wifi", severity: wifi ? "board_warning" : "info", certainty: wifi ? "certain" : "likely",
          message: `${where}: GPIO${u.pin} is on ADC2${wifi ? " and this sketch uses Wi-Fi" : ""}.`,
          explanation: "ESP32 ADC2 cannot be read while the Wi-Fi driver is running; analogRead() then fails or returns 0.",
          recommendedAction: "Use an ADC1 pin (GPIO32, 33, 34, 35, 36, 39) for analog inputs." });
      }
    }
  }

  // Pin used without pinMode (heuristic: only digitalWrite, only when pinMode is never called for that pin).
  const configured = new Set<string>();
  for (const u of uses) if (u.fn === "pinMode") configured.add(u.pin !== undefined ? `#${u.pin}` : u.pinText);
  const reported = new Set<string>();
  for (const u of uses) {
    if (u.fn !== "digitalWrite") continue;
    const key = u.pin !== undefined ? `#${u.pin}` : u.pinText;
    if (configured.has(key) || reported.has(key) || (u.pin === undefined && u.pinText === "")) continue;
    reported.add(key);
    d({ pin: u.pin, nodeId: u.nodeId, span: u.span, code: "pin-without-pinmode", severity: "warning", certainty: "heuristic",
      message: `digitalWrite(${u.pinText}, …) is used but pinMode(${u.pinText}, OUTPUT) was not found in this file.`,
      explanation: "Without pinMode(OUTPUT) the pin stays an input and digitalWrite() only toggles the weak pull-up, so an LED glows dimly or not at all. (The pin may be configured elsewhere, e.g. by a library or another file.)",
      recommendedAction: `Add pinMode(${u.pinText}, OUTPUT) in setup(), or ignore this if another file/library configures the pin.` });
  }

  for (const dl of delays) {
    if (dl.ms >= 1000) {
      d({ nodeId: dl.nodeId, span: dl.span, code: "blocking-delay", severity: "info", certainty: "certain",
        message: `delay(${dl.ms}) blocks the sketch for ${dl.ms / 1000} s.`,
        explanation: "Nothing else runs during delay(): buttons are missed and other tasks pause. Fine for simple demos.",
        recommendedAction: "For responsive sketches use a millis() interval (see the non-blocking DHT11 example)." });
    }
  }
  return out;
}

/** validatePins + sketch-structure and dependency checks. */
export function validateSketch(file: SketchFile, fqbn: string): Diagnostic[] {
  const out = validatePins(file, fqbn);
  const board = getBoard(fqbn);
  const fns = new Set(file.items.filter((i) => i.kind === "Function").map((i) => (i as { name: string }).name));
  const raws = file.items.filter((i) => i.kind === "RawTopLevel").map((i) => (i as { text: string }).text).join("\n");
  for (const name of ["setup", "loop"]) {
    if (!fns.has(name) && !new RegExp(`\\b${name}\\s*\\(`).test(raws)) {
      out.push({ code: `missing-${name}`, severity: "warning", certainty: "likely", boardFqbn: fqbn,
        message: `No ${name}() function found in ${file.path}.`,
        explanation: "Arduino sketches need both setup() and loop() (in one of the sketch's .ino files) or linking fails.",
        recommendedAction: `Add ${name}() here, or ignore this if another .ino file of the sketch defines it.` });
    }
  }
  const deps = detectDependencies(file, board?.architecture);
  for (const lib of deps.libraries) {
    if (board && !lib.pack.architectures.includes("*") && !lib.pack.architectures.includes(board.architecture)) {
      out.push({ code: "library-arch", severity: "warning", certainty: "certain", boardFqbn: fqbn, nodeId: lib.nodeId,
        message: `${lib.pack.name} does not declare support for ${board.architecture}.`,
        explanation: "The library may fail to compile for this board.",
        recommendedAction: "Choose a compatible board or library." });
    }
  }
  for (const h of deps.unknownHeaders) {
    out.push({ code: "unknown-library", severity: "info", certainty: "certain", boardFqbn: fqbn,
      message: `#include <${h}> is not a PinFlow-known library.`,
      explanation: "PinFlow keeps the code exactly as written but cannot install or visualize this library automatically.",
      recommendedAction: "Make sure the library is installed in the compile environment." });
  }
  return out;
}
