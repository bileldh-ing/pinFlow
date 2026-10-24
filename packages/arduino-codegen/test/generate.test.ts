import { describe, expect, it } from "vitest";
import type { Expr, SketchFile, Stmt, TopLevel } from "@pinflow/arduino-ir";
import { generate, exprPrec } from "../src/index";

let n = 0;
const id = () => `g${++n}`;
const I = (name: string): Expr => ({ kind: "Ident", id: id(), name });
const N = (raw: string): Expr => ({ kind: "NumberLit", id: id(), raw });
const B = (op: Extract<Expr, { kind: "Binary" }>["op"], left: Expr, right: Expr): Expr => ({ kind: "Binary", id: id(), op, left, right });
const U = (op: "!" | "-" | "+" | "~", operand: Expr): Expr => ({ kind: "Unary", id: id(), op, operand });
const P = (inner: Expr): Expr => ({ kind: "Paren", id: id(), inner });
const call = (callee: string, ...args: Expr[]): Expr => ({ kind: "Call", id: id(), callee, args });
const fn = (name: string, body: Stmt[], returnType = "void"): TopLevel => ({ kind: "Function", id: id(), returnType, name, params: [], body });
const file = (items: TopLevel[], eol: "\n" | "\r\n" = "\n"): SketchFile => ({ path: "main.ino", items, eol });
const exprCode = (e: Expr) => {
  const g = generate(file([fn("f", [{ kind: "Assign", id: id(), op: "=", target: I("x"), value: e }])]));
  return g.code.split("\n")[1]!.trim().replace(/^x = /, "").replace(/;$/, "");
};

describe("expressions: minimal parenthesisation by precedence", () => {
  it("adds parens only where precedence requires them", () => {
    expect(exprCode(B("*", B("+", I("a"), I("b")), I("c")))).toBe("(a + b) * c");
    expect(exprCode(B("+", I("a"), B("*", I("b"), I("c"))))).toBe("a + b * c");
    expect(exprCode(B("-", I("a"), B("-", I("b"), I("c"))))).toBe("a - (b - c)");
    expect(exprCode(B("-", B("-", I("a"), I("b")), I("c")))).toBe("a - b - c");
    expect(exprCode(B("&&", B("||", I("a"), I("b")), I("c")))).toBe("(a || b) && c");
    expect(exprCode(B("|", I("a"), B("&", I("b"), I("c"))))).toBe("a | b & c");
    expect(exprCode(B("==", B("&", I("m"), N("1")), N("0")))).toBe("(m & 1) == 0");
    expect(exprCode(B("<<", N("1"), B("+", I("a"), N("2"))))).toBe("1 << a + 2");
    expect(exprCode(B("+", B("<<", N("1"), I("a")), N("2")))).toBe("(1 << a) + 2");
  });
  it("keeps explicit Paren nodes even when redundant", () => {
    expect(exprCode(B("+", P(I("a")), P(B("*", I("b"), I("c")))))).toBe("(a) + (b * c)");
  });
  it("unary, update, ternary, index, calls", () => {
    expect(exprCode(U("!", B("&&", I("a"), I("b"))))).toBe("!(a && b)");
    expect(exprCode(U("-", U("-", I("x"))))).toBe("- -x");
    expect(exprCode(U("-", N("-5")))).toBe("- -5");
    expect(exprCode(U("-", { kind: "Update", id: id(), op: "--", prefix: true, target: I("x") }))).toBe("- --x");
    expect(exprCode({ kind: "Update", id: id(), op: "++", prefix: false, target: I("i") })).toBe("i++");
    expect(exprCode({ kind: "Ternary", id: id(), cond: B("<", I("a"), I("b")), then: I("a"), else: { kind: "Ternary", id: id(), cond: I("c"), then: N("1"), else: N("2") } })).toBe("a < b ? a : c ? 1 : 2");
    expect(exprCode({ kind: "Ternary", id: id(), cond: { kind: "Ternary", id: id(), cond: I("a"), then: I("b"), else: I("c") }, then: N("1"), else: N("2") })).toBe("(a ? b : c) ? 1 : 2");
    expect(exprCode(B("*", { kind: "Ternary", id: id(), cond: I("a"), then: N("1"), else: N("2") }, N("3")))).toBe("(a ? 1 : 2) * 3");
    expect(exprCode({ kind: "Index", id: id(), target: I("arr"), index: B("+", I("i"), N("1")) })).toBe("arr[i + 1]");
    expect(exprCode(call("map", I("v"), N("0"), N("1023"), N("0"), N("255")))).toBe("map(v, 0, 1023, 0, 255)");
    expect(exprCode({ kind: "MethodCall", id: id(), object: "Serial", method: "println", args: [{ kind: "StringLit", id: id(), raw: '"a {;} \\"b\\""' }] })).toBe('Serial.println("a {;} \\"b\\"")');
    expect(exprCode({ kind: "RawExpr", id: id(), text: "(long)y", reason: "cast" })).toBe("(long)y");
  });
  it("exprPrec ordering matches C++", () => {
    expect(exprPrec(B("*", I("a"), I("b")))).toBeGreaterThan(exprPrec(B("+", I("a"), I("b"))));
    expect(exprPrec(B("&&", I("a"), I("b")))).toBeGreaterThan(exprPrec(B("||", I("a"), I("b"))));
    expect(exprPrec(call("f"))).toBeGreaterThan(exprPrec(U("-", I("a"))));
  });
});

