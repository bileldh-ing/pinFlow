/**
 * Tree-sitter C++ CST -> PinFlow IR.
 *
 * Every structural decision is made on CST node types/fields. The only text-level
 * processing is on tokens tree-sitter itself treats as opaque (the body of a
 * `#define`, i.e. `preproc_arg`), see mapDefine().
 *
 * Unsupported constructs throw `Unsupported`, which the nearest statement /
 * top-level boundary turns into RawStatement / RawTopLevel holding the exact
 * source text. Unsupported sub-expressions become RawExpr in place.
 * Safety net: after a statement/top-level item is mapped natively, every comment
 * inside its source range must have been attached somewhere; otherwise the whole
 * item becomes raw, so no comment is ever silently dropped.
 */
import type { Node } from "web-tree-sitter";
import type { AssignOp, BinaryOp, Expr, IfBranch, NodeId, Param, SketchFile, SourceSpan, Stmt, SwitchCase, TopLevel, UnaryOp, VarDecl } from "@pinflow/arduino-ir";
import { CORE_FUNCTIONS, CORE_OBJECTS, LIBRARY_PACKS, findLibraryClass } from "@pinflow/board-registry";
import { Positions } from "./positions";

export class Unsupported extends Error {
  constructor(public construct: string, public reason: string) {
    super(reason);
  }
}

export interface RawInfo {
  construct: string;
  reason: string;
}

