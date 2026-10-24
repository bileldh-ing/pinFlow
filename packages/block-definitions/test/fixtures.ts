import type { Expr, SketchFile, Stmt, TopLevel } from "@pinflow/arduino-ir";

let n = 0;
const id = (p: string) => `${p}${++n}`;
export const num = (raw: string): Expr => ({ kind: "NumberLit", id: id("num"), raw });
export const ident = (name: string): Expr => ({ kind: "Ident", id: id("id"), name });
export const str = (raw: string): Expr => ({ kind: "StringLit", id: id("s"), raw });
export const call = (callee: string, ...args: Expr[]): Expr => ({ kind: "Call", id: id("c"), callee, args });
export const mcall = (object: string, method: string, ...args: Expr[]): Expr => ({ kind: "MethodCall", id: id("m"), object, method, args });
export const es = (expr: Expr, extra: Partial<Stmt> = {}): Stmt => ({ kind: "ExprStmt", id: id("es"), expr, ...extra } as Stmt);

/** The canonical DHT11 + ESP32 sketch as IR. */
export function dhtSketch(): SketchFile {
  const items: TopLevel[] = [
    { kind: "Comment", id: "top_c", text: "// DHT11 on ESP32" },
    { kind: "Include", id: "inc", path: "DHT.h", system: true, trailingComment: "// Adafruit" },
    { kind: "Define", id: "def1", name: "DHTTYPE", value: "DHT11" },
    { kind: "VarDecl", id: "pin", type: "int", isConst: true, name: "DHT_PIN", init: num("4"), leadingComments: ["// data pin"] },
    { kind: "ObjectDecl", id: "obj", className: "DHT", name: "dht", args: [ident("DHT_PIN"), ident("DHTTYPE")], hasParens: true },
    { kind: "Function", id: "setup", returnType: "void", name: "setup", params: [], body: [
      es(mcall("Serial", "begin", num("115200"))),
      es(mcall("dht", "begin")),
      es(mcall("Serial", "println", str('"DHT11 ready"'))),
    ] },
    { kind: "Function", id: "loop", returnType: "void", name: "loop", params: [], blankLineBefore: true, body: [
      { kind: "VarDecl", id: "h", type: "float", isConst: false, name: "h", init: mcall("dht", "readHumidity"), blankLineBefore: false, trailingComment: "/* %RH */" },
      { kind: "VarDecl", id: "t", type: "float", isConst: false, name: "t", init: mcall("dht", "readTemperature") },
      { kind: "If", id: "if1", branches: [{ id: "br1", cond: { kind: "Binary", id: "or1", op: "||", left: call("isnan", ident("h")), right: call("isnan", ident("t")) }, body: [
        es(mcall("Serial", "println", str('"Failed to read from DHT sensor!"'))),
        { kind: "Return", id: "ret1" },
      ] }] },
      es(mcall("Serial", "print", str('"Humidity: "'))),
      es(mcall("Serial", "println", ident("h"))),
      es(call("delay", num("2000"))),
    ] },
  ];
  return { path: "main.ino", items, eol: "\n" };
}

