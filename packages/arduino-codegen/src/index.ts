/**
 * @pinflow/arduino-codegen — PinFlow IR -> formatted Arduino C++ + source map.
 *
 * Deterministic: same IR => same text. 2-space indentation, file.eol line endings,
 * minimal parentheses from C++ precedence (explicit Paren nodes always kept),
 * raw regions emitted byte-for-byte, comments re-emitted in place.
 */
import type { Expr, GenerateResult, IfBranch, SketchFile, SourceMapEntry, Stmt, SwitchCase, TopLevel, VarDecl } from "@pinflow/arduino-ir";

const INDENT = "  ";

/** C++ precedence levels (higher binds tighter). */
export const PREC = {
  ternary: 3,
  "||": 4,
  "&&": 5,
  "|": 6,
  "^": 7,
  "&": 8,
  "==": 9,
  "!=": 9,
  "<": 10,
  "<=": 10,
  ">": 10,
  ">=": 10,
  "<<": 11,
  ">>": 11,
  "+": 12,
  "-": 12,
  "*": 13,
  "/": 13,
  "%": 13,
  unary: 14,
  postfix: 15,
  primary: 16,
} as const;

/** Precedence of an expression as printed (RawExpr is treated as primary: it is emitted verbatim). */
export function exprPrec(e: Expr): number {
  switch (e.kind) {
    case "Binary":
      return PREC[e.op];
    case "Ternary":
      return PREC.ternary;
    case "Unary":
      return PREC.unary;
    case "Update":
      return e.prefix ? PREC.unary : PREC.postfix;
    case "Index":
    case "Call":
    case "MethodCall":
      return PREC.postfix;
    case "NumberLit":
      // A signed literal typed by a block ("-5") behaves like a unary expression.
      return /^[-+]/.test(e.raw) ? PREC.unary : PREC.primary;
    default:
      return PREC.primary;
  }
}

class Writer {
  lines: string[] = [""];
  map: SourceMapEntry[] = [];
  constructor(private readonly path: string, private readonly blockIds: Record<string, string[]>) {}

  get line() {
    return this.lines.length - 1;
  }
  get col() {
    return this.lines[this.lines.length - 1]!.length;
  }
  /** `s` may contain newlines (raw regions / block comments): split on \n; a CR before it stays on the line. */
  write(s: string) {
    const parts = s.split("\n");
    this.lines[this.lines.length - 1] += parts[0]!;
    for (let i = 1; i < parts.length; i++) this.lines.push(parts[i]!);
  }
  newline() {
    this.lines.push("");
  }
  /** Run `fn` and record a source-map entry for node `id` covering what it wrote. */
  track(id: string, origin: "native" | "raw", fn: () => void) {
    const entry: SourceMapEntry = { path: this.path, nodeId: id, blockIds: this.blockIds[id] ?? [], origin, startLine: this.line, startCol: this.col, endLine: 0, endCol: 0 };
    this.map.push(entry);
    fn();
    entry.endLine = this.line;
    entry.endCol = this.col;
  }
}

/** Raw text from a CRLF source carries "\r" before each split point: drop it so `eol` joins cleanly. */
function joinLines(lines: string[], eol: string): string {
  if (eol === "\r\n") return lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l)).join(eol);
  return lines.join(eol);
}

function isStmt(x: Expr | Stmt): x is Stmt {
  return x.kind === "Assign" || x.kind === "ExprStmt" || x.kind === "VarDecl" || x.kind === "RawStatement";
}

/** First character the expression will print (for token-merge avoidance). */
function firstChar(e: Expr): string {
  switch (e.kind) {
    case "Unary":
      return e.op;
    case "Update":
      return e.prefix ? e.op[0]! : firstChar(e.target);
    case "NumberLit":
      return e.raw[0] ?? "";
    case "RawExpr":
      return e.text[0] ?? "";
    case "Binary":
      return firstChar(e.left);
    case "Ternary":
      return firstChar(e.cond);
    case "Index":
      return firstChar(e.target);
    default:
      return "";
  }
}

export class Generator {
  private w: Writer;
  constructor(private readonly file: SketchFile, blockIdsByNode: Record<string, string[]> = {}) {
    this.w = new Writer(file.path, blockIdsByNode);
  }

  run(): GenerateResult {
    const items = this.file.items;
    items.forEach((item, i) => {
      if (i > 0) {
        const prev = items[i - 1]!;
        // Functions are always separated by a blank line; a comment right after a function may hug it.
        if (item.blankLineBefore || item.kind === "Function" || (prev.kind === "Function" && item.kind !== "Comment")) this.w.newline();
      }
      this.topLevel(item);
      this.w.newline();
    });
    return { code: joinLines(this.w.lines, this.file.eol), sourceMap: this.w.map };
  }

