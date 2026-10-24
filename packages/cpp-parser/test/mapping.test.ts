import { beforeAll, describe, expect, it } from "vitest";
import type { Expr, Stmt, TopLevel } from "@pinflow/arduino-ir";
import { normalizeIr } from "@pinflow/arduino-ir";
import { generate } from "@pinflow/arduino-codegen";
import { getLanguageInfo, initParser, parseSketch } from "../src/index";

beforeAll(async () => {
  await initParser();
});

const body = (src: string): Stmt[] => {
  const r = parseSketch(`void f() {\n${src}\n}\n`);
  expect(r.ok).toBe(true);
  const fn = r.file.items.find((i) => i.kind === "Function") as Extract<TopLevel, { kind: "Function" }>;
  return fn.body;
};
const expr = (src: string): Expr => {
  const [s] = body(`x = ${src};`);
  expect(s!.kind).toBe("Assign");
  return (s as Extract<Stmt, { kind: "Assign" }>).value;
};
const norm = <T>(x: T) => normalizeIr(x, { keepComments: true });

describe("init", () => {
  it("loads an ABI-compatible grammar and is idempotent", async () => {
    await initParser();
    await initParser();
    const info = getLanguageInfo();
    expect(info).not.toBeNull();
    expect(info!.abiVersion).toBeGreaterThanOrEqual(13);
    expect(info!.abiVersion).toBeLessThanOrEqual(15);
  });
});

describe("expressions", () => {
  it("maps precedence from the CST, not text", () => {
    expect(norm(expr("a + b * c"))).toEqual({
      kind: "Binary", op: "+", left: { kind: "Ident", name: "a" },
      right: { kind: "Binary", op: "*", left: { kind: "Ident", name: "b" }, right: { kind: "Ident", name: "c" } },
    });
    expect(norm(expr("a - b - c"))).toMatchObject({ op: "-", left: { op: "-" }, right: { name: "c" } });
    expect(norm(expr("a || b && c"))).toMatchObject({ op: "||", right: { op: "&&" } });
    expect(norm(expr("a << 1 | b & 3 ^ c"))).toMatchObject({ op: "|", left: { op: "<<" }, right: { op: "^", left: { op: "&" } } });
  });
  it("preserves explicit parentheses as Paren nodes", () => {
    expect(norm(expr("(a + b) * c"))).toMatchObject({ op: "*", left: { kind: "Paren", inner: { op: "+" } } });
    expect(norm(expr("((a))"))).toMatchObject({ kind: "Paren", inner: { kind: "Paren", inner: { kind: "Ident" } } });
  });
  it("unary, update, ternary, index", () => {
    expect(norm(expr("!a && -b"))).toMatchObject({ op: "&&", left: { kind: "Unary", op: "!" }, right: { kind: "Unary", op: "-" } });
    expect(norm(expr("~mask"))).toMatchObject({ kind: "Unary", op: "~" });
    const [pre, post] = body("++i;\ni--;");
    expect(norm(pre)).toMatchObject({ kind: "ExprStmt", expr: { kind: "Update", op: "++", prefix: true } });
    expect(norm(post)).toMatchObject({ kind: "ExprStmt", expr: { kind: "Update", op: "--", prefix: false } });
    expect(norm(expr("a ? b : c ? d : e"))).toMatchObject({ kind: "Ternary", else: { kind: "Ternary" } });
    expect(norm(expr("arr[i + 1]"))).toMatchObject({ kind: "Index", target: { name: "arr" }, index: { op: "+" } });
  });
  it("signed literals become Unary(-, NumberLit) consistently", () => {
    expect(norm(expr("-5"))).toEqual({ kind: "Unary", op: "-", operand: { kind: "NumberLit", raw: "5" } });
    expect(norm(expr("a - -5"))).toMatchObject({ op: "-", right: { kind: "Unary", op: "-", operand: { raw: "5" } } });
  });
  it("literals keep their raw text", () => {
    expect(norm(expr("0x1F"))).toEqual({ kind: "NumberLit", raw: "0x1F" });
    expect(norm(expr("1.5f"))).toEqual({ kind: "NumberLit", raw: "1.5f" });
    expect(norm(expr("100UL"))).toEqual({ kind: "NumberLit", raw: "100UL" });
    expect(norm(expr('"a \\"b\\" {;}"'))).toEqual({ kind: "StringLit", raw: '"a \\"b\\" {;}"' });
    expect(norm(expr("'\\n'"))).toEqual({ kind: "CharLit", raw: "'\\n'" });
    expect(norm(expr("true"))).toEqual({ kind: "BoolLit", value: true });
    expect(norm(expr("HIGH"))).toEqual({ kind: "Ident", name: "HIGH" });
  });
  it("calls: core functions and Serial methods are native, unknown calls are raw", () => {
    expect(norm(expr("map(v, 0, 1023, 0, 255)"))).toMatchObject({ kind: "Call", callee: "map", args: [{}, {}, {}, {}, {}] });
    expect(norm(expr("Serial.read()"))).toMatchObject({ kind: "MethodCall", object: "Serial", method: "read", args: [] });
    expect(norm(expr("unknownThing(1)"))).toMatchObject({ kind: "RawExpr", text: "unknownThing(1)" });
    expect(norm(expr("obj.method()"))).toMatchObject({ kind: "RawExpr", text: "obj.method()" });
    expect(norm(expr("(long)y"))).toMatchObject({ kind: "RawExpr", text: "(long)y" });
    expect(norm(expr("p->x"))).toMatchObject({ kind: "RawExpr" });
  });
  it("library object methods are native only for registered packs", () => {
    const r = parseSketch("#include <DHT.h>\nDHT dht(4, DHT11);\nvoid loop() { float t = dht.readTemperature(); float q = dht.notAMethod(); }\n");
    const fn = r.file.items[2] as Extract<TopLevel, { kind: "Function" }>;
    expect(fn.body[0]).toMatchObject({ kind: "VarDecl", init: { kind: "MethodCall", object: "dht", method: "readTemperature" } });
    expect(fn.body[1]).toMatchObject({ kind: "VarDecl", init: { kind: "RawExpr", text: "dht.notAMethod()" } });
  });
  it("re-associates tree-sitter's `(!i)++` reading of `!i++` to C++ semantics `!(i++)`", () => {
    expect(norm(expr("!i++"))).toEqual({ kind: "Unary", op: "!", operand: { kind: "Update", op: "++", prefix: false, target: { kind: "Ident", name: "i" } } });
    expect(norm(expr("-~n--"))).toEqual({ kind: "Unary", op: "-", operand: { kind: "Unary", op: "~", operand: { kind: "Update", op: "--", prefix: false, target: { kind: "Ident", name: "n" } } } });
  });
  it("cast/arithmetic ambiguity `(a) + b * c` keeps the whole root expression raw (never a guessed structure)", () => {
    expect(expr("(a) + b * c")).toMatchObject({ kind: "RawExpr", text: "(a) + b * c" });
    expect(expr("(map()) + b * c")).toMatchObject({ kind: "RawExpr", text: "(map()) + b * c" });
    expect(expr("(long)y * 2")).toMatchObject({ kind: "Binary", op: "*", left: { kind: "RawExpr", text: "(long)y" } });
  });
  it("comment inside an expression keeps that expression raw", () => {
    expect(expr("a + /* why */ b")).toMatchObject({ kind: "RawExpr", text: "a + /* why */ b" });
  });
  it("tree-sitter template ambiguity (`a < b && c > (d)`) degrades to a raw expression, never to wrong structure", () => {
    expect(expr("a < b && c > (d)")).toMatchObject({ kind: "RawExpr", text: "a < b && c > (d)" });
    expect(norm(expr("a < b && c > d"))).toMatchObject({ kind: "Binary", op: "&&" });
  });
});