/** Exercises every IR node kind. */
export function everythingSketch(): SketchFile {
  const items: TopLevel[] = [
    { kind: "Include", id: "i1", path: "Servo.h", system: true },
    { kind: "Include", id: "i2", path: "config.h", system: false },
    { kind: "Define", id: "d1", name: "LED", value: "13" },
    { kind: "RawTopLevel", id: "rt1", text: "template <typename T>\nT twice(T v) { return v * 2; } // {braces} \"q\"\r\n", reason: "template_declaration" },
    { kind: "VarDecl", id: "arr", type: "int", isConst: false, name: "pins", arraySize: "3", arrayInit: [num("2"), num("3"), num("0x1F")] },
    { kind: "VarDecl", id: "arr2", type: "int", isConst: false, name: "buf", arraySize: "", arrayInit: [] },
    { kind: "VarDecl", id: "arr3", type: "char", isConst: false, name: "line", arraySize: "16" },
    { kind: "VarDecl", id: "g1", type: "unsigned long", isConst: false, name: "last" },
    { kind: "VarDecl", id: "g2", type: "const char*", isConst: true, name: "msg", init: { kind: "StringLit", id: "sl", raw: '"a \\"b\\" {c}; // d\\n"' } },
    { kind: "VarDecl", id: "g3", type: "char", isConst: false, name: "ch", init: { kind: "CharLit", id: "cl", raw: "'\\n'" }, disabled: true },
    { kind: "VarDecl", id: "g4", type: "auto", isConst: false, name: "w", init: { kind: "StringLit", id: "sl2", raw: 'u8"wide"' } },
    { kind: "ObjectDecl", id: "o1", className: "Servo", name: "servo", args: [], hasParens: false },
    { kind: "ObjectDecl", id: "o2", className: "Adafruit_SSD1306", name: "oled", args: [num("128"), num("64")], hasParens: true },
    { kind: "ObjectDecl", id: "o3", className: "Foo", name: "foo", args: [], hasParens: true },
    { kind: "Comment", id: "c1", text: "/* block\n   comment */" },
    { kind: "Function", id: "f1", returnType: "int", name: "add", params: [{ type: "int", name: "a" }, { type: "const char*", name: "b" }], leadingComments: ["// adds"], body: [
      { kind: "Return", id: "r1", value: { kind: "Binary", id: "b1", op: "+", left: ident("a"), right: { kind: "Paren", id: "p1", inner: { kind: "Binary", id: "b2", op: "*", left: num("2"), right: ident("a") } } } },
    ] },
    { kind: "Function", id: "setup", returnType: "void", name: "setup", params: [], body: [
      es(call("pinMode", ident("LED"), ident("OUTPUT"))),
      es(call("pinMode", num("2"), ident("INPUT_PULLUP"))),
      es(call("analogWrite", num("9"), call("map", call("analogRead", num("34")), num("0"), num("4095"), num("0"), num("255")))),
      es(call("delayMicroseconds", num("10"))),
      es(mcall("Serial", "begin", num("9600"))),
      es(mcall("Serial", "print", num("1"), ident("DEC"))),
      es(mcall("Serial", "println")),
      es(mcall("servo", "attach", num("9"))),
      es(call("millis")),
      es(call("userFn")),
    ] },
    { kind: "Function", id: "loop", returnType: "void", name: "loop", params: [], body: [
      { kind: "Comment", id: "c2", text: "// inline note" },
      { kind: "Assign", id: "as1", op: "=", target: ident("last"), value: call("millis") },
      { kind: "Assign", id: "as2", op: "+=", target: { kind: "Index", id: "ix1", target: ident("pins"), index: num("0") }, value: call("constrain", call("abs", num("-5")), call("min", num("1"), num("2")), call("max", num("3"), call("micros"))) },
      { kind: "Assign", id: "as3", op: "<<=", target: ident("x"), value: num("1") },
      { kind: "If", id: "if1", branches: [
        { id: "b_if", cond: { kind: "Binary", id: "cmp", op: "==", left: call("digitalRead", num("2")), right: ident("LOW") }, body: [es(call("digitalWrite", ident("LED"), ident("HIGH")))] },
        { id: "b_ei", cond: { kind: "Unary", id: "u1", op: "!", operand: ident("flag") }, body: [] },
        { id: "b_ei2", cond: { kind: "Binary", id: "bw", op: "&", left: ident("x"), right: num("0x01") }, body: [{ kind: "Break", id: "brk" }] },
      ], elseBody: [es(call("digitalWrite", ident("LED"), ident("LOW")))] },
      { kind: "If", id: "if2", branches: [{ id: "b2x", cond: { kind: "BoolLit", id: "bt", value: true }, body: [] }], elseBody: [] },
      { kind: "For", id: "for1", init: { kind: "VarDecl", id: "fi", type: "int", isConst: false, name: "i", init: num("0") }, cond: { kind: "Binary", id: "fc", op: "<", left: ident("i"), right: num("3") }, update: { kind: "Update", id: "fu", op: "++", prefix: false, target: ident("i") }, body: [
        { kind: "Continue", id: "cont" },
      ] },
      { kind: "For", id: "for2", update: { kind: "Assign", id: "fa", op: "+=", target: ident("j"), value: num("2") }, body: [{ kind: "Break", id: "brk2" }] },
      { kind: "For", id: "for3", body: [] },
      { kind: "While", id: "wh", cond: { kind: "Binary", id: "wc", op: ">", left: { kind: "Update", id: "u2", op: "--", prefix: true, target: ident("n") }, right: num("0") }, body: [es({ kind: "Unary", id: "neg", op: "-", operand: ident("n") })] },
      { kind: "DoWhile", id: "dw", cond: { kind: "BoolLit", id: "bf", value: false }, body: [{ kind: "RawStatement", id: "rs1", text: "auto f = [](int v){ return v; }; /* } */", reason: "lambda_expression" }] },
      { kind: "Switch", id: "sw", subject: ident("mode"), cases: [
        { id: "cs1", value: num("1"), body: [es(call("delay", num("5"))), { kind: "Break", id: "brk3" }] },
        { id: "cs2", value: { kind: "CharLit", id: "cc", raw: "'a'" }, body: [] },
        { id: "cs3", body: [{ kind: "Break", id: "brk4" }] },
      ] },
      { kind: "VarDecl", id: "tern", type: "int", isConst: false, name: "y", init: { kind: "Ternary", id: "te", cond: ident("flag"), then: num("1"), else: { kind: "Unary", id: "u3", op: "~", operand: num("0") } } },
      { kind: "VarDecl", id: "rawx", type: "int", isConst: false, name: "z", init: { kind: "RawExpr", id: "re1", text: "static_cast<int>(3.7)", reason: "cast" } },
      { kind: "VarDecl", id: "bits", type: "int", isConst: false, name: "q", init: { kind: "Binary", id: "sh", op: ">>", left: { kind: "Binary", id: "xo", op: "^", left: ident("a"), right: ident("b") }, right: { kind: "Binary", id: "mo", op: "%", left: num("7"), right: { kind: "Unary", id: "up", op: "+", operand: num("2") } } } },
      { kind: "VarDecl", id: "lg", type: "bool", isConst: false, name: "ok", init: { kind: "Binary", id: "la", op: "&&", left: { kind: "Binary", id: "ne", op: "!=", left: ident("a"), right: num("1") }, right: { kind: "Binary", id: "le", op: "<=", left: ident("b"), right: { kind: "Binary", id: "ge", op: ">=", left: num("1.5f"), right: num("100UL") } } } },
      es(mcall("dht", "readTemperature", { kind: "BoolLit", id: "fh", value: true })),
      { kind: "Return", id: "ret" },
    ] },
    { kind: "VarDecl", id: "trail", type: "int", isConst: false, name: "afterLoop", init: num("1") },
    { kind: "RawTopLevel", id: "rt2", text: "#ifdef ESP32\n#define X 1\n#endif", reason: "preprocessor_conditional" },
  ];
  return { path: "main.ino", items, eol: "\r\n" };
}