const BINARY_OPS = new Set<string>(["+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">=", "&&", "||", "&", "|", "^", "<<", ">>"]);
const UNARY_OPS = new Set<string>(["!", "-", "+", "~"]);
const ASSIGN_OPS = new Set<string>(["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="]);
const ALLOWED_STORAGE = new Set(["static"]);
const ALLOWED_QUALIFIERS = new Set(["const", "volatile"]);
const FN_STORAGE = new Set(["static", "inline"]);
/** type_identifier names that are Arduino value types, not library classes. */
const VALUE_TYPES = new Set(["String", "byte", "boolean", "word"]);

const RAW_EXPLANATIONS: Record<string, string> = {
  template_declaration: "Templates are not part of the PinFlow visual subset; the code is kept exactly as written.",
  class_specifier: "Class definitions are an advanced feature and are not flattened into blocks.",
  struct_specifier: "Struct definitions are an advanced feature and are not flattened into blocks.",
  enum_specifier: "Enumerations are an advanced feature in v1 and are kept as written.",
  union_specifier: "Unions are not part of the visual subset.",
  lambda_expression: "Lambdas are not part of the visual subset.",
  preproc_ifdef: "Conditional compilation (#ifdef/#ifndef) is preserved verbatim because each branch may target a different board.",
  preproc_if: "Conditional compilation (#if/#elif) is preserved verbatim because each branch may target a different board.",
  preproc_function_def: "Function-like macros are preserved verbatim; their expansion is not analysed.",
  preproc_call: "This preprocessor directive is preserved verbatim.",
  namespace_definition: "Namespaces are not part of the visual subset.",
  type_definition: "typedef declarations are preserved verbatim.",
  using_declaration: "using declarations are preserved verbatim.",
  alias_declaration: "Type aliases are preserved verbatim.",
  cast_expression: "Type casts are preserved as code because their semantics are not modelled in v1.",
  pointer_expression: "Pointer/address operations are not part of the visual subset.",
  field_expression: "Member access outside a recognised method call is preserved as code.",
  sizeof_expression: "sizeof is preserved as code.",
  compound_statement: "A nested { } block introduces its own scope and is preserved as code.",
};

export function explain(construct: string, fallback?: string): string {
  return RAW_EXPLANATIONS[construct] ?? fallback ?? `"${construct}" is not part of the PinFlow Arduino Visual Subset v1; kept exactly as written.`;
}

let salt = Math.random().toString(36).slice(2, 7);
let seq = 0;
/** Fresh node id, unique within this JS realm (stable ids are applied afterwards from `prev`). */
export function freshId(): NodeId {
  seq += 1;
  if (seq > 1e9) {
    seq = 1;
    salt = Math.random().toString(36).slice(2, 7);
  }
  return `n${salt}${seq.toString(36)}`;
}

export interface MapOptions {
  /** Function names defined in other files of the same sketch (treated as known calls). */
  extraKnownFunctions?: string[];
}

/** Internal: ranges of masked attribute macros (see arduinoMacros.ts). */
export interface ForcedRaw {
  start: number;
  end: number;
  name: string;
}

type WithStart = { _start?: number };

export class Mapper {
  readonly pos: Positions;
  /** Raw construct info keyed by node object (survives id rewriting). */
  private readonly rawInfo = new WeakMap<object, RawInfo>();
  private readonly commentStarts: number[];
  private readonly consumed = new Set<number>();
  private readonly knownFunctions = new Set<string>(CORE_FUNCTIONS);
  private readonly knownObjects = new Map<string, Set<string>>();
  private readonly knownValues = new Set<string>();

  constructor(private readonly src: string, private readonly root: Node, opts: MapOptions = {}, private readonly forcedRaw: ForcedRaw[] = []) {
    this.pos = new Positions(src);
    this.commentStarts = root.descendantsOfType("comment").map((c) => c.startIndex).sort((a, b) => a - b);
    for (const [obj, methods] of Object.entries(CORE_OBJECTS)) this.knownObjects.set(obj, new Set(methods));
    for (const f of opts.extraKnownFunctions ?? []) this.knownFunctions.add(f);
    for (const p of LIBRARY_PACKS) for (const c of p.constants) this.knownValues.add(c);
    this.prepass();
  }

  rawInfoOf(n: object): RawInfo | undefined {
    return this.rawInfo.get(n);
  }

  /* --------------------------------- helpers -------------------------------- */

  private text(n: Node): string {
    return this.src.slice(n.startIndex, n.endIndex);
  }

  private rawEnd(start: number, end: number): number {
    let e = end;
    while (e > start && (this.src[e - 1] === "\n" || this.src[e - 1] === "\r")) e--;
    return e;
  }

  /** Source text with trailing line terminator(s) removed (preprocessor nodes include them). */
  private rawText(start: number, end: number): string {
    return this.src.slice(start, this.rawEnd(start, end));
  }

  private span(n: Node): SourceSpan {
    return this.pos.span(n.startIndex, this.rawEnd(n.startIndex, n.endIndex));
  }

  private commentText(n: Node): string {
    return this.rawText(n.startIndex, n.endIndex).replace(/\r$/, "");
  }

  private opOf(n: Node): string {
    const op = n.childForFieldName("operator");
    if (op) return this.text(op);
    return n.children.find((c) => !c.isNamed)?.type ?? "";
  }

  /** Comment start indices inside [start, end). */
  private commentsIn(start: number, end: number): number[] {
    const out: number[] = [];
    let lo = 0;
    let hi = this.commentStarts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.commentStarts[mid]! < start) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < this.commentStarts.length && this.commentStarts[i]! < end; i++) out.push(this.commentStarts[i]!);
    return out;
  }

  private hasUnconsumedComment(start: number, end: number): boolean {
    return this.commentsIn(start, end).some((c) => !this.consumed.has(c));
  }

  private consumeRange(start: number, end: number): void {
    for (const c of this.commentsIn(start, end)) this.consumed.add(c);
  }

  /** Pre-pass: user function names, library object names and macro names (for call recognition). */
  private prepass(): void {
    for (const n of this.root.namedChildren) {
      if (n.type === "function_definition" || n.type === "declaration") {
        const decl = n.childForFieldName("declarator");
        if (decl?.type === "function_declarator") {
          const name = decl.childForFieldName("declarator");
          const t = n.childForFieldName("type");
          const isLibObject = n.type === "declaration" && t?.type === "type_identifier" && !!findLibraryClass(this.text(t));
          if (name?.type === "identifier" && !isLibObject) this.knownFunctions.add(this.text(name));
        }
      }
      if (n.type === "declaration") {
        const t = n.childForFieldName("type");
        const lib = t?.type === "type_identifier" ? findLibraryClass(this.text(t)) : undefined;
        if (lib) {
          for (const d of n.childrenForFieldName("declarator")) {
            const id = d.type === "identifier" ? d : d.childForFieldName("declarator");
            if (id?.type === "identifier") this.knownObjects.set(this.text(id), new Set(lib.cls.methods.map((m) => m.name)));
          }
        }
      }
      if (n.type === "preproc_def") {
        const name = n.childForFieldName("name");
        if (name) this.knownValues.add(this.text(name));
      }
    }
  }

  /* -------------------------------- sequences ------------------------------- */

  /**
   * Maps a list of sibling CST nodes (translation unit / block body / case body),
   * attaching comments: a same-line comment after an item -> trailingComment; a run of
   * comments directly above an item (no blank line) -> leadingComments; others ->
   * standalone Comment nodes. Records blank lines as `blankLineBefore`.
   */
  private mapSequence<T extends Stmt | TopLevel>(nodes: Node[], mapOne: (n: Node) => T[], makeRaw: (start: number, end: number, construct: string, reason: string) => T): T[] {
    const out: T[] = [];
    let pending: Node[] = [];
    let prevEnd: { start: number; end: number } | null = null;
    let lastItem: T | null = null;
    let lastItemRow = -1;
    const blankBetween = (endPrev: { start: number; end: number } | null, start: number) =>
      endPrev !== null && this.pos.row(start) - this.pos.lastContentRow(endPrev.start, endPrev.end) >= 2;

    /** Emits pending comments that are not attached to `next` as standalone; returns the attached run. */
    const flushPending = (next: Node | null): Node[] => {
      let attachFrom = pending.length;
      if (next) {
        let cursorStart = next.startIndex;
        for (let i = pending.length - 1; i >= 0; i--) {
          const c = pending[i]!;
          if (blankBetween({ start: c.startIndex, end: c.endIndex }, cursorStart)) break;
          attachFrom = i;
          cursorStart = c.startIndex;
        }
      }
      for (let i = 0; i < attachFrom; i++) {
        const c = pending[i]!;
        const node = { kind: "Comment", id: freshId(), span: this.span(c), text: this.commentText(c) } as T;
        if (blankBetween(prevEnd, c.startIndex)) (node as { blankLineBefore?: boolean }).blankLineBefore = true;
        this.consumed.add(c.startIndex);
        out.push(node);
        prevEnd = { start: c.startIndex, end: c.endIndex };
        lastItem = null;
      }
      const attached = pending.slice(attachFrom);
      pending = [];
      for (const c of attached) this.consumed.add(c.startIndex);
      return attached;
    };

    for (const n of nodes) {
      if (n.type === "comment") {
        const row = this.pos.row(n.startIndex);
        const text = this.commentText(n);
        if (lastItem && pending.length === 0 && row === lastItemRow && !(lastItem as { trailingComment?: string }).trailingComment && !text.includes("\n")) {
          (lastItem as { trailingComment?: string }).trailingComment = text;
          this.consumed.add(n.startIndex);
          prevEnd = { start: n.startIndex, end: n.endIndex };
          continue;
        }
        pending.push(n);
        continue;
      }
      if (!n.isNamed) {
        // Stray token (e.g. the ';' after a class definition): fold into the previous raw item, else keep it raw.
        const prev = out[out.length - 1] as (T & WithStart & { kind: string }) | undefined;
        if (prev && (prev.kind === "RawTopLevel" || prev.kind === "RawStatement") && pending.length === 0 && prev._start !== undefined) {
          const s = prev._start;
          (prev as unknown as { text: string }).text = this.rawText(s, n.endIndex);
          (prev as unknown as { span: SourceSpan }).span = this.pos.span(s, this.rawEnd(s, n.endIndex));
          prevEnd = { start: s, end: n.endIndex };
          lastItemRow = this.pos.lastContentRow(s, n.endIndex);
          continue;
        }
        const attached = flushPending(n);
        const raw = makeRaw(n.startIndex, n.endIndex, n.type, "Stray token preserved as written.");
        if (attached.length) (raw as { leadingComments?: string[] }).leadingComments = attached.map((c) => this.commentText(c));
        if (blankBetween(prevEnd, attached[0]?.startIndex ?? n.startIndex)) (raw as { blankLineBefore?: boolean }).blankLineBefore = true;
        out.push(raw);
        prevEnd = { start: n.startIndex, end: n.endIndex };
        lastItem = raw;
        lastItemRow = this.pos.lastContentRow(n.startIndex, n.endIndex);
        continue;
      }
      const attached = flushPending(n);
      const firstStart = attached.length ? attached[0]!.startIndex : n.startIndex;
      const items = mapOne(n);
      items.forEach((item, i) => {
        if (i === 0) {
          if (attached.length) (item as { leadingComments?: string[] }).leadingComments = attached.map((c) => this.commentText(c));
          if (blankBetween(prevEnd, firstStart)) (item as { blankLineBefore?: boolean }).blankLineBefore = true;
        }
        out.push(item);
      });
      prevEnd = { start: n.startIndex, end: n.endIndex };
      lastItem = items[items.length - 1] ?? null;
      lastItemRow = this.pos.lastContentRow(n.startIndex, n.endIndex);
    }
    flushPending(null);
    for (const it of out) delete (it as WithStart)._start;
    return out;
  }

  /* -------------------------------- top level ------------------------------- */

  mapFile(path: string, eol: "\n" | "\r\n"): SketchFile {
    const items = this.mapSequence<TopLevel>(this.root.children, (n) => this.mapTopGuarded(n), (s, e, c, r) => this.makeRawTop(s, e, c, r));
    return { path, items, eol };
  }

  private makeRawTop(start: number, end: number, construct: string, reason: string): TopLevel {
    this.consumeRange(start, end);
    const t = { kind: "RawTopLevel", id: freshId(), span: this.pos.span(start, this.rawEnd(start, end)), text: this.rawText(start, end), reason } as TopLevel;
    this.rawInfo.set(t, { construct, reason });
    (t as WithStart)._start = start;
    return t;
  }

  private makeRawStmt(start: number, end: number, construct: string, reason: string): Stmt {
    this.consumeRange(start, end);
    const t = { kind: "RawStatement", id: freshId(), span: this.pos.span(start, this.rawEnd(start, end)), text: this.rawText(start, end), reason } as Stmt;
    this.rawInfo.set(t, { construct, reason });
    (t as WithStart)._start = start;
    return t;
  }

  /** Throws when the node contains a masked Arduino attribute macro (kept raw so it is never dropped). */
  private checkForcedRaw(n: Node): void {
    const inside = this.forcedRaw.filter((r) => r.start >= n.startIndex && r.end <= n.endIndex);
    if (inside.length === 0) return;
    // Macros inside nested { } bodies are handled by the nested statements' own guards.
    const blocks = n.descendantsOfType("compound_statement");
    const hit = inside.find((r) => !blocks.some((b) => r.start >= b.startIndex && r.end <= b.endIndex));
    if (hit) throw new Unsupported("arduino_attribute_macro", `${hit.name} is an Arduino/ESP32 attribute macro that blocks cannot represent; the code is kept exactly as written.`);
  }

  private mapTopGuarded(n: Node): TopLevel[] {
    try {
      this.checkForcedRaw(n);
      const items = this.mapTop(n);
      if (this.hasUnconsumedComment(n.startIndex, n.endIndex)) throw new Unsupported(n.type, "A comment sits inside this construct at a position blocks cannot represent; the code is kept exactly as written.");
      return items;
    } catch (e) {
      if (e instanceof Unsupported) return [this.makeRawTop(n.startIndex, n.endIndex, e.construct, e.reason)];
      throw e;
    }
  }

  private mapTop(n: Node): TopLevel[] {
    switch (n.type) {
      case "preproc_include":
        return [this.mapInclude(n)];
      case "preproc_def":
        return [this.mapDefine(n)];
      case "function_definition":
        return [this.mapFunction(n)];
      case "declaration":
        return this.mapTopDeclaration(n);
      default:
        throw new Unsupported(n.type, explain(n.type));
    }
  }

  private mapInclude(n: Node): TopLevel {
    const p = n.childForFieldName("path");
    if (!p) throw new Unsupported(n.type, "Unrecognised #include form.");
    if (p.type === "system_lib_string") {
      return { kind: "Include", id: freshId(), span: this.span(n), path: this.text(p).slice(1, -1), system: true };
    }
    if (p.type === "string_literal") {
      if (p.namedChildren.some((c) => c.type !== "string_content")) throw new Unsupported(n.type, "#include path with escapes is preserved verbatim.");
      return { kind: "Include", id: freshId(), span: this.span(n), path: this.text(p).slice(1, -1), system: false };
    }
    throw new Unsupported(n.type, "Macro-computed #include is preserved verbatim.");
  }

  /**
   * `#define NAME value`. The value (`preproc_arg`) is opaque to tree-sitter, so we
   * only accept values without line continuations, and only split off a trailing
   * comment when the value has no string/char literal. Everything else -> raw.
   */
  private mapDefine(n: Node): TopLevel {
    const name = n.childForFieldName("name");
    if (!name) throw new Unsupported(n.type, "Unrecognised #define form.");
    const arg = n.childForFieldName("value");
    let value = arg ? this.text(arg) : "";
    if (value.includes("\\\n") || value.includes("\\\r\n")) throw new Unsupported("preproc_def", "Multi-line #define is preserved verbatim.");
    value = value.replace(/\r$/, "");
    let trailing: string | undefined;
    const lc = value.indexOf("//");
    const bc = value.indexOf("/*");
    const ci = lc < 0 ? bc : bc < 0 ? lc : Math.min(lc, bc);
    if (ci >= 0) {
      if (/["']/.test(value)) throw new Unsupported("preproc_def", "#define containing both a literal and a comment is preserved verbatim.");
      trailing = value.slice(ci).trim();
      if (trailing.startsWith("/*") && !trailing.endsWith("*/")) throw new Unsupported("preproc_def", "#define with a multi-line comment is preserved verbatim.");
      value = value.slice(0, ci);
    }
    value = value.trim();
    const d: TopLevel = { kind: "Define", id: freshId(), span: this.span(n), name: this.text(name), value };
    if (trailing) d.trailingComment = trailing;
    return d;
  }

  /** Type text (storage + qualifiers + type, in source order) for a declaration-like node. */
  private typeText(n: Node, allowedStorage: Set<string>): { type: string; isConst: boolean } {
    const parts: string[] = [];
    let isConst = false;
    const typeNode = n.childForFieldName("type");
    if (!typeNode) throw new Unsupported(n.type, "Declaration without a type.");
    if (!["primitive_type", "sized_type_specifier", "type_identifier"].includes(typeNode.type)) {
      if (typeNode.type === "placeholder_type_specifier") throw new Unsupported("auto", "auto-typed declarations are preserved as code.");
      throw new Unsupported(typeNode.type, explain(typeNode.type, "This type form is not part of the visual subset."));
    }
    for (const c of n.children) {
      const isType = c.startIndex === typeNode.startIndex && c.type === typeNode.type;
      if (c.startIndex >= typeNode.endIndex && !isType) break;
      if (c.type === "storage_class_specifier") {
        const t = this.text(c);
        if (!allowedStorage.has(t)) throw new Unsupported(c.type, `"${t}" declarations are preserved as code.`);
        parts.push(t);
      } else if (c.type === "type_qualifier") {
        const t = this.text(c);
        if (!ALLOWED_QUALIFIERS.has(t)) throw new Unsupported(c.type, `"${t}" declarations are preserved as code.`);
        if (t === "const") isConst = true;
        parts.push(t);
      } else if (isType) {
        parts.push(this.text(c).replace(/\s+/g, " "));
      } else if (c.type === "comment") {
        throw new Unsupported(n.type, "Comment inside a declaration.");
      } else {
        throw new Unsupported(c.type, explain(c.type, "Declaration modifier not supported by the visual subset."));
      }
    }
    for (const c of n.children) {
      if (c.startIndex <= typeNode.startIndex) continue;
      if (c.type === "type_qualifier") throw new Unsupported("type_qualifier", "Qualifier after the type name is preserved as code.");
      if (c.type === "storage_class_specifier" || c.type === "attribute_specifier" || c.type === "attribute_declaration")
        throw new Unsupported(c.type, "Declaration modifier not supported by the visual subset.");
    }
    return { type: parts.join(" "), isConst };
  }

  private mapTopDeclaration(n: Node): TopLevel[] {
    const typeNode = n.childForFieldName("type");
    const declarators = n.childrenForFieldName("declarator");
    if (!typeNode || declarators.length === 0) throw new Unsupported(n.type, "Declaration form not supported.");
    if (typeNode.type === "type_identifier" && !VALUE_TYPES.has(this.text(typeNode)) && declarators.length === 1) {
      const obj = this.tryObjectDecl(n, typeNode, declarators[0]!);
      if (obj) return [obj];
    }
    if (declarators.some((d) => d.type === "function_declarator")) throw new Unsupported("function_prototype", "Function prototypes are preserved as code (Arduino generates them automatically).");
    return this.mapVarDecls(n);
  }

  private tryObjectDecl(n: Node, typeNode: Node, d: Node): TopLevel | null {
    const className = this.text(typeNode);
    if (n.children.some((c) => c.type === "storage_class_specifier" || c.type === "type_qualifier")) return null;
    const base = { kind: "ObjectDecl" as const, id: freshId(), span: this.span(n), className };
    if (d.type === "identifier") return { ...base, name: this.text(d), args: [], hasParens: false };
    if (d.type === "init_declarator") {
      const id = d.childForFieldName("declarator");
      const value = d.childForFieldName("value");
      if (id?.type === "identifier" && value?.type === "argument_list") {
        return { ...base, name: this.text(id), args: value.namedChildren.map((a) => this.mapExpr(a)), hasParens: true };
      }
      return null;
    }
    if (d.type === "function_declarator") {
      // `DHT dht(DHTPIN, DHTTYPE);` parses as a prototype with type-only parameters.
      const id = d.childForFieldName("declarator");
      const params = d.childForFieldName("parameters");
      if (id?.type !== "identifier" || !params || d.namedChildren.length !== 2) return null;
      const ps = params.namedChildren;
      if (ps.length === 0) return null; // `Foo f();` declares a function
      const args: Expr[] = [];
      for (const p of ps) {
        if (p.type !== "parameter_declaration" || p.namedChildren.length !== 1) return null;
        const t = p.childForFieldName("type");
        if (t?.type !== "type_identifier") return null;
        const nm = this.text(t);
        // Only an object if the class is a known library or every "type" is a known macro/constant.
        if (!findLibraryClass(className) && !this.knownValues.has(nm)) return null;
        args.push({ kind: "Ident", id: freshId(), span: this.span(t), name: nm });
      }
      return { ...base, name: this.text(id), args, hasParens: true };
    }
    return null;
  }

  private mapVarDecls(n: Node): VarDecl[] {
    const { type, isConst } = this.typeText(n, ALLOWED_STORAGE);
    return n.childrenForFieldName("declarator").map((d) => this.mapDeclarator(n, d, type, isConst));
  }

  private mapDeclarator(n: Node, d: Node, type: string, isConst: boolean): VarDecl {
    const v: VarDecl = { kind: "VarDecl", id: freshId(), span: this.span(n), type, isConst, name: "" };
    let target: Node | null = d;
    let value: Node | null = null;
    if (d.type === "init_declarator") {
      target = d.childForFieldName("declarator");
      value = d.childForFieldName("value");
      if (!target || !value) throw new Unsupported(d.type, "Declarator form not supported.");
      if (value.type === "argument_list") throw new Unsupported("constructor_initializer", "Constructor-style initialisation is preserved as code.");
    }
    if (target.type === "identifier") v.name = this.text(target);
    else if (target.type === "array_declarator") {
      const inner = target.childForFieldName("declarator");
      if (inner?.type !== "identifier") throw new Unsupported("multidimensional_array", "Multi-dimensional arrays are preserved as code.");
      v.name = this.text(inner);
      const size = target.childForFieldName("size");
      if (size && this.hasUnconsumedComment(size.startIndex, size.endIndex)) throw new Unsupported("array_declarator", "Comment inside array size.");
      v.arraySize = size ? this.text(size) : "";
    } else if (target.type === "pointer_declarator" || target.type === "reference_declarator") {
      throw new Unsupported(target.type, "Pointer and reference declarations are preserved as code.");
    } else throw new Unsupported(target.type, explain(target.type, "Declarator form not supported."));
    if (value) {
      if (value.type === "initializer_list") {
        if (v.arraySize === undefined) throw new Unsupported("initializer_list", "Brace initialisation of a scalar is preserved as code.");
        v.arrayInit = value.namedChildren.filter((c) => c.type !== "comment").map((c) => this.mapExpr(c));
      } else v.init = this.mapExpr(value);
    }
    return v;
  }

  private mapFunction(n: Node): TopLevel {
    const typeNode = n.childForFieldName("type");
    const decl = n.childForFieldName("declarator");
    const body = n.childForFieldName("body");
    if (!typeNode || !decl || !body) throw new Unsupported(n.type, "Function form not supported.");
    if (decl.type !== "function_declarator") throw new Unsupported(decl.type === "pointer_declarator" ? "pointer_return" : decl.type, "Functions returning pointers/references are preserved as code.");
    const nameNode = decl.childForFieldName("declarator");
    if (nameNode?.type !== "identifier") throw new Unsupported(nameNode?.type ?? "function_definition", "Methods and qualified functions (Foo::bar) are preserved as code.");
    const params = decl.childForFieldName("parameters");
    if (!params || decl.namedChildren.length !== 2) throw new Unsupported("function_declarator", "Function qualifiers (const, noexcept, trailing return) are preserved as code.");
    const { type } = this.typeText(n, FN_STORAGE);
    const ps: Param[] = [];
    const pn = params.namedChildren;
    if (pn.some((c) => c.type === "comment")) throw new Unsupported("parameter_list", "Comment inside the parameter list.");
    const isVoidOnly = pn.length === 1 && pn[0]!.type === "parameter_declaration" && this.text(pn[0]!) === "void";
    if (!isVoidOnly) {
      for (const p of pn) {
        if (p.type !== "parameter_declaration") throw new Unsupported(p.type, p.type === "optional_parameter_declaration" ? "Default parameter values are preserved as code." : "Parameter form not supported.");
        const t = this.typeText(p, new Set());
        const d = p.childForFieldName("declarator");
        if (!d) throw new Unsupported("parameter_declaration", "Unnamed parameters are preserved as code.");
        if (d.type === "identifier") ps.push({ type: t.type, name: this.text(d) });
        else if ((d.type === "pointer_declarator" || d.type === "reference_declarator") && d.namedChildren.length === 1 && d.namedChildren[0]!.type === "identifier") {
          ps.push({ type: t.type + (d.type === "pointer_declarator" ? "*" : "&"), name: this.text(d.namedChildren[0]!) });
        } else throw new Unsupported(d.type, "Parameter declarator not supported (arrays, function pointers...).");
      }
    }
    return { kind: "Function", id: freshId(), span: this.span(n), returnType: type, name: this.text(nameNode), params: ps, body: this.mapBlock(body) };
  }

  /* -------------------------------- statements ------------------------------ */

  private mapBlock(n: Node): Stmt[] {
    if (n.type === "compound_statement") {
      const kids = n.children;
      const inner = kids.slice(1, kids[kids.length - 1]?.type === "}" ? -1 : undefined);
      return this.mapSequence<Stmt>(inner, (c) => this.mapStmtGuarded(c), (s, e, c, r) => this.makeRawStmt(s, e, c, r));
    }
    const out = this.mapStmtGuarded(n);
    for (const it of out) delete (it as WithStart)._start;
    return out;
  }

  private mapStmtGuarded(n: Node): Stmt[] {
    try {
      this.checkForcedRaw(n);
      const items = this.mapStmt(n);
      if (this.hasUnconsumedComment(n.startIndex, n.endIndex)) throw new Unsupported(n.type, "A comment sits inside this statement at a position blocks cannot represent; the code is kept exactly as written.");
      return items;
    } catch (e) {
      if (e instanceof Unsupported) return [this.makeRawStmt(n.startIndex, n.endIndex, e.construct, e.reason)];
      throw e;
    }
  }

  private cond(clause: Node | null): Expr {
    if (!clause) throw new Unsupported("condition", "Missing condition.");
    if (clause.type === "condition_clause") {
      const named = clause.namedChildren.filter((c) => c.type !== "comment");
      const v = clause.childForFieldName("value");
      if (!v || named.length !== 1 || v.type === "declaration" || v.type === "init_statement") throw new Unsupported("condition_clause", "Conditions with declarations or init-statements are preserved as code.");
      return this.mapExpr(v);
    }
    if (clause.type === "parenthesized_expression") {
      const inner = clause.namedChildren.filter((c) => c.type !== "comment");
      if (inner.length !== 1) throw new Unsupported("condition", "Condition form not supported.");
      return this.mapExpr(inner[0]!);
    }
    throw new Unsupported(clause.type, "Condition form not supported.");
  }

  private mapStmt(n: Node): Stmt[] {
    const base = () => ({ id: freshId(), span: this.span(n) });
    switch (n.type) {
      case "declaration": {
        const t = n.childForFieldName("type");
        const ds = n.childrenForFieldName("declarator");
        if (t?.type === "type_identifier" && !VALUE_TYPES.has(this.text(t)) && ds.some((d) => d.type === "function_declarator" || (d.type === "init_declarator" && d.childForFieldName("value")?.type === "argument_list")))
          throw new Unsupported("local_object", "Local object construction is preserved as code.");
        if (ds.some((d) => d.type === "function_declarator")) throw new Unsupported("function_prototype", "Local function declarations are preserved as code.");
        return this.mapVarDecls(n);
      }
      case "expression_statement": {
        const named = n.namedChildren.filter((c) => c.type !== "comment");
        if (named.length === 0) throw new Unsupported("empty_statement", "Empty statement (;) is preserved as code.");
        if (named.length !== 1) throw new Unsupported(n.type, "Statement form not supported.");
        const e = named[0]!;
        if (e.type === "assignment_expression") return [this.mapAssign(e, base())];
        const expr = this.mapExpr(e);
        if (expr.kind === "RawExpr") throw new Unsupported(this.rawInfo.get(expr)?.construct ?? e.type, expr.reason);
        return [{ kind: "ExprStmt", ...base(), expr }];
      }
      case "if_statement": {
        if (n.children.some((c) => c.type === "constexpr" || c.type === "consteval" || c.type === "!")) throw new Unsupported("if_constexpr", "if constexpr / if consteval are preserved as code.");
        const branches: IfBranch[] = [];
        let cur: Node | null = n;
        let elseBody: Stmt[] | undefined;
        while (cur) {
          branches.push({ id: freshId(), cond: this.cond(cur.childForFieldName("condition")), body: this.mapBlock(cur.childForFieldName("consequence")!) });
          const alt: Node | null = cur.childForFieldName("alternative");
          if (!alt) break;
          const altBody: Node[] = alt.namedChildren.filter((c: Node) => c.type !== "comment");
          if (alt.namedChildren.length !== altBody.length) throw new Unsupported("else_clause", "Comment between else and its body.");
          const inner: Node | undefined = altBody[0];
          if (!inner) break;
          if (inner.type === "if_statement" && !inner.children.some((c: Node) => c.type === "constexpr" || c.type === "consteval")) {
            cur = inner;
            continue;
          }
          elseBody = this.mapBlock(inner);
          break;
        }
        const s: Stmt = { kind: "If", ...base(), branches };
        if (elseBody) s.elseBody = elseBody;
        return [s];
      }
      case "while_statement":
        return [{ kind: "While", ...base(), cond: this.cond(n.childForFieldName("condition")), body: this.mapBlock(n.childForFieldName("body")!) }];
      case "do_statement":
        return [{ kind: "DoWhile", ...base(), body: this.mapBlock(n.childForFieldName("body")!), cond: this.cond(n.childForFieldName("condition")) }];
      case "for_statement": {
        const s: Stmt & { kind: "For" } = { kind: "For", ...base(), body: [] };
        const init = n.childForFieldName("initializer");
        const cond = n.childForFieldName("condition");
        const upd = n.childForFieldName("update");
        if (init) {
          if (init.type === "declaration") {
            const ds = this.mapStmt(init);
            if (ds.length !== 1) throw new Unsupported("for_statement", "for-loops declaring several variables are preserved as code.");
            s.init = ds[0];
          } else if (init.type === "assignment_expression") s.init = this.mapAssign(init, { id: freshId(), span: this.span(init) });
          else if (init.type === "comma_expression") throw new Unsupported("comma_expression", "Comma expressions are preserved as code.");
          else s.init = { kind: "ExprStmt", id: freshId(), span: this.span(init), expr: this.mapExpr(init) };
        }
        if (cond) s.cond = this.mapExpr(cond);
        if (upd) {
          if (upd.type === "assignment_expression") s.update = this.mapAssign(upd, { id: freshId(), span: this.span(upd) });
          else if (upd.type === "comma_expression") throw new Unsupported("comma_expression", "Comma expressions are preserved as code.");
          else s.update = this.mapExpr(upd);
        }
        s.body = this.mapBlock(n.childForFieldName("body")!);
        return [s];
      }
      case "switch_statement": {
        const subject = this.cond(n.childForFieldName("condition"));
        const body = n.childForFieldName("body");
        if (!body) throw new Unsupported(n.type, "switch without body.");
        const cases: SwitchCase[] = [];
        for (const c of body.namedChildren) {
          if (c.type === "comment") throw new Unsupported("switch_statement", "Comments between switch cases are preserved as code.");
          if (c.type !== "case_statement") throw new Unsupported("switch_statement", "Statements outside case labels are preserved as code.");
          const valueNode = c.childForFieldName("value");
          const colon = c.children.findIndex((k) => k.type === ":");
          const stmts = c.children.slice(colon + 1);
          const sc: SwitchCase = { id: freshId(), body: this.mapSequence<Stmt>(stmts, (k) => this.mapStmtGuarded(k), (s2, e2, k2, r2) => this.makeRawStmt(s2, e2, k2, r2)) };
          if (valueNode) sc.value = this.mapExpr(valueNode);
          cases.push(sc);
        }
        return [{ kind: "Switch", ...base(), subject, cases }];
      }
      case "break_statement":
        return [{ kind: "Break", ...base() }];
      case "continue_statement":
        return [{ kind: "Continue", ...base() }];
      case "return_statement": {
        const named = n.namedChildren.filter((c) => c.type !== "comment");
        if (named.length > 1) throw new Unsupported(n.type, "Return form not supported.");
        const s: Stmt = { kind: "Return", ...base() };
        if (named[0]) {
          if (named[0].type === "initializer_list") throw new Unsupported("initializer_list", "Brace return values are preserved as code.");
          s.value = this.mapExpr(named[0]);
        }
        return [s];
      }
      default:
        throw new Unsupported(n.type, explain(n.type));
    }
  }

  private mapAssign(e: Node, base: { id: NodeId; span: SourceSpan }): Stmt {
    const left = e.childForFieldName("left");
    const right = e.childForFieldName("right");
    const opText = this.opOf(e);
    if (!left || !right || !ASSIGN_OPS.has(opText)) throw new Unsupported("assignment_expression", "Assignment form not supported.");
    if (right.type === "assignment_expression") throw new Unsupported("chained_assignment", "Chained assignments (a = b = c) are preserved as code.");
    if (right.type === "initializer_list") throw new Unsupported("initializer_list", "Brace assignment is preserved as code.");
    if (left.type !== "identifier" && left.type !== "subscript_expression") throw new Unsupported(left.type === "field_expression" ? "member_assignment" : left.type, "Assignments to members or through pointers are preserved as code.");
    const target = this.mapExpr(left);
    if (target.kind === "RawExpr") throw new Unsupported(left.type, target.reason);
    return { kind: "Assign", ...base, op: opText as AssignOp, target, value: this.mapExpr(right) };
  }

  /* ------------------------------- expressions ------------------------------ */

  private rawExpr(n: Node, construct: string, reason: string): Expr {
    this.consumeRange(n.startIndex, n.endIndex);
    const r: Expr = { kind: "RawExpr", id: freshId(), span: this.span(n), text: this.text(n), reason };
    this.rawInfo.set(r, { construct, reason });
    return r;
  }

  private exprDepth = 0;

  /**
   * tree-sitter-cpp resolves two C++ ambiguities by guessing, without symbol tables:
   *  - `(a) + b` / `(a) - b` / `(a) * b` may be read as a C-style cast of `+b` to type `a`;
   *  - `a < b ... > (c)` may be read as a call of template `a<...>`.
   * When the guess appears anywhere inside an expression, the WHOLE root expression is
   * kept raw so no wrong operator structure is ever shown (bytes are preserved either way).
   */
  private ambiguousRoot(n: Node): string | null {
    for (const c of n.descendantsOfType(["cast_expression", "template_function", "template_argument_list"])) {
      if (c.type !== "cast_expression") return "template_ambiguity";
      // `(name)`, `(name())`, `(name*)`…: the "type" is a plain identifier, so it may just as well be a value.
      const td = c.childForFieldName("type");
      const base = td?.childForFieldName("type") ?? td?.namedChildren[0];
      if (!base || base.type === "type_identifier" || base.type === "qualified_identifier" || base.type === "template_type") return "cast_ambiguity";
    }
    return null;
  }

  mapExpr(n: Node): Expr {
    if (this.exprDepth === 0) {
      const amb = this.ambiguousRoot(n);
      if (amb)
        return this.rawExpr(n, amb, amb === "cast_ambiguity"
          ? "This expression contains `(name) op value`, which C++ can read as a cast or as arithmetic; kept as code so the structure is never guessed."
          : "This expression contains `a < ... > (...)`, which C++ can read as a template call or as comparisons; kept as code so the structure is never guessed.");
    }
    this.exprDepth++;
    try {
      return this.mapExprInner(n);
    } finally {
      this.exprDepth--;
    }
  }

  private mapExprInner(n: Node): Expr {
    if (this.hasUnconsumedComment(n.startIndex, n.endIndex)) return this.rawExpr(n, n.type, "A comment inside this expression is preserved by keeping the expression as code.");
    const id = freshId();
    const span = this.span(n);
    switch (n.type) {
      case "number_literal": {
        const raw = this.text(n);
        // tree-sitter folds a sign into the literal ("-5"); model it as Unary so blocks and codegen agree.
        if (raw.startsWith("-") || raw.startsWith("+")) {
          const litSpan = this.pos.span(n.startIndex + 1, n.endIndex);
          return { kind: "Unary", id, span, op: raw[0] as UnaryOp, operand: { kind: "NumberLit", id: freshId(), span: litSpan, raw: raw.slice(1).replace(/^\s+/, "") } };
        }
        return { kind: "NumberLit", id, span, raw };
      }
      case "true":
      case "false":
        return { kind: "BoolLit", id, span, value: n.type === "true" };
      case "string_literal":
        return { kind: "StringLit", id, span, raw: this.text(n) };
      case "char_literal":
        return { kind: "CharLit", id, span, raw: this.text(n) };
      case "identifier":
        return { kind: "Ident", id, span, name: this.text(n) };
      case "parenthesized_expression": {
        const inner = n.namedChildren;
        if (inner.length !== 1 || inner[0]!.type === "comma_expression") return this.rawExpr(n, "comma_expression", "Comma expressions are preserved as code.");
        return { kind: "Paren", id, span, inner: this.mapExpr(inner[0]!) };
      }
      case "binary_expression": {
        const opText = this.opOf(n);
        if (!BINARY_OPS.has(opText)) return this.rawExpr(n, "binary_expression", `Operator "${opText}" is preserved as code.`);
        return { kind: "Binary", id, span, op: opText as BinaryOp, left: this.mapExpr(n.childForFieldName("left")!), right: this.mapExpr(n.childForFieldName("right")!) };
      }
      case "unary_expression": {
        const opText = this.opOf(n);
        if (!UNARY_OPS.has(opText)) return this.rawExpr(n, "unary_expression", `Operator "${opText}" is preserved as code.`);
        return { kind: "Unary", id, span, op: opText as UnaryOp, operand: this.mapExpr(n.childForFieldName("argument")!) };
      }
      case "update_expression": {
        const opNode = n.children.find((c) => c.type === "++" || c.type === "--");
        const arg = n.childForFieldName("argument");
        if (!opNode || !arg) return this.rawExpr(n, n.type, "Update form not supported.");
        const prefix = n.children[0]!.startIndex === opNode.startIndex;
        if (!prefix && arg.type === "unary_expression") {
          // tree-sitter-cpp 0.23 associates `!i++` as `(!i)++`; C++ postfix binds tighter: `!(i++)`.
          // Re-associate: push the postfix update down to the innermost operand of the unary chain.
          const chain: Node[] = [];
          let cur: Node = arg;
          while (cur.type === "unary_expression") {
            chain.push(cur);
            cur = cur.childForFieldName("argument")!;
          }
          let inner: Expr = { kind: "Update", id, span: this.pos.span(cur.startIndex, n.endIndex), op: opNode.type as "++" | "--", prefix: false, target: this.mapExpr(cur) };
          for (let i = chain.length - 1; i >= 0; i--) {
            const u = chain[i]!;
            const op = this.opOf(u);
            if (!UNARY_OPS.has(op)) return this.rawExpr(n, "unary_expression", `Operator "${op}" is preserved as code.`);
            inner = { kind: "Unary", id: freshId(), span: this.pos.span(u.startIndex, n.endIndex), op: op as UnaryOp, operand: inner };
          }
          return inner;
        }
        return { kind: "Update", id, span, op: opNode.type as "++" | "--", prefix, target: this.mapExpr(arg) };
      }
      case "conditional_expression": {
        const c = n.childForFieldName("condition");
        const t = n.childForFieldName("consequence");
        const e = n.childForFieldName("alternative");
        if (!c || !t || !e) return this.rawExpr(n, n.type, "Conditional expression form not supported.");
        return { kind: "Ternary", id, span, cond: this.mapExpr(c), then: this.mapExpr(t), else: this.mapExpr(e) };
      }
      case "subscript_expression": {
        const target = n.childForFieldName("argument");
        const named = n.childForFieldName("indices")?.namedChildren ?? [];
        if (!target || named.length !== 1) return this.rawExpr(n, n.type, "Multi-index subscripts are preserved as code.");
        return { kind: "Index", id, span, target: this.mapExpr(target), index: this.mapExpr(named[0]!) };
      }
      case "call_expression": {
        const fn = n.childForFieldName("function");
        const argsNode = n.childForFieldName("arguments");
        if (!fn || !argsNode || argsNode.type !== "argument_list") return this.rawExpr(n, n.type, "Call form not supported.");
        const argNodes = argsNode.namedChildren;
        if (argNodes.some((a) => a.type === "initializer_list")) return this.rawExpr(n, "initializer_list", "Brace arguments are preserved as code.");
        if (fn.type === "identifier") {
          const callee = this.text(fn);
          if (!this.knownFunctions.has(callee)) return this.rawExpr(n, "unknown_function", `${callee}() is not a known Arduino function or a function defined in this file; kept as code.`);
          return { kind: "Call", id, span, callee, args: argNodes.map((a) => this.mapExpr(a)) };
        }
        if (fn.type === "field_expression") {
          const obj = fn.childForFieldName("argument");
          const field = fn.childForFieldName("field");
          const opText = this.opOf(fn);
          if (obj?.type === "identifier" && field?.type === "field_identifier" && opText === ".") {
            const objectName = this.text(obj);
            const method = this.text(field);
            const methods = this.knownObjects.get(objectName);
            if (!methods || !methods.has(method)) return this.rawExpr(n, "unknown_library_call", `${objectName}.${method}() belongs to a library PinFlow has no block pack for; kept as code.`);
            return { kind: "MethodCall", id, span, object: objectName, method, args: argNodes.map((a) => this.mapExpr(a)) };
          }
          return this.rawExpr(n, opText === "->" ? "pointer_member_call" : "field_expression", "This member call form is preserved as code.");
        }
        return this.rawExpr(n, fn.type === "template_function" ? "template_call" : fn.type, "This call form is preserved as code.");
      }
      default:
        return this.rawExpr(n, n.type, explain(n.type));
    }
  }
}
