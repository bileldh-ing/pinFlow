import type * as Monaco from "monaco-editor";
import type { SketchFile } from "@pinflow/arduino-ir";

let installed = false;
let symbolsProvider: () => SketchFile | undefined = () => undefined;

/** The workbench tells the completion provider where to find current IR symbols. */
export function setSymbolSource(fn: () => SketchFile | undefined) { symbolsProvider = fn; }

const API: Array<{ label: string; insert: string; doc: string; kind: "fn" | "const" | "snippet" | "method" }> = [
  { label: "pinMode", insert: "pinMode(${1:pin}, ${2|OUTPUT,INPUT,INPUT_PULLUP|});", doc: "pinMode(pin, mode) — configure a pin.", kind: "fn" },
  { label: "digitalWrite", insert: "digitalWrite(${1:pin}, ${2|HIGH,LOW|});", doc: "digitalWrite(pin, value) — set a digital pin.", kind: "fn" },
  { label: "digitalRead", insert: "digitalRead(${1:pin})", doc: "digitalRead(pin) → HIGH/LOW.", kind: "fn" },
  { label: "analogRead", insert: "analogRead(${1:pin})", doc: "analogRead(pin) → 0..1023 (AVR) / 0..4095 (ESP32).", kind: "fn" },
  { label: "analogWrite", insert: "analogWrite(${1:pin}, ${2:value});", doc: "analogWrite(pin, duty) — PWM; availability depends on the board.", kind: "fn" },
  { label: "delay", insert: "delay(${1:1000});", doc: "delay(ms) — blocks the program.", kind: "fn" },
  { label: "delayMicroseconds", insert: "delayMicroseconds(${1:10});", doc: "delayMicroseconds(us).", kind: "fn" },
  { label: "millis", insert: "millis()", doc: "millis() → unsigned long ms since boot.", kind: "fn" },
  { label: "micros", insert: "micros()", doc: "micros() → unsigned long µs since boot.", kind: "fn" },
  { label: "map", insert: "map(${1:value}, ${2:fromLow}, ${3:fromHigh}, ${4:toLow}, ${5:toHigh})", doc: "Re-map a number between ranges.", kind: "fn" },
  { label: "constrain", insert: "constrain(${1:x}, ${2:low}, ${3:high})", doc: "Clamp a value.", kind: "fn" },
  { label: "Serial.begin", insert: "Serial.begin(${1:115200});", doc: "Open the serial port.", kind: "method" },
  { label: "Serial.print", insert: "Serial.print(${1:value});", doc: "Print without newline.", kind: "method" },
  { label: "Serial.println", insert: "Serial.println(${1:value});", doc: "Print with newline.", kind: "method" },
  { label: "setup", insert: "void setup() {\n\t${0}\n}", doc: "setup() — runs once.", kind: "snippet" },
  { label: "loop", insert: "void loop() {\n\t${0}\n}", doc: "loop() — runs forever.", kind: "snippet" },
  { label: "dht-sensor", insert: "#include <DHT.h>\n\n#define DHTPIN ${1:4}\n#define DHTTYPE ${2|DHT11,DHT22|}\n\nDHT dht(DHTPIN, DHTTYPE);\n", doc: "DHT sensor include + object (DHT sensor library).", kind: "snippet" },
  { label: "dht-read", insert: "float humidity = dht.readHumidity();\nfloat temperature = dht.readTemperature();\nif (isnan(humidity) || isnan(temperature)) {\n\tSerial.println(\"Failed to read from DHT sensor!\");\n\treturn;\n}\n", doc: "Read a DHT sensor with failure check.", kind: "snippet" },
  { label: "every-ms", insert: "static unsigned long last${1:Tick} = 0;\nif (millis() - last${1:Tick} >= ${2:1000}) {\n\tlast${1:Tick} = millis();\n\t${0}\n}", doc: "Non-blocking interval with millis().", kind: "snippet" },
  { label: "HIGH", insert: "HIGH", doc: "Logic high.", kind: "const" },
  { label: "LOW", insert: "LOW", doc: "Logic low.", kind: "const" },
  { label: "OUTPUT", insert: "OUTPUT", doc: "Pin mode.", kind: "const" },
  { label: "INPUT", insert: "INPUT", doc: "Pin mode.", kind: "const" },
  { label: "INPUT_PULLUP", insert: "INPUT_PULLUP", doc: "Pin mode with internal pull-up.", kind: "const" },
  { label: "LED_BUILTIN", insert: "LED_BUILTIN", doc: "On-board LED pin (board dependent).", kind: "const" },
];