describe("statements", () => {
  it("if / else if / else chain is flattened into branches", () => {
    const [s] = body("if (a) { delay(1); } else if (b) delay(2); else { delay(3); }");
    expect(s).toMatchObject({ kind: "If", branches: [{ cond: { name: "a" } }, { cond: { name: "b" } }] });
    expect((s as Extract<Stmt, { kind: "If" }>).elseBody).toHaveLength(1);
  });
  it("else { if } is NOT an else-if", () => {
    const [s] = body("if (a) { } else { if (b) { } }");
    expect(s).toMatchObject({ kind: "If", branches: [{}], elseBody: [{ kind: "If" }] });
  });
  it("for / while / do-while / switch", () => {
    const [f, w, d, sw] = body("for (int i = 0; i < 3; i += 2) { continue; }\nwhile (x) { break; }\ndo { x--; } while (x > 0);\nswitch (m) { case 1: case 2: x = 1; break; default: x = 0; }");
    expect(norm(f)).toMatchObject({ kind: "For", init: { kind: "VarDecl", name: "i" }, cond: { op: "<" }, update: { kind: "Assign", op: "+=" }, body: [{ kind: "Continue" }] });
    expect(norm(w)).toMatchObject({ kind: "While", body: [{ kind: "Break" }] });
    expect(norm(d)).toMatchObject({ kind: "DoWhile", cond: { op: ">" } });
    expect(norm(sw)).toMatchObject({ kind: "Switch", cases: [{ value: { raw: "1" }, body: [] }, { value: { raw: "2" }, body: [{ kind: "Assign" }, { kind: "Break" }] }, { body: [{ kind: "Assign" }] }] });
    expect((sw as Extract<Stmt, { kind: "Switch" }>).cases[2]!.value).toBeUndefined();
  });
  it("for(;;) has no parts", () => {
    const [f] = body("for (;;) { break; }");
    expect(norm(f)).toEqual({ kind: "For", body: [{ kind: "Break" }] });
  });
  it("compound assignments and returns", () => {
    const ops = ["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="];
    const stmts = body(ops.map((o) => `x ${o} 1;`).join("\n") + "\nreturn;\n");
    expect(stmts.map((s) => (s.kind === "Assign" ? s.op : s.kind))).toEqual([...ops, "Return"]);
  });
  it("unsupported statements are raw with exact text", () => {
    const stmts = body("a = b = 2;\n{ int scoped = 1; }\n;\nfor (int i : arr) {}\nDHT local(4, DHT11);");
    expect(stmts.map((s) => s.kind)).toEqual(["RawStatement", "RawStatement", "RawStatement", "RawStatement", "RawStatement"]);
    expect((stmts[1] as { text: string }).text).toBe("{ int scoped = 1; }");
  });
  it("splits multi-declarator declarations", () => {
    const stmts = body("int a, b = 2;");
    expect(stmts.map((s) => norm(s))).toEqual([
      { kind: "VarDecl", type: "int", isConst: false, name: "a" },
      { kind: "VarDecl", type: "int", isConst: false, name: "b", init: { kind: "NumberLit", raw: "2" } },
    ]);
  });
});

