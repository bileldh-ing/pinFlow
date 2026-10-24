/**
 * Spec 15.3 property tests: random supported IR -> generate -> parse.
 *
 * Equality is checked after removing Paren nodes from both sides: generated
 * parentheses (needed for precedence) come back as Paren nodes, so "same tree
 * modulo parens" is exactly "precedence preserved". A second property checks
 * that every explicit Paren in the input survives, and a third that generation
 * is a fixed point after one normalization pass.
 *
 * Known C++ ambiguities (docs/parser-coverage.md, limitation 1): `x < y ... > (z)`
 * (template call?) and `(a) + b` (cast?). The arbitrary avoids a parenthesised
 * operand right of `>`/`>>`; any remaining ambiguous expression may only come back
 * as a RawExpr/RawStatement whose text is byte-identical to the generated code of
 * the original subtree, and such degradations must stay rare (asserted).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import type { BinaryOp, Expr, SketchFile, Stmt } from "@pinflow/arduino-ir";
import { normalizeIr, walkIr } from "@pinflow/arduino-ir";
import { exprPrec, generate } from "@pinflow/arduino-codegen";
import { initParser, parseSketch } from "../src/index";

beforeAll(async () => {
  await initParser();
});

let n = 0;
const id = () => `t${++n}`;

const IDENTS = ["a", "b", "c", "x", "ledPin", "value", "HIGH", "LOW"];
const BIN_OPS: BinaryOp[] = ["+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">=", "&&", "||", "&", "|", "^", "<<", ">>"];

const leaf: fc.Arbitrary<Expr> = fc.oneof(
  fc.constantFrom(...IDENTS).map((name): Expr => ({ kind: "Ident", id: id(), name })),
  fc.oneof(fc.nat({ max: 100000 }).map(String), fc.constantFrom("1.5", "0x1F", "100UL", "2.0f", "0b101")).map((raw): Expr => ({ kind: "NumberLit", id: id(), raw })),
  fc.boolean().map((value): Expr => ({ kind: "BoolLit", id: id(), value })),
  fc.constantFrom('"hi"', '"a {;} \\"q\\""', '"// no"').map((raw): Expr => ({ kind: "StringLit", id: id(), raw })),
  fc.constantFrom("'a'", "'\\n'", "'}'").map((raw): Expr => ({ kind: "CharLit", id: id(), raw })),
);

function startsWithParen(e: Expr, min: number): boolean {
  if (exprPrec(e) < min) return true; // generator will wrap it
  switch (e.kind) {
    case "Paren":
      return true;
    case "Binary":
      return startsWithParen(e.left, 0) || false;
    default:
      return false;
  }
}

const { expr } = fc.letrec<{ expr: Expr }>((tie) => ({
  expr: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    leaf,
    fc.record({ op: fc.constantFrom(...BIN_OPS), left: tie("expr"), right: tie("expr") })
      .filter(({ op, right }) => !((op === ">" || op === ">>") && (right.kind === "Paren" || startsWithParen(right, 11))))
      .map(({ op, left, right }): Expr => ({ kind: "Binary", id: id(), op, left, right })),
    fc.record({ op: fc.constantFrom("!", "-", "+", "~" as const), operand: tie("expr") }).map(({ op, operand }): Expr => ({ kind: "Unary", id: id(), op: op as "!", operand })),
    fc.record({ op: fc.constantFrom("++", "--" as const), prefix: fc.boolean(), name: fc.constantFrom("i", "count") }).map(({ op, prefix, name }): Expr => ({
      kind: "Update", id: id(), op: op as "++", prefix, target: { kind: "Ident", id: id(), name },
    })),
    tie("expr").map((inner): Expr => ({ kind: "Paren", id: id(), inner })),
    fc.record({ cond: tie("expr"), then: tie("expr"), else: tie("expr") }).map((r): Expr => ({ kind: "Ternary", id: id(), ...r })),
    fc.record({ name: fc.constantFrom("arr", "pins"), index: tie("expr") }).map(({ name, index }): Expr => ({ kind: "Index", id: id(), target: { kind: "Ident", id: id(), name }, index })),
    fc.record({ callee: fc.constantFrom("map", "constrain", "min", "max", "abs", "millis", "digitalRead", "analogRead"), args: fc.array(tie("expr"), { maxLength: 3 }) }).map(({ callee, args }): Expr => ({ kind: "Call", id: id(), callee, args })),
    fc.record({ method: fc.constantFrom("print", "println", "available"), args: fc.array(tie("expr"), { maxLength: 2 }) }).map(({ method, args }): Expr => ({ kind: "MethodCall", id: id(), object: "Serial", method, args })),
  ),
}));

const simpleStmt: fc.Arbitrary<Stmt> = fc.oneof(
  // Expression statements are calls/updates (what Arduino code and blocks produce). A statement that *starts*
  // with "(" such as `(~a) + x;` is ambiguous with a C-style cast in tree-sitter-cpp (see docs/parser-coverage.md).
  expr.map((e): Stmt => ({ kind: "ExprStmt", id: id(), expr: e.kind === "Call" || e.kind === "MethodCall" || e.kind === "Update" ? e : { kind: "Call", id: id(), callee: "delay", args: [e] } })),
  fc.record({ op: fc.constantFrom("=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=" as const), name: fc.constantFrom("x", "total"), value: expr }).map(({ op, name, value }): Stmt => ({
    kind: "Assign", id: id(), op: op as "=", target: { kind: "Ident", id: id(), name }, value,
  })),
  fc.record({ type: fc.constantFrom("int", "float", "unsigned long", "const int", "bool", "byte"), name: fc.constantFrom("v1", "v2"), init: fc.option(expr, { nil: undefined }) }).map(({ type, name, init }): Stmt => {
    const s: Stmt = { kind: "VarDecl", id: id(), type, isConst: type.startsWith("const"), name };
    if (init) s.init = init;
    return s;
  }),
  fc.constantFrom<Stmt["kind"]>("Break", "Continue").map((kind): Stmt => ({ kind, id: id() }) as Stmt),
  fc.option(expr, { nil: undefined }).map((value): Stmt => (value ? { kind: "Return", id: id(), value } : { kind: "Return", id: id() })),
);

const { stmt } = fc.letrec<{ stmt: Stmt }>((tie) => ({
  stmt: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    simpleStmt,
    fc.record({ conds: fc.array(fc.tuple(expr, fc.array(tie("stmt"), { maxLength: 3 })), { minLength: 1, maxLength: 3 }), elseBody: fc.option(fc.array(tie("stmt"), { maxLength: 3 }), { nil: undefined }) }).map(({ conds, elseBody }): Stmt => {
      const s: Stmt = { kind: "If", id: id(), branches: conds.map(([cond, body]) => ({ id: id(), cond, body })) };
      if (elseBody) s.elseBody = elseBody;
      return s;
    }),
    fc.record({ cond: expr, body: fc.array(tie("stmt"), { maxLength: 3 }) }).map(({ cond, body }): Stmt => ({ kind: "While", id: id(), cond, body })),
    fc.record({ cond: expr, body: fc.array(tie("stmt"), { maxLength: 3 }) }).map(({ cond, body }): Stmt => ({ kind: "DoWhile", id: id(), cond, body })),
    fc.record({ cond: fc.option(expr, { nil: undefined }), body: fc.array(tie("stmt"), { maxLength: 3 }), hasInit: fc.boolean(), upd: fc.constantFrom("inc", "assign", "none") }).map(({ cond, body, hasInit, upd }): Stmt => {
      const s: Stmt & { kind: "For" } = { kind: "For", id: id(), body };
      if (hasInit) s.init = { kind: "VarDecl", id: id(), type: "int", isConst: false, name: "i", init: { kind: "NumberLit", id: id(), raw: "0" } };
      if (cond) s.cond = cond;
      if (upd === "inc") s.update = { kind: "Update", id: id(), op: "++", prefix: false, target: { kind: "Ident", id: id(), name: "i" } };
      if (upd === "assign") s.update = { kind: "Assign", id: id(), op: "+=", target: { kind: "Ident", id: id(), name: "i" }, value: { kind: "NumberLit", id: id(), raw: "2" } };
      return s;
    }),
    fc.record({ subject: expr, cases: fc.array(fc.tuple(fc.option(fc.nat({ max: 9 }), { nil: undefined }), fc.array(tie("stmt"), { maxLength: 2 })), { maxLength: 3 }) }).map(({ subject, cases }): Stmt => ({
      kind: "Switch", id: id(), subject,
      cases: cases.map(([v, body]) => (v === undefined ? { id: id(), body } : { id: id(), value: { kind: "NumberLit", id: id(), raw: String(v) }, body })),
    })),
  ),
}));

function stripParens<T>(v: T): T {
  const rec = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(rec);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (o.kind === "Paren") return rec(o.inner);
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o)) out[k] = rec(o[k]);
      return out;
    }
    return x;
  };
  return rec(v) as T;
}

function countParens(x: unknown): number {
  let c = 0;
  walkIr(x as SketchFile, (n) => {
    if (n.kind === "Paren") c++;
  });
  return c;
}

const fileOf = (body: Stmt[]): SketchFile => ({ path: "p.ino", eol: "\n", items: [{ kind: "Function", id: id(), returnType: "void", name: "f", params: [], body }] });
const parseBody = (code: string) => {
  const r = parseSketch(code, "p.ino");
  return r;
};

describe("property: generate -> parse", () => {
  it("expressions round-trip (precedence preserved, explicit parens kept; ambiguous ones only degrade to byte-exact RawExpr)", () => {
    let degraded = 0;
    fc.assert(
      fc.property(expr, (e) => {
        const file = fileOf([{ kind: "Assign", id: id(), op: "=", target: { kind: "Ident", id: id(), name: "out" }, value: e }]);
        const g = generate(file);
        const code = g.code;
        const r = parseBody(code);
        expect(r.ok, code).toBe(true);
        const got = (r.file.items[0] as { body: Stmt[] }).body[0] as Extract<Stmt, { kind: "Assign" }>;
        if (got.value.kind === "RawExpr" && e.kind !== "RawExpr") {
          degraded++;
          expect(equivModuloRaw(got.value, e, textIndex(code, g.sourceMap)), code).toBe(true);
        } else {
          expect(stripParens(normalizeIr(got.value)), code).toEqual(stripParens(normalizeIr(e)));
          expect(countParens(got.value)).toBeGreaterThanOrEqual(countParens(e));
        }
        // fixed point after one normalization pass
        expect(generate(r.file).code).toBe(code);
      }),
      { numRuns: 400 },
    );
    expect(degraded).toBeLessThan(40); // < 10%: the cast/template ambiguity, never the norm
  });

  it("statement trees round-trip (template-ambiguous expressions may only degrade to byte-exact RawExpr)", () => {
    let degraded = 0;
    fc.assert(
      fc.property(fc.array(stmt, { minLength: 1, maxLength: 5 }), (body) => {
        const file = fileOf(body);
        const g = generate(file);
        const code = g.code;
        const r = parseBody(code);
        expect(r.ok, code).toBe(true);
        const text = textIndex(code, g.sourceMap);
        const strict = isDeepStrictEqual(stripParens(normalizeIr(r.file)), stripParens(normalizeIr(file)));
        if (!strict) {
          degraded++;
          expect(equivModuloRaw(r.file.items, file.items, text), code).toBe(true);
        } else expect(r.coverage.ratio, code).toBe(1);
        expect(generate(r.file).code).toBe(code);
      }),
      { numRuns: 200 },
    );
    // Degradation is the rare tree-sitter template ambiguity, never the norm.
    expect(degraded).toBeLessThan(20);
  });

  it("raw chunks stay present, byte-identical and ordered", () => {
    const rawText = fc.constantFrom("Wire.begin();", "auto f = [](int v) { return v; };", "#ifdef DEBUG\nSerial.println(\"x\");\n#endif", "p->x = 1;", "{ int scoped = 2; }");
    fc.assert(
      fc.property(fc.array(fc.oneof(simpleStmt, rawText.map((text): Stmt => ({ kind: "RawStatement", id: id(), text, reason: "test" }))), { minLength: 1, maxLength: 6 }), (body) => {
        const code = generate(fileOf(body)).code;
        const r = parseBody(code);
        expect(r.ok, code).toBe(true);
        const raws: string[] = [];
        walkIr(r.file, (x) => {
          if (x.kind === "RawStatement") raws.push(String(x.text));
        });
        expect(raws).toEqual(body.filter((s) => s.kind === "RawStatement").map((s) => (s as { text: string }).text));
      }),
      { numRuns: 150 },
    );
  });

  it("legal whitespace/comment changes do not alter supported nodes", () => {
    fc.assert(
      fc.property(fc.array(simpleStmt, { minLength: 1, maxLength: 4 }), fc.constantFrom("  ", "\t", "\n\n", " /* c */ "), (body, ws) => {
        const code = generate(fileOf(body)).code;
        // insert whitespace/comment between statements (after each ';' at end of line)
        const mutated = code.replace(/;\n/g, `;${ws === " /* c */ " ? "" : ws}\n${ws === " /* c */ " ? "  /* c */\n" : ""}`);
        const a = parseBody(code);
        const b = parseBody(mutated);
        expect(b.ok).toBe(true);
        expect(normalizeIr(b.file, { keepComments: false }).items.map(stripComments)).toEqual(normalizeIr(a.file, { keepComments: false }).items.map(stripComments));
      }),
      { numRuns: 100 },
    );
  });
});