  private indent(depth: number) {
    this.w.write(INDENT.repeat(depth));
  }

  private leading(node: { leadingComments?: string[] }, depth: number) {
    for (const c of node.leadingComments ?? []) {
      this.indent(depth);
      this.w.write(c);
      this.w.newline();
    }
  }

  private trailing(node: { trailingComment?: string }) {
    if (node.trailingComment) this.w.write(` ${node.trailingComment}`);
  }

  private topLevel(item: TopLevel) {
    this.leading(item, 0);
    this.w.track(item.id, item.kind === "RawTopLevel" ? "raw" : "native", () => {
      switch (item.kind) {
        case "Include":
          this.w.write(item.system ? `#include <${item.path}>` : `#include "${item.path}"`);
          break;
        case "Define":
          this.w.write(item.value ? `#define ${item.name} ${item.value}` : `#define ${item.name}`);
          break;
        case "VarDecl":
          this.varDecl(item);
          this.w.write(";");
          break;
        case "ObjectDecl":
          this.w.write(`${item.className} ${item.name}`);
          if (item.hasParens || item.args.length) {
            this.w.write("(");
            this.args(item.args);
            this.w.write(")");
          }
          this.w.write(";");
          break;
        case "Function":
          this.w.write(`${item.returnType} ${item.name}(${item.params.map((p) => (p.name ? `${p.type} ${p.name}` : p.type)).join(", ")}) {`);
          this.body(item.body, 1);
          this.w.write("}");
          break;
        case "Comment":
          this.w.write(item.text);
          break;
        case "RawTopLevel":
          this.w.write(item.text);
          break;
      }
    });
    this.trailing(item);
  }

  /** After an opening `{`: newline, statements at `depth`, then indentation for the closing brace. */
  private body(stmts: Stmt[], depth: number) {
    this.w.newline();
    stmts.forEach((s, i) => {
      if (i > 0 && s.blankLineBefore) this.w.newline();
      this.stmt(s, depth);
      this.w.newline();
    });
    this.indent(depth - 1);
  }

  private varDecl(v: VarDecl) {
    this.w.write(`${v.type} ${v.name}`);
    if (v.arraySize !== undefined) this.w.write(`[${v.arraySize}]`);
    if (v.init) {
      this.w.write(" = ");
      this.expr(v.init, 0);
    } else if (v.arrayInit) {
      this.w.write(" = {");
      this.args(v.arrayInit);
      this.w.write("}");
    }
  }

  private stmt(s: Stmt, depth: number) {
    this.leading(s, depth);
    // Preprocessor lines inside bodies stay at column 0 (conventional, and what the parser saw).
    if (!(s.kind === "RawStatement" && s.text.startsWith("#"))) this.indent(depth);
    this.w.track(s.id, s.kind === "RawStatement" ? "raw" : "native", () => this.stmtInline(s, depth, true));
    this.trailing(s);
  }