describe("top level", () => {
  it("include, define (with trailing comment), object decls", () => {
    const r = parseSketch('#include <DHT.h>\n#include "local.h"\n#define PIN 4 // data\n#define FLAG\nDHT dht(PIN, DHT11);\nDHT dht2(4, DHT22);\nServo s;\nFoo f();\n');
    expect(r.ok).toBe(true);
    expect(r.file.items.map((i) => norm(i))).toEqual([
      { kind: "Include", path: "DHT.h", system: true },
      { kind: "Include", path: "local.h", system: false },
      { kind: "Define", name: "PIN", value: "4", trailingComment: "// data" },
      { kind: "Define", name: "FLAG", value: "" },
      { kind: "ObjectDecl", className: "DHT", name: "dht", args: [{ kind: "Ident", name: "PIN" }, { kind: "Ident", name: "DHT11" }], hasParens: true },
      { kind: "ObjectDecl", className: "DHT", name: "dht2", args: [{ kind: "NumberLit", raw: "4" }, { kind: "Ident", name: "DHT22" }], hasParens: true },
      { kind: "ObjectDecl", className: "Servo", name: "s", args: [], hasParens: false },
      { kind: "RawTopLevel", text: "Foo f();", reason: expect.any(String) },
    ]);
  });
  it("functions: params, void param list, storage specifiers", () => {
    const r = parseSketch("static int add(int a, const char *s, String &out) { return a; }\nvoid g(void) {}\n");
    expect(norm(r.file.items[0])).toMatchObject({ kind: "Function", returnType: "static int", name: "add", params: [{ type: "int", name: "a" }, { type: "const char*", name: "s" }, { type: "String&", name: "out" }] });
    expect(norm(r.file.items[1])).toMatchObject({ kind: "Function", name: "g", params: [] });
  });
  it("comment association: leading, trailing, standalone", () => {
    const r = parseSketch("// standalone\n\n// leading 1\n// leading 2\nint x = 1; // trailing\n/* block\n   two lines */\nint y;\n");
    expect(r.file.items.map((i) => norm(i))).toEqual([
      { kind: "Comment", text: "// standalone" },
      { kind: "VarDecl", type: "int", isConst: false, name: "x", init: { kind: "NumberLit", raw: "1" }, leadingComments: ["// leading 1", "// leading 2"], trailingComment: "// trailing" },
      { kind: "VarDecl", type: "int", isConst: false, name: "y", leadingComments: ["/* block\n   two lines */"] },
    ]);
  });
  it("comment between if condition and body makes the statement raw (never dropped)", () => {
    const stmts = body("if (a) // why\n  delay(1);");
    expect(stmts[0]).toMatchObject({ kind: "RawStatement", text: "if (a) // why\n  delay(1);" });
  });
  it("class definition and its trailing ; are one raw region", () => {
    const r = parseSketch("class A { int x; };\nint y;\n");
    expect(r.file.items[0]).toMatchObject({ kind: "RawTopLevel", text: "class A { int x; };" });
    expect(r.file.items[1]).toMatchObject({ kind: "VarDecl", name: "y" });
  });
});

