/**
 * PinFlow Arduino Intermediate Representation (IR) — v1 contract.
 *
 * The IR is the canonical structural model shared by the parser (C++ -> IR),
 * the code generator (IR -> C++ + source map), the Blockly adapter
 * (IR <-> Blockly workspace) and persistence. Blockly state is a view of it.
 *
 * Invariant: any source the mapper cannot faithfully represent becomes a
 * `RawStatement` / `RawTopLevel` / `RawExpr` holding the EXACT original text.
 * Nothing is ever dropped.
 */

export type NodeId = string;

/** Half-open byte range [start, end) plus 0-based line/column of start and end. */
export interface SourceSpan {
  startByte: number;
  endByte: number;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export type Coverage =
  | "fully_visualized"
  | "partially_visualized"
  | "raw_preserved"
  | "parse_error";

interface Base {
  id: NodeId;
  /** Span in the source this node was parsed from (absent for block-created nodes). */
  span?: SourceSpan;
  /** Comment lines attached immediately before this node (text without // or /* markers kept verbatim incl. markers). */
  leadingComments?: string[];
  /** Block is disabled in the visual editor (generated commented-out? NO: v1 keeps disabled nodes as-is and only marks them). */
  disabled?: boolean;
  /** ADDITIVE (v1.1): a line or block comment that sat on the same line after this node, verbatim incl. markers. */
  trailingComment?: string;
  /** ADDITIVE (v1.1): source had at least one blank line before this node (or before its leading comments). Layout only. */
  blankLineBefore?: boolean;
}

/* ----------------------------- Expressions ----------------------------- */

export type BinaryOp =
  | "+" | "-" | "*" | "/" | "%"
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "&&" | "||"
  | "&" | "|" | "^" | "<<" | ">>";

export type UnaryOp = "!" | "-" | "+" | "~";
export type UpdateOp = "++" | "--";
export type AssignOp = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "&=" | "|=" | "^=" | "<<=" | ">>=";

export type Expr =
  | { kind: "NumberLit"; id: NodeId; span?: SourceSpan; raw: string }           // raw keeps "0x1F", "1.5f", "100UL"
  | { kind: "BoolLit"; id: NodeId; span?: SourceSpan; value: boolean }
  | { kind: "StringLit"; id: NodeId; span?: SourceSpan; raw: string }            // raw includes quotes and escapes, verbatim
  | { kind: "CharLit"; id: NodeId; span?: SourceSpan; raw: string }              // raw includes quotes
  | { kind: "Ident"; id: NodeId; span?: SourceSpan; name: string }               // variables and constants like HIGH, LED_BUILTIN, INPUT_PULLUP
  | { kind: "Binary"; id: NodeId; span?: SourceSpan; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "Unary"; id: NodeId; span?: SourceSpan; op: UnaryOp; operand: Expr }
  | { kind: "Update"; id: NodeId; span?: SourceSpan; op: UpdateOp; prefix: boolean; target: Expr }
  | { kind: "Paren"; id: NodeId; span?: SourceSpan; inner: Expr }                // explicit source parentheses are preserved
  | { kind: "Ternary"; id: NodeId; span?: SourceSpan; cond: Expr; then: Expr; else: Expr }
  | { kind: "Index"; id: NodeId; span?: SourceSpan; target: Expr; index: Expr }
  /** Free function call: pinMode(...), digitalRead(...), map(...), userFn(...). */
  | { kind: "Call"; id: NodeId; span?: SourceSpan; callee: string; args: Expr[] }
  /** Method call on an object: Serial.println(x), dht.readTemperature(). */
  | { kind: "MethodCall"; id: NodeId; span?: SourceSpan; object: string; method: string; args: Expr[] }
  | { kind: "RawExpr"; id: NodeId; span?: SourceSpan; text: string; reason: string };

/* ------------------------------ Statements ----------------------------- */

export interface VarDecl extends Base {
  kind: "VarDecl";
  /** Type text verbatim, e.g. "int", "unsigned long", "float", "const int", "bool". */
  type: string;
  isConst: boolean;
  name: string;
  /** For arrays: size expression text e.g. "4" or "" for int a[] = {...}. undefined = not an array. */
  arraySize?: string;
  init?: Expr;
  /** Array brace initializer elements. */
  arrayInit?: Expr[];
}

export interface IfBranch { cond: Expr; body: Stmt[]; id: NodeId; }

export type Stmt =
  | VarDecl
  | (Base & { kind: "ExprStmt"; expr: Expr })
  | (Base & { kind: "Assign"; op: AssignOp; target: Expr; value: Expr })
  | (Base & { kind: "If"; branches: IfBranch[]; elseBody?: Stmt[] })   // branches[0] = if, rest = else if
  | (Base & { kind: "While"; cond: Expr; body: Stmt[] })
  | (Base & { kind: "DoWhile"; cond: Expr; body: Stmt[] })
  | (Base & { kind: "For"; init?: Stmt; cond?: Expr; update?: Expr | Stmt; body: Stmt[] })
  | (Base & { kind: "Switch"; subject: Expr; cases: SwitchCase[] })
  | (Base & { kind: "Break" })
  | (Base & { kind: "Continue" })
  | (Base & { kind: "Return"; value?: Expr })
  | (Base & { kind: "Comment"; text: string })                         // standalone comment, verbatim incl. markers
  | (Base & { kind: "RawStatement"; text: string; reason: string });  // exact preserved source

export interface SwitchCase { id: NodeId; /** undefined = default */ value?: Expr; body: Stmt[]; }

/* ------------------------------ Top level ------------------------------ */

export interface Param { type: string; name: string; }

export type TopLevel =
  | (Base & { kind: "Include"; path: string; system: boolean })          // #include <DHT.h> -> system=true
  | (Base & { kind: "Define"; name: string; value: string })             // simple object-like #define NAME value
  | VarDecl                                                               // globals
  /** Library object construction: DHT dht(DHTPIN, DHTTYPE); Servo s; */
  | (Base & { kind: "ObjectDecl"; className: string; name: string; args: Expr[]; hasParens: boolean })
  | (Base & { kind: "Function"; returnType: string; name: string; params: Param[]; body: Stmt[] })  // includes setup/loop
  | (Base & { kind: "Comment"; text: string })
  | (Base & { kind: "RawTopLevel"; text: string; reason: string });

export interface SketchFile {
  path: string;                 // e.g. "main.ino"
  items: TopLevel[];
  /** Line ending detected in the source; generator reproduces it. */
  eol: "\n" | "\r\n";
}

export interface CoverageEntry {
  nodeId: NodeId;
  coverage: Coverage;
  span?: SourceSpan;
  construct: string;            // e.g. "template_declaration", "lambda_expression"
  explanation: string;          // plain-language reason
}

export interface CoverageReport {
  /** 0..1 fraction of non-whitespace source bytes that map to native nodes. */
  ratio: number;
  entries: CoverageEntry[];
}

export interface ParseDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  span: SourceSpan;
}