describe("statements and layout", () => {
  it("formats a sketch with 2-space indent, braces everywhere, blank lines between functions", () => {
    const f = file([
      { kind: "Include", id: id(), path: "DHT.h", system: true },
      { kind: "Define", id: id(), name: "DHTPIN", value: "4", trailingComment: "// data pin" },
      { kind: "ObjectDecl", id: id(), className: "DHT", name: "dht", args: [I("DHTPIN"), I("DHT11")], hasParens: true },
      { kind: "VarDecl", id: id(), type: "int", isConst: false, name: "vals", arraySize: "3", arrayInit: [N("1"), N("2"), N("3")] },
      fn("setup", [{ kind: "ExprStmt", id: id(), expr: { kind: "MethodCall", id: id(), object: "Serial", method: "begin", args: [N("115200")] }, leadingComments: ["// start serial"] }]),
      fn("loop", [
        { kind: "If", id: id(), branches: [{ id: id(), cond: I("a"), body: [{ kind: "Break", id: id() }] }, { id: id(), cond: I("b"), body: [] }], elseBody: [{ kind: "Continue", id: id() }] },
        { kind: "For", id: id(), init: { kind: "VarDecl", id: id(), type: "int", isConst: false, name: "i", init: N("0") }, cond: B("<", I("i"), N("3")), update: { kind: "Update", id: id(), op: "++", prefix: false, target: I("i") }, body: [] },
        { kind: "For", id: id(), body: [] },
        { kind: "While", id: id(), cond: { kind: "BoolLit", id: id(), value: true }, body: [], blankLineBefore: true },
        { kind: "DoWhile", id: id(), cond: I("x"), body: [{ kind: "Assign", id: id(), op: "-=", target: I("x"), value: N("1") }] },
        { kind: "Switch", id: id(), subject: I("m"), cases: [{ id: id(), value: N("1"), body: [{ kind: "Break", id: id() }] }, { id: id(), body: [] }] },
        { kind: "RawStatement", id: id(), text: "#ifdef DEBUG\n  Serial.println(1);\n#endif", reason: "preproc" },
        { kind: "Return", id: id() },
      ]),
    ]);
    expect(generate(f).code).toBe(`#include <DHT.h>
#define DHTPIN 4 // data pin
DHT dht(DHTPIN, DHT11);
int vals[3] = {1, 2, 3};

void setup() {
  // start serial
  Serial.begin(115200);
}

void loop() {
  if (a) {
    break;
  } else if (b) {
  } else {
    continue;
  }
  for (int i = 0; i < 3; i++) {
  }
  for (;;) {
  }

  while (true) {
  }
  do {
    x -= 1;
  } while (x);
  switch (m) {
    case 1:
      break;
    default:
  }
#ifdef DEBUG
  Serial.println(1);
#endif
  return;
}
`);
  });

  it("is deterministic and uses file.eol (CRLF)", () => {
    const f = file([fn("loop", [{ kind: "ExprStmt", id: id(), expr: call("delay", N("500")), trailingComment: "// wait" }])], "\r\n");
    const a = generate(f).code;
    expect(a).toBe("void loop() {\r\n  delay(500); // wait\r\n}\r\n");
    expect(generate(f).code).toBe(a);
  });

  it("emits raw regions byte-for-byte, including internal CRLF and odd spacing", () => {
    const raw = "template <typename T>\r\nT  id(T v)   { return v; }";
    const g = generate(file([{ kind: "RawTopLevel", id: "r1", text: raw, reason: "template" }], "\r\n"));
    expect(g.code).toBe(raw + "\r\n");
    expect(g.sourceMap).toEqual([{ path: "main.ino", nodeId: "r1", blockIds: [], origin: "raw", startLine: 0, startCol: 0, endLine: 1, endCol: 26 }]);
  });

  it("source map: every node once, 0-based positions, block ids attached", () => {
    const delayCall = call("delay", N("10"));
    const stmt: Stmt = { kind: "ExprStmt", id: "s1", expr: delayCall };
    const f = file([{ ...fn("loop", [stmt]), id: "f1" } as TopLevel]);
    const g = generate(f, { s1: ["blk-7"] });
    const byId = Object.fromEntries(g.sourceMap.map((e) => [e.nodeId, e]));
    expect(byId.f1).toMatchObject({ startLine: 0, startCol: 0, endLine: 2, endCol: 1, origin: "native", blockIds: [] });
    expect(byId.s1).toMatchObject({ startLine: 1, startCol: 2, endLine: 1, endCol: 12, blockIds: ["blk-7"] });
    expect(byId[delayCall.id]).toMatchObject({ startLine: 1, startCol: 2, endLine: 1, endCol: 11 });
    expect(g.sourceMap).toHaveLength(4); // function, stmt, call, literal
  });
});