describe("encoding, spans, errors", () => {
  it("spans use UTF-8 byte offsets and UTF-16 columns", () => {
    const src = "// é😀\nint a = 1;\n";
    const r = parseSketch(src);
    const decl = r.file.items[0]!;
    expect(decl.kind).toBe("VarDecl");
    expect(decl.leadingComments).toEqual(["// é😀"]);
    // "// é😀\n" is 3 + 2 + 4 + 1 = 10 bytes in UTF-8 (6 UTF-16 code units + newline).
    expect(decl.span).toEqual({ startByte: 10, endByte: 20, startLine: 1, startCol: 0, endLine: 1, endCol: 10 });
    expect(Buffer.from(src, "utf8").subarray(decl.span!.startByte, decl.span!.endByte).toString("utf8")).toBe("int a = 1;");
  });
  it("UTF-8 inside strings/comments round-trips byte-for-byte", () => {
    const src = 'void setup() {\n  Serial.println("Température ✓ 😀"); // é\n}\n';
    expect(generate(parseSketch(src).file).code).toBe(src);
  });
  it("detects CRLF and comment text has no stray CR", () => {
    const r = parseSketch("int a; // x\r\nint b;\r\n");
    expect(r.file.eol).toBe("\r\n");
    expect(r.file.items[0]!.trailingComment).toBe("// x");
    expect(generate(r.file).code).toBe("int a; // x\r\nint b;\r\n");
  });
  it("CRLF raw regions keep their internal CRLF", () => {
    const src = "#ifdef X\r\nint a;\r\n#endif\r\nvoid loop() {\r\n}\r\n";
    const r = parseSketch(src);
    expect((r.file.items[0] as { text: string }).text).toBe("#ifdef X\r\nint a;\r\n#endif");
    expect(generate(r.file).code).toBe("#ifdef X\r\nint a;\r\n#endif\r\n\r\nvoid loop() {\r\n}\r\n");
  });
  it("malformed source -> ok:false with diagnostics and prev retained", () => {
    const good = parseSketch("void loop() { delay(1); }\n");
    const bad = parseSketch("void loop() { if (x == ) { }\n", "main.ino", good.file);
    expect(bad.ok).toBe(false);
    expect(bad.file).toBe(good.file);
    expect(bad.diagnostics.length).toBeGreaterThan(0);
    expect(bad.diagnostics.every((d) => d.severity === "error")).toBe(true);
    expect(bad.coverage.entries.every((e) => e.coverage === "parse_error")).toBe(true);
  });
  it("empty source", () => {
    const r = parseSketch("");
    expect(r.ok).toBe(true);
    expect(r.file.items).toEqual([]);
    expect(r.coverage.ratio).toBe(1);
  });
});

describe("Arduino attribute macros (PROGMEM, IRAM_ATTR...)", () => {
  it("parse instead of failing, and the containing item is preserved raw (macro never dropped)", () => {
    const src = 'const char msg[] PROGMEM = "hi";\nvoid IRAM_ATTR onPulse() {\n  count++;\n}\nvoid setup() {\n  Serial.println("PROGMEM in a string is fine");\n  static const int t[] PROGMEM = {1, 2};\n}\nvoid loop() {\n}\n';
    const r = parseSketch(src);
    expect(r.ok).toBe(true);
    expect(r.file.items.map((i) => i.kind)).toEqual(["RawTopLevel", "RawTopLevel", "Function", "Function"]);
    expect((r.file.items[0] as { text: string }).text).toBe('const char msg[] PROGMEM = "hi";');
    const setupBody = (r.file.items[2] as Extract<TopLevel, { kind: "Function" }>).body;
    expect(setupBody.map((s) => s.kind)).toEqual(["ExprStmt", "RawStatement"]);
    expect(r.coverage.entries.filter((e) => e.construct === "arduino_attribute_macro")).toHaveLength(3);
    const g = generate(r.file).code;
    expect(g).toContain("const char msg[] PROGMEM");
    expect(g).toContain("void IRAM_ATTR onPulse()");
    expect(g).toContain("static const int t[] PROGMEM = {1, 2};");
  });
  it("macro names in #define lines are untouched", () => {
    const r = parseSketch("#define ICACHE_RAM_ATTR IRAM_ATTR\nvoid loop() {}\n");
    expect(r.ok).toBe(true);
    expect(r.file.items[0]).toMatchObject({ kind: "Define", name: "ICACHE_RAM_ATTR", value: "IRAM_ATTR" });
  });
});