function stripComments(item: unknown): unknown {
  const rec = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.filter((y) => !(y && typeof y === "object" && (y as { kind?: string }).kind === "Comment")).map(rec);
    if (x && typeof x === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(x)) out[k] = rec(v);
      return out;
    }
    return x;
  };
  return rec(item);
}

/** id -> generated text, from the source map. */
function textIndex(code: string, map: { nodeId: string; startLine: number; startCol: number; endLine: number; endCol: number }[]) {
  const lines = code.split("\n");
  const offs: number[] = [];
  let o = 0;
  for (const l of lines) {
    offs.push(o);
    o += l.length + 1;
  }
  const m = new Map<string, string>();
  for (const e of map) m.set(e.nodeId, code.slice(offs[e.startLine]! + e.startCol, offs[e.endLine]! + e.endCol));
  return m;
}

/** Structural equality ignoring ids/spans/layout and Paren nodes, where a parsed RawExpr may stand for an original subtree with identical text. */
function equivModuloRaw(p: unknown, o: unknown, text: Map<string, string>): boolean {
  const skip = (x: unknown): unknown => (x && typeof x === "object" && (x as { kind?: string }).kind === "Paren" ? skip((x as { inner: unknown }).inner) : x);
  if (Array.isArray(p) || Array.isArray(o)) {
    if (!Array.isArray(p) || !Array.isArray(o) || p.length !== o.length) return false;
    return p.every((x, i) => equivModuloRaw(x, o[i], text));
  }
  if (p && typeof p === "object" && o && typeof o === "object") {
    const pr = p as Record<string, unknown>;
    if (pr.kind === "RawExpr" || pr.kind === "RawStatement") {
      const cands = [o, skip(o)].map((x) => text.get((x as { id: string }).id)).filter((t): t is string => !!t);
      return cands.some((t) => pr.text === t || pr.text === `(${t})`);
    }
    const ps = skip(p) as Record<string, unknown>;
    const os = skip(o) as Record<string, unknown>;
    if (ps !== p || os !== o) return equivModuloRaw(ps, os, text);
    const keys = new Set([...Object.keys(ps), ...Object.keys(os)].filter((k) => !["id", "span", "blankLineBefore"].includes(k) && (ps[k] !== undefined || os[k] !== undefined)));
    for (const k of keys) if (!equivModuloRaw(ps[k], os[k], text)) return false;
    return true;
  }
  return p === o;
}