export interface ParseResult {
  ok: boolean;                  // false => syntax errors; caller must keep last good IR
  file: SketchFile;
  coverage: CoverageReport;
  diagnostics: ParseDiagnostic[];
}

/** One entry per generated node. */
export interface SourceMapEntry {
  path: string;
  nodeId: NodeId;
  blockIds: string[];
  origin: "native" | "raw";
  startLine: number; startCol: number; endLine: number; endCol: number;  // 0-based, in generated text
}

export interface GenerateResult {
  code: string;
  sourceMap: SourceMapEntry[];
}

/* ------------------------------ Sync state ----------------------------- */

export type ChangeOrigin = "blocks" | "code" | "import" | "generator" | "undo" | "redo" | "remote";

export interface SyncState {
  revisionId: number;
  origin: ChangeOrigin;
  parseStatus: "idle" | "pending" | "ok" | "error";
  blockRevision: number;
  sourceRevision: number;
  coverageReport?: CoverageReport;
  dirtyState: "clean" | "local_unsaved" | "saving" | "saved" | "offline" | "conflict" | "save_failed";
  lastSuccessfulParseRevision: number;
  lastSuccessfulGenerationRevision: number;
}

let counter = 0;
/** Deterministic-enough ID helper; parser may supply its own stable-ID strategy. */
export function newId(prefix = "n"): NodeId {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export * from "./utils";