export function installMonaco(monaco: typeof Monaco) {
  if (installed) return;
  installed = true;
  defineMonacoThemes(monaco);

  monaco.languages.registerCompletionItemProvider("cpp", {
    triggerCharacters: ["."],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const K = monaco.languages.CompletionItemKind;
      const Rule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
      const suggestions: Monaco.languages.CompletionItem[] = API.map((a) => ({
        label: a.label, insertText: a.insert, insertTextRules: Rule, documentation: a.doc, range,
        kind: a.kind === "snippet" ? K.Snippet : a.kind === "const" ? K.Constant : a.kind === "method" ? K.Method : K.Function,
        detail: a.kind === "snippet" ? "PinFlow snippet" : "Arduino",
      }));
      const file = symbolsProvider();
      const seen = new Set<string>();
      const add = (label: string, kind: Monaco.languages.CompletionItemKind, detail: string) => {
        if (seen.has(label)) return; seen.add(label);
        suggestions.push({ label, insertText: label, kind, detail, range });
      };
      if (file) {
        const walk = (n: unknown): void => {
          if (!n || typeof n !== "object") return;
          if (Array.isArray(n)) { n.forEach(walk); return; }
          const o = n as Record<string, unknown>;
          if (o.kind === "VarDecl" && typeof o.name === "string") add(o.name, K.Variable, `${String(o.type)} (sketch)`);
          if (o.kind === "Define" && typeof o.name === "string") add(o.name, K.Constant, "#define");
          if (o.kind === "ObjectDecl" && typeof o.name === "string") add(o.name, K.Variable, `${String(o.className)} object`);
          if (o.kind === "Function" && typeof o.name === "string") add(o.name, K.Function, `${String(o.returnType)} function`);
          for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
        };
        walk(file.items);
        for (const it of file.items) {
          if (it.kind === "ObjectDecl" && it.className === "DHT") {
            for (const m of ["begin()", "readTemperature()", "readHumidity()"]) add(`${it.name}.${m}`, K.Method, "DHT sensor library");
          }
        }
      }
      return { suggestions };
    },
  });
}

/** Warm liquid-glass Monaco themes (orange cursor/selection, mint types). Safe to call repeatedly. */
export function defineMonacoThemes(monaco: typeof Monaco) {
  monaco.editor.defineTheme("pinflow-dark", {
    base: "vs-dark", inherit: true,
    rules: [
      { token: "comment", foreground: "9a8b7e", fontStyle: "italic" },
      { token: "keyword", foreground: "ff9a4d" },
      { token: "number", foreground: "ffd27a" },
      { token: "string", foreground: "c9e6a0" },
      { token: "keyword.directive", foreground: "f7a8cf" },
      { token: "type", foreground: "5ef0c8" },
      { token: "delimiter", foreground: "cdbfb2" },
    ],
    colors: {
      "editor.background": "#161311", "editor.foreground": "#f3ece5", "editor.lineHighlightBackground": "#221c18", "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#6d6056", "editorLineNumber.activeForeground": "#ffb27a",
      "editor.selectionBackground": "#ff7a1a45", "editor.inactiveSelectionBackground": "#ff7a1a22", "editor.selectionHighlightBackground": "#ff7a1a1f",
      "editorCursor.foreground": "#ff7a1a", "editorGutter.background": "#161311",
      "editorWidget.background": "#221d19", "editorWidget.border": "#3a322b", "editorSuggestWidget.background": "#221d19", "editorSuggestWidget.selectedBackground": "#3a2a1e", "editorHoverWidget.background": "#221d19",
      "editorIndentGuide.background1": "#2a231e", "editorIndentGuide.activeBackground1": "#4a3d33", "editorBracketMatch.border": "#ff7a1a", "editorBracketMatch.background": "#ff7a1a22",
      "scrollbarSlider.background": "#ffe4cc1f", "scrollbarSlider.hoverBackground": "#ffe4cc33", "scrollbarSlider.activeBackground": "#ff7a1a66",
      "editorOverviewRuler.border": "#00000000", "focusBorder": "#ff7a1a",
      "editorInfo.foreground": "#5ef0c8", "editorOverviewRuler.infoForeground": "#5ef0c8aa", "editorWarning.foreground": "#ffc857", "editorOverviewRuler.warningForeground": "#ffc857aa",
      "editorError.foreground": "#ff7b72", "editorOverviewRuler.errorForeground": "#ff7b72cc",
    },
  });
  monaco.editor.defineTheme("pinflow-light", {
    base: "vs", inherit: true,
    rules: [
      { token: "comment", foreground: "7d6f63", fontStyle: "italic" },
      { token: "keyword", foreground: "b9440a" },
      { token: "number", foreground: "8a5200" },
      { token: "string", foreground: "3f7d20" },
      { token: "keyword.directive", foreground: "a3307a" },
      { token: "type", foreground: "0f7a5f" },
    ],
    colors: {
      "editor.background": "#fbf8f5", "editor.foreground": "#21180f", "editor.lineHighlightBackground": "#f3ebe3", "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#a89a8e", "editorLineNumber.activeForeground": "#b9440a", "editorGutter.background": "#fbf8f5",
      "editor.selectionBackground": "#ff7a1a33", "editor.inactiveSelectionBackground": "#ff7a1a1a", "editorCursor.foreground": "#e8590c",
      "editorWidget.background": "#fffaf5", "editorBracketMatch.border": "#e8590c", "focusBorder": "#e8590c",
      "scrollbarSlider.background": "#5a3c1e1f", "scrollbarSlider.hoverBackground": "#5a3c1e33",
      "editorInfo.foreground": "#0f7a5f", "editorOverviewRuler.infoForeground": "#0f7a5f99", "editorWarning.foreground": "#9a5b00",
    },
  });
}