  /** Statement text without leading indentation. `semi` = emit the terminating semicolon of simple statements. */
  private stmtInline(s: Stmt, depth: number, semi: boolean) {
    const end = () => {
      if (semi) this.w.write(";");
    };
    switch (s.kind) {
      case "VarDecl":
        this.varDecl(s);
        end();
        break;
      case "ExprStmt":
        this.expr(s.expr, 0);
        end();
        break;
      case "Assign":
        this.expr(s.target, PREC.unary);
        this.w.write(` ${s.op} `);
        this.expr(s.value, 0);
        end();
        break;
      case "If":
        s.branches.forEach((b: IfBranch, i) => {
          this.w.track(b.id, "native", () => {
            this.w.write(i === 0 ? "if (" : " else if (");
            this.expr(b.cond, 0);
            this.w.write(") {");
            this.body(b.body, depth + 1);
            this.w.write("}");
          });
        });
        if (s.elseBody) {
          this.w.write(" else {");
          this.body(s.elseBody, depth + 1);
          this.w.write("}");
        }
        break;
      case "While":
        this.w.write("while (");
        this.expr(s.cond, 0);
        this.w.write(") {");
        this.body(s.body, depth + 1);
        this.w.write("}");
        break;
      case "DoWhile":
        this.w.write("do {");
        this.body(s.body, depth + 1);
        this.w.write("} while (");
        this.expr(s.cond, 0);
        this.w.write(");");
        break;
      case "For": {
        this.w.write("for (");
        const init = s.init;
        if (init) this.w.track(init.id, init.kind === "RawStatement" ? "raw" : "native", () => this.stmtInline(init, depth, false));
        this.w.write(";");
        if (s.cond) {
          this.w.write(" ");
          this.expr(s.cond, 0);
        }
        this.w.write(";");
        const u = s.update;
        if (u) {
          this.w.write(" ");
          if (isStmt(u)) this.w.track(u.id, "native", () => this.stmtInline(u, depth, false));
          else this.expr(u, 0);
        }
        this.w.write(") {");
        this.body(s.body, depth + 1);
        this.w.write("}");
        break;
      }
      case "Switch":
        this.w.write("switch (");
        this.expr(s.subject, 0);
        this.w.write(") {");
        this.w.newline();
        s.cases.forEach((c: SwitchCase) => {
          this.indent(depth + 1);
          this.w.track(c.id, "native", () => {
            if (c.value) {
              this.w.write("case ");
              this.expr(c.value, 0);
              this.w.write(":");
            } else this.w.write("default:");
          });
          this.w.newline();
          c.body.forEach((b, i) => {
            if (i > 0 && b.blankLineBefore) this.w.newline();
            this.stmt(b, depth + 2);
            this.w.newline();
          });
        });
        this.indent(depth);
        this.w.write("}");
        break;
      case "Break":
        this.w.write("break");
        end();
        break;
      case "Continue":
        this.w.write("continue");
        end();
        break;
      case "Return":
        this.w.write("return");
        if (s.value) {
          this.w.write(" ");
          this.expr(s.value, 0);
        }
        end();
        break;
      case "Comment":
        this.w.write(s.text);
        break;
      case "RawStatement":
        this.w.write(s.text);
        break;
    }
  }

  private args(args: Expr[]) {
    args.forEach((a, i) => {
      if (i > 0) this.w.write(", ");
      this.expr(a, 0);
    });
  }

  /**
   * Emit `e`, wrapping it in generated parentheses when its precedence is below `min`.
   * Parsed IR keeps source parentheses as Paren nodes, so generated ones only appear
   * for IR assembled by blocks (or edited) in an order that needs them.
   */
  private expr(e: Expr, min: number) {
    const needParens = exprPrec(e) < min;
    if (needParens) this.w.write("(");
    this.w.track(e.id, e.kind === "RawExpr" ? "raw" : "native", () => this.exprInner(e));
    if (needParens) this.w.write(")");
  }

  private exprInner(e: Expr) {
    switch (e.kind) {
      case "NumberLit":
      case "StringLit":
      case "CharLit":
        this.w.write(e.raw);
        break;
      case "BoolLit":
        this.w.write(e.value ? "true" : "false");
        break;
      case "Ident":
        this.w.write(e.name);
        break;
      case "Binary": {
        const p = PREC[e.op];
        this.expr(e.left, p);
        this.w.write(` ${e.op} `);
        this.expr(e.right, p + 1);
        break;
      }
      case "Unary": {
        this.w.write(e.op);
        // Avoid token merging: "- -x", "- --x", "+ +x".
        if ((e.op === "-" || e.op === "+") && firstChar(e.operand) === e.op && exprPrec(e.operand) >= PREC.unary) this.w.write(" ");
        this.expr(e.operand, PREC.unary);
        break;
      }
      case "Update":
        if (e.prefix) {
          this.w.write(e.op);
          this.expr(e.target, PREC.unary);
        } else {
          this.expr(e.target, PREC.postfix);
          this.w.write(e.op);
        }
        break;
      case "Paren":
        this.w.write("(");
        this.expr(e.inner, 0);
        this.w.write(")");
        break;
      case "Ternary":
        this.expr(e.cond, PREC.ternary + 1);
        this.w.write(" ? ");
        this.expr(e.then, 0);
        this.w.write(" : ");
        this.expr(e.else, PREC.ternary);
        break;
      case "Index":
        this.expr(e.target, PREC.postfix);
        this.w.write("[");
        this.expr(e.index, 0);
        this.w.write("]");
        break;
      case "Call":
        this.w.write(`${e.callee}(`);
        this.args(e.args);
        this.w.write(")");
        break;
      case "MethodCall":
        this.w.write(`${e.object}.${e.method}(`);
        this.args(e.args);
        this.w.write(")");
        break;
      case "RawExpr":
        this.w.write(e.text);
        break;
    }
  }
}

/** Generate C++ for a sketch file. `blockIdsByNode` maps IR node ids to Blockly block ids for the source map. */
export function generate(file: SketchFile, blockIdsByNode?: Record<string, string[]>): GenerateResult {
  return new Generator(file, blockIdsByNode).run();
}
