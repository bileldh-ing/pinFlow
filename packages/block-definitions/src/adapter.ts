/**
 * Deterministic two-way adapter between the PinFlow IR (SketchFile) and
 * Blockly's JSON serialization. Pure — no Blockly/DOM import — so it can run
 * in tests, Web Workers and on the server.
 *
 * Invariants:
 *  - Block id == IR node id for every node that becomes a block.
 *  - IR ids that do not become blocks (inner Call of a friendly statement,
 *    if-branch ids, switch-case ids) are kept in extraState.
 *  - Raw text (RawStatement / RawTopLevel / RawExpr / Comment) is stored in
 *    extraState verbatim and never passes through a Blockly field, so it
 *    round-trips byte-for-byte.
 *  - Top-level order is the order of root stacks sorted by (y, x).
 */
import type {
  AssignOp, BinaryOp, Expr, IfBranch, NodeId, Param, SketchFile, Stmt, SwitchCase, TopLevel, UnaryOp, UpdateOp, VarDecl,
} from "@pinflow/arduino-ir";
import {
  ARITH_OPS, BITWISE_OPS, COMPARE_OPS, FRIENDLY_BY_TYPE, FRIENDLY_CALLS, KNOWN_CONSTANTS, LOGIC_OPS, type FriendlyCall,
} from "./catalog";
import { MANUALLY_DISABLED, type BlockState, type WorkspaceState } from "./state";

/* ------------------------------------------------------------------------ */
/* Shared helpers                                                            */
/* ------------------------------------------------------------------------ */

const STACK_GAP = 40;
const LINE_H = 34;

const TOP_ONLY = new Set(["pf_include", "pf_define", "pf_object", "pf_dht_object", "pf_setup", "pf_loop", "pf_function", "pf_raw_top"]);
const BOTH = new Set(["pf_var_decl", "pf_comment"]);
const STMT_ONLY = new Set([
  "pf_expr_stmt", "pf_assign", "pf_if", "pf_while", "pf_do_while", "pf_for", "pf_switch", "pf_break", "pf_continue",
  "pf_return", "pf_raw_stmt", ...FRIENDLY_CALLS.filter((f) => f.shape === "stmt").map((f) => f.type),
]);

export function isTopLevelBlockType(t: string): boolean { return TOP_ONLY.has(t) || BOTH.has(t); }
export function isStatementBlockType(t: string): boolean { return STMT_ONLY.has(t) || BOTH.has(t); }
export function isRawBlockType(t: string): boolean { return t === "pf_raw_stmt" || t === "pf_raw_top" || t === "pf_raw_expr"; }

const OP_GROUP: Record<string, string> = {};
for (const o of ARITH_OPS) OP_GROUP[o] = "pf_arith";
for (const o of COMPARE_OPS) OP_GROUP[o] = "pf_compare";
for (const o of LOGIC_OPS) OP_GROUP[o] = "pf_logic";
for (const o of BITWISE_OPS) OP_GROUP[o] = "pf_bitwise";

interface ToStateCtx {
  /** Declared library objects: name -> className (for friendly DHT blocks). */
  objects: Map<string, string>;
  used: Set<string>;
}

function uid(ctx: ToStateCtx, id: NodeId): string {
  let out = id;
  let n = 1;
  while (ctx.used.has(out)) out = `${id}~${n++}`;
  ctx.used.add(out);
  return out;
}

type BaseLike = { disabled?: boolean; leadingComments?: string[]; trailingComment?: string; blankLineBefore?: boolean };

function baseExtras(node: BaseLike): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  if (node.leadingComments !== undefined) extra.leadingComments = [...node.leadingComments];
  if (node.trailingComment !== undefined) extra.trailingComment = node.trailingComment;
  if (node.blankLineBefore !== undefined) extra.blankLineBefore = node.blankLineBefore;
  return extra;
}

function finishStmtBlock(b: BlockState, node: BaseLike, extra: Record<string, unknown>): BlockState {
  const merged = { ...baseExtras(node), ...extra };
  if (Object.keys(merged).length) b.extraState = merged;
  if (node.disabled) b.disabledReasons = [MANUALLY_DISABLED];
  return b;
}

function plainQuoted(raw: string, q: string): boolean {
  return raw.length >= 2 && raw.startsWith(q) && raw.endsWith(q);
}

/* ------------------------------------------------------------------------ */
/* IR -> Blockly state                                                       */
/* ------------------------------------------------------------------------ */

function friendlyForCall(e: Expr, shape: "stmt" | "value", ctx: ToStateCtx): FriendlyCall | undefined {
  if (e.kind === "Call") {
    return FRIENDLY_CALLS.find((f) => f.shape === shape && f.callee === e.callee && f.args.length === e.args.length);
  }
  if (e.kind === "MethodCall") {
    return FRIENDLY_CALLS.find((f) => {
      if (f.shape !== shape || f.method !== e.method || f.args.length !== e.args.length) return false;
      if (f.object) return f.object === e.object;
      if (f.objectClass) return ctx.objects.get(e.object) === f.objectClass;
      return false;
    });
  }
  return undefined;
}

function argInputs(args: Expr[], names: string[], ctx: ToStateCtx): BlockState["inputs"] {
  const inputs: NonNullable<BlockState["inputs"]> = {};
  args.forEach((a, i) => { inputs[names[i] ?? `ARG${i}`] = { block: exprToBlock(a, ctx) }; });
  return inputs;
}

function exprToBlock(e: Expr, ctx: ToStateCtx): BlockState {
  const id = uid(ctx, e.id);
  switch (e.kind) {
    case "NumberLit": return { type: "pf_number", id, fields: { NUM: e.raw } };
    case "BoolLit": return { type: "pf_bool", id, fields: { BOOL: e.value ? "TRUE" : "FALSE" } };
    case "StringLit":
      return plainQuoted(e.raw, '"')
        ? { type: "pf_string", id, fields: { TEXT: e.raw.slice(1, -1) } }
        : { type: "pf_string", id, fields: { TEXT: e.raw }, extraState: { verbatim: true } };
    case "CharLit":
      return plainQuoted(e.raw, "'")
        ? { type: "pf_char", id, fields: { TEXT: e.raw.slice(1, -1) } }
        : { type: "pf_char", id, fields: { TEXT: e.raw }, extraState: { verbatim: true } };
    case "Ident":
      return (KNOWN_CONSTANTS as readonly string[]).includes(e.name)
        ? { type: "pf_constant", id, fields: { NAME: e.name } }
        : { type: "pf_ident", id, fields: { NAME: e.name } };
    case "Binary": {
      const type = OP_GROUP[e.op] ?? "pf_arith";
      return { type, id, fields: { OP: e.op }, inputs: { A: { block: exprToBlock(e.left, ctx) }, B: { block: exprToBlock(e.right, ctx) } } };
    }
    case "Unary":
      if (e.op === "!") return { type: "pf_not", id, inputs: { A: { block: exprToBlock(e.operand, ctx) } } };
      return { type: "pf_unary", id, fields: { OP: e.op }, inputs: { A: { block: exprToBlock(e.operand, ctx) } } };
    case "Update":
      return { type: "pf_update", id, fields: { OP: e.op, FIX: e.prefix ? "PRE" : "POST" }, inputs: { TARGET: { block: exprToBlock(e.target, ctx) } } };
    case "Paren": return { type: "pf_paren", id, inputs: { INNER: { block: exprToBlock(e.inner, ctx) } } };
    case "Ternary":
      return { type: "pf_ternary", id, inputs: { COND: { block: exprToBlock(e.cond, ctx) }, THEN: { block: exprToBlock(e.then, ctx) }, ELSE: { block: exprToBlock(e.else, ctx) } } };
    case "Index":
      return { type: "pf_index", id, inputs: { TARGET: { block: exprToBlock(e.target, ctx) }, INDEX: { block: exprToBlock(e.index, ctx) } } };
    case "Call": {
      const f = friendlyForCall(e, "value", ctx);
      if (f) return { type: f.type, id, inputs: argInputs(e.args, f.args, ctx) };
      return { type: "pf_call", id, fields: { NAME: e.callee }, extraState: { argCount: e.args.length }, inputs: argInputs(e.args, [], ctx) };
    }
    case "MethodCall": {
      const f = friendlyForCall(e, "value", ctx);
      if (f) {
        const b: BlockState = { type: f.type, id, inputs: argInputs(e.args, f.args, ctx) };
        if (f.objectClass) b.fields = { OBJ: e.object };
        return b;
      }
      return { type: "pf_method_call", id, fields: { OBJ: e.object, METHOD: e.method }, extraState: { argCount: e.args.length }, inputs: argInputs(e.args, [], ctx) };
    }
    case "RawExpr": return { type: "pf_raw_expr", id, extraState: { text: e.text, reason: e.reason } };
  }
}

function chain(blocks: BlockState[]): BlockState | undefined {
  for (let i = blocks.length - 2; i >= 0; i--) blocks[i]!.next = { block: blocks[i + 1]! };
  return blocks[0];
}

function stmtsToChain(stmts: Stmt[], ctx: ToStateCtx): { block: BlockState } | undefined {
  const head = chain(stmts.map((s) => stmtToBlock(s, ctx)));
  return head ? { block: head } : undefined;
}

function varDeclToBlock(d: VarDecl, ctx: ToStateCtx): BlockState {
  const id = uid(ctx, d.id);
  const isArray = d.arraySize !== undefined;
  const fields: Record<string, unknown> = { TYPE: d.type, NAME: d.name, CONST: d.isConst ? "TRUE" : "FALSE" };
  if (isArray) fields.ARRAY_SIZE = d.arraySize;
  const inputs: NonNullable<BlockState["inputs"]> = {};
  if (d.init) inputs.INIT = { block: exprToBlock(d.init, ctx) };
  d.arrayInit?.forEach((x, i) => { inputs[`ITEM${i}`] = { block: exprToBlock(x, ctx) }; });
  const b: BlockState = { type: "pf_var_decl", id, fields };
  if (Object.keys(inputs).length) b.inputs = inputs;
  return finishStmtBlock(b, d, { isArray, hasInit: d.init !== undefined, itemCount: d.arrayInit ? d.arrayInit.length : null });
}

function stmtToBlock(s: Stmt, ctx: ToStateCtx): BlockState {
  if (s.kind === "VarDecl") return varDeclToBlock(s, ctx);
  const id = uid(ctx, s.id);
  switch (s.kind) {
    case "ExprStmt": {
      const f = friendlyForCall(s.expr, "stmt", ctx);
      if (f && (s.expr.kind === "Call" || s.expr.kind === "MethodCall")) {
        const b: BlockState = { type: f.type, id };
        const inputs = argInputs(s.expr.args, f.args, ctx);
        if (inputs && Object.keys(inputs).length) b.inputs = inputs;
        if (f.objectClass && s.expr.kind === "MethodCall") b.fields = { OBJ: s.expr.object };
        ctx.used.add(s.expr.id);
        return finishStmtBlock(b, s, { callId: s.expr.id });
      }
      return finishStmtBlock({ type: "pf_expr_stmt", id, inputs: { EXPR: { block: exprToBlock(s.expr, ctx) } } }, s, {});
    }
    case "Assign":
      return finishStmtBlock({ type: "pf_assign", id, fields: { OP: s.op }, inputs: { TARGET: { block: exprToBlock(s.target, ctx) }, VALUE: { block: exprToBlock(s.value, ctx) } } }, s, {});
    case "If": {
      const inputs: NonNullable<BlockState["inputs"]> = {};
      s.branches.forEach((br, i) => {
        inputs[`IF${i}`] = { block: exprToBlock(br.cond, ctx) };
        const body = stmtsToChain(br.body, ctx);
        if (body) inputs[`DO${i}`] = body;
      });
      if (s.elseBody) { const e = stmtsToChain(s.elseBody, ctx); if (e) inputs.ELSE = e; }
      return finishStmtBlock({ type: "pf_if", id, inputs }, s, { branchIds: s.branches.map((b) => b.id), hasElse: s.elseBody !== undefined });
    }
    case "While": case "DoWhile": {
      const inputs: NonNullable<BlockState["inputs"]> = { COND: { block: exprToBlock(s.cond, ctx) } };
      const body = stmtsToChain(s.body, ctx);
      if (body) inputs.DO = body;
      return finishStmtBlock({ type: s.kind === "While" ? "pf_while" : "pf_do_while", id, inputs }, s, {});
    }
    case "For": {
      const inputs: NonNullable<BlockState["inputs"]> = {};
      if (s.init) inputs.INIT = { block: stmtToBlock(s.init, ctx) };
      if (s.cond) inputs.COND = { block: exprToBlock(s.cond, ctx) };
      let update: "none" | "expr" | "stmt" = "none";
      if (s.update) {
        if (isStmt(s.update)) { update = "stmt"; inputs.UPDATE_STMT = { block: stmtToBlock(s.update, ctx) }; }
        else { update = "expr"; inputs.UPDATE = { block: exprToBlock(s.update, ctx) }; }
      }
      const body = stmtsToChain(s.body, ctx);
      if (body) inputs.DO = body;
      return finishStmtBlock({ type: "pf_for", id, inputs }, s, { hasInit: s.init !== undefined, hasCond: s.cond !== undefined, update });
    }
    case "Switch": {
      const inputs: NonNullable<BlockState["inputs"]> = { SUBJECT: { block: exprToBlock(s.subject, ctx) } };
      s.cases.forEach((c, i) => {
        if (c.value) inputs[`CASE${i}`] = { block: exprToBlock(c.value, ctx) };
        const body = stmtsToChain(c.body, ctx);
        if (body) inputs[`DO${i}`] = body;
      });
      return finishStmtBlock({ type: "pf_switch", id, inputs }, s, { cases: s.cases.map((c) => ({ id: c.id, isDefault: c.value === undefined })) });
    }
    case "Break": return finishStmtBlock({ type: "pf_break", id }, s, {});
    case "Continue": return finishStmtBlock({ type: "pf_continue", id }, s, {});
    case "Return": {
      const b: BlockState = { type: "pf_return", id };
      if (s.value) b.inputs = { VALUE: { block: exprToBlock(s.value, ctx) } };
      return finishStmtBlock(b, s, { hasValue: s.value !== undefined });
    }
    case "Comment": return finishStmtBlock({ type: "pf_comment", id }, s, { text: s.text });
    case "RawStatement": return finishStmtBlock({ type: "pf_raw_stmt", id }, s, { text: s.text, reason: s.reason });
  }
}

const STMT_KINDS = new Set(["VarDecl", "ExprStmt", "Assign", "If", "While", "DoWhile", "For", "Switch", "Break", "Continue", "Return", "Comment", "RawStatement"]);
function isStmt(x: Expr | Stmt): x is Stmt { return STMT_KINDS.has(x.kind); }

export function formatParams(params: Param[]): string {
  return params.map((p) => `${p.type} ${p.name}`.trim()).join(", ");
}

/** Parse a "type name, type name" parameter label (narrow textual label, not C++ parsing). */
export function parseParams(text: string): Param[] {
  const t = text.trim();
  if (!t || t === "void") return [];
  return t.split(",").map((part) => {
    const p = part.trim();
    const m = /^(.*?)([A-Za-z_]\w*(?:\s*\[\s*\w*\s*\])?)$/.exec(p);
    if (!m || !m[1]!.trim()) return { type: p, name: "" };
    return { type: m[1]!.trim(), name: m[2]!.trim() };
  });
}

function topToBlock(t: TopLevel, ctx: ToStateCtx): BlockState {
  if (t.kind === "VarDecl") return varDeclToBlock(t, ctx);
  const id = uid(ctx, t.id);
  switch (t.kind) {
    case "Include": return finishStmtBlock({ type: "pf_include", id, fields: { PATH: t.path, SYSTEM: t.system ? "SYSTEM" : "LOCAL" } }, t, {});
    case "Define": return finishStmtBlock({ type: "pf_define", id, fields: { NAME: t.name, VALUE: t.value } }, t, {});
    case "ObjectDecl":
      if (t.className === "DHT" && t.args.length === 2 && t.hasParens) {
        return finishStmtBlock({ type: "pf_dht_object", id, fields: { NAME: t.name }, inputs: { PIN: { block: exprToBlock(t.args[0]!, ctx) }, TYPE: { block: exprToBlock(t.args[1]!, ctx) } } }, t, {});
      }
      {
        const b: BlockState = { type: "pf_object", id, fields: { CLASS: t.className, NAME: t.name } };
        const inputs = argInputs(t.args, [], ctx);
        if (inputs && Object.keys(inputs).length) b.inputs = inputs;
        return finishStmtBlock(b, t, { argCount: t.args.length, hasParens: t.hasParens });
      }
    case "Function": {
      const body = stmtsToChain(t.body, ctx);
      if ((t.name === "setup" || t.name === "loop") && t.returnType === "void" && t.params.length === 0) {
        const b: BlockState = { type: t.name === "setup" ? "pf_setup" : "pf_loop", id };
        if (body) b.inputs = { BODY: body };
        return finishStmtBlock(b, t, {});
      }
      const b: BlockState = { type: "pf_function", id, fields: { RTYPE: t.returnType, NAME: t.name, PARAMS: formatParams(t.params) } };
      if (body) b.inputs = { BODY: body };
      return finishStmtBlock(b, t, { params: t.params.map((p) => ({ ...p })) });
    }
    case "Comment": return finishStmtBlock({ type: "pf_comment", id }, t, { text: t.text });
    case "RawTopLevel": return finishStmtBlock({ type: "pf_raw_top", id }, t, { text: t.text, reason: t.reason });
  }
}

function estimateHeight(b: BlockState | undefined): number {
  if (!b) return 0;
  let h = LINE_H;
  if (b.extraState && typeof b.extraState.text === "string") h += Math.min(8, (b.extraState.text as string).split("\n").length) * 16;
  for (const [, inp] of Object.entries(b.inputs ?? {})) {
    if (inp.block && isStatementBlockType(inp.block.type)) h += estimateHeight(inp.block) + 16;
  }
  return h + estimateHeight(b.next?.block);
}

export interface IrToStateOptions {
  /** Keep positions of existing root stacks (by root block id). */
  positions?: Record<string, { x: number; y: number }>;
  x?: number;
  y?: number;
}

/** Convert a SketchFile into Blockly JSON serialization. Deterministic for a given input. */
export function irToWorkspaceState(file: SketchFile, opts: IrToStateOptions = {}): WorkspaceState {
  const ctx: ToStateCtx = { objects: new Map(), used: new Set() };
  for (const it of file.items) if (it.kind === "ObjectDecl") ctx.objects.set(it.name, it.className);

  // Group into stacks: every Function starts its own stack; other items join the current stack.
  const groups: TopLevel[][] = [];
  let cur: TopLevel[] = [];
  for (const it of file.items) {
    if (it.kind === "Function") { if (cur.length) groups.push(cur); cur = [it]; groups.push(cur); cur = []; continue; }
    if (groups.length && groups[groups.length - 1]![0]!.kind === "Function" && cur.length === 0) {
      groups[groups.length - 1]!.push(it); // trailing items chain under the preceding function
      continue;
    }
    cur.push(it);
  }
  if (cur.length) groups.push(cur);

  const x0 = opts.x ?? 24;
  let y = opts.y ?? 24;
  const roots: BlockState[] = [];
  for (const g of groups) {
    const head = chain(g.map((t) => topToBlock(t, ctx)))!;
    const keep = opts.positions?.[head.id];
    head.x = keep ? keep.x : x0;
    head.y = keep ? Math.max(keep.y, y) : y;
    y = head.y + estimateHeight(head) + STACK_GAP;
    roots.push(head);
  }
  return { blocks: { languageVersion: 0, blocks: roots } };
}

/* ------------------------------------------------------------------------ */
/* Blockly state -> IR                                                       */
/* ------------------------------------------------------------------------ */

export interface AdapterWarning {
  blockId: string;
  message: string;
}

export interface WorkspaceToIrResult {
  file: SketchFile;
  /** Root stacks not connected to the sketch (not part of generated code). */
  orphanBlockIds: string[];
  warnings: AdapterWarning[];
}

export interface WorkspaceToIrOptions { path?: string; eol?: "\n" | "\r\n"; }

interface FromCtx { seen: Set<string>; warnings: AdapterWarning[]; }

/** Anything that can produce a serialization (a live Blockly Workspace, via a registered saver). */
export type WorkspaceLike = { getAllBlocks: (ordered: boolean) => unknown[] };
let workspaceSaver: ((ws: WorkspaceLike) => WorkspaceState) | undefined;
/** Registered by the Blockly entry point so `workspaceToIr(workspace)` works without importing Blockly here. */
export function setWorkspaceSaver(fn: (ws: WorkspaceLike) => WorkspaceState): void { workspaceSaver = fn; }

function claim(ctx: FromCtx, preferred: unknown, fallback: string): string {
  let id = typeof preferred === "string" && preferred ? preferred : fallback;
  if (ctx.seen.has(id)) id = fallback;
  let n = 1;
  const base = id;
  while (ctx.seen.has(id)) id = `${base}~${n++}`;
  ctx.seen.add(id);
  return id;
}

function fieldStr(b: BlockState, name: string, dflt = ""): string {
  const v = b.fields?.[name];
  return v === undefined || v === null ? dflt : String(v);
}
function fieldBool(b: BlockState, name: string): boolean {
  const v = b.fields?.[name];
  return v === true || v === "TRUE" || v === "true";
}
function extra(b: BlockState): Record<string, unknown> { return b.extraState ?? {}; }
function inputBlock(b: BlockState, name: string): BlockState | undefined { return b.inputs?.[name]?.block ?? b.inputs?.[name]?.shadow; }

function emptyExpr(ctx: FromCtx, owner: BlockState, input: string): Expr {
  ctx.warnings.push({ blockId: owner.id, message: `Empty socket "${input}" generates a placeholder that will not compile.` });
  return { kind: "RawExpr", id: claim(ctx, undefined, `${owner.id}.${input}.empty`), text: "/* empty */", reason: "empty socket" };
}

function exprIn(ctx: FromCtx, b: BlockState, input: string): Expr {
  const c = inputBlock(b, input);
  return c ? blockToExpr(c, ctx) : emptyExpr(ctx, b, input);
}

function argsFrom(ctx: FromCtx, b: BlockState, names: string[]): Expr[] {
  return names.map((n) => exprIn(ctx, b, n));
}

function genericArgNames(b: BlockState): string[] {
  const n = Number(extra(b).argCount ?? 0);
  return Array.from({ length: Number.isFinite(n) ? n : 0 }, (_, i) => `ARG${i}`);
}

function requote(text: string, q: string): string {
  // Escape any unescaped quote char so a user-typed quote cannot break the literal.
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\\") { out += ch + (text[i + 1] ?? ""); i++; continue; }
    out += ch === q ? `\\${q}` : ch;
  }
  return q + out + q;
}

function blockToExpr(b: BlockState, ctx: FromCtx): Expr {
  const id = claim(ctx, b.id, `${b.type}_${ctx.seen.size}`);
  const f = FRIENDLY_BY_TYPE.get(b.type);
  if (f && f.shape === "value") {
    const args = argsFrom(ctx, b, f.args);
    if (f.callee) return { kind: "Call", id, callee: f.callee, args };
    return { kind: "MethodCall", id, object: f.object ?? fieldStr(b, "OBJ", "dht"), method: f.method!, args };
  }
  switch (b.type) {
    case "pf_number": return { kind: "NumberLit", id, raw: fieldStr(b, "NUM", "0") };
    case "pf_bool": return { kind: "BoolLit", id, value: fieldStr(b, "BOOL") === "TRUE" };
    case "pf_string": return { kind: "StringLit", id, raw: extra(b).verbatim ? fieldStr(b, "TEXT") : requote(fieldStr(b, "TEXT"), '"') };
    case "pf_char": return { kind: "CharLit", id, raw: extra(b).verbatim ? fieldStr(b, "TEXT") : requote(fieldStr(b, "TEXT"), "'") };
    case "pf_ident": case "pf_constant": return { kind: "Ident", id, name: fieldStr(b, "NAME", "x") };
    case "pf_arith": case "pf_compare": case "pf_logic": case "pf_bitwise":
      return { kind: "Binary", id, op: fieldStr(b, "OP", "+") as BinaryOp, left: exprIn(ctx, b, "A"), right: exprIn(ctx, b, "B") };
    case "pf_not": return { kind: "Unary", id, op: "!", operand: exprIn(ctx, b, "A") };
    case "pf_unary": return { kind: "Unary", id, op: fieldStr(b, "OP", "-") as UnaryOp, operand: exprIn(ctx, b, "A") };
    case "pf_update": return { kind: "Update", id, op: fieldStr(b, "OP", "++") as UpdateOp, prefix: fieldStr(b, "FIX") === "PRE", target: exprIn(ctx, b, "TARGET") };
    case "pf_paren": return { kind: "Paren", id, inner: exprIn(ctx, b, "INNER") };
    case "pf_ternary": return { kind: "Ternary", id, cond: exprIn(ctx, b, "COND"), then: exprIn(ctx, b, "THEN"), else: exprIn(ctx, b, "ELSE") };
    case "pf_index": return { kind: "Index", id, target: exprIn(ctx, b, "TARGET"), index: exprIn(ctx, b, "INDEX") };
    case "pf_call": return { kind: "Call", id, callee: fieldStr(b, "NAME", "fn"), args: argsFrom(ctx, b, genericArgNames(b)) };
    case "pf_method_call":
      return { kind: "MethodCall", id, object: fieldStr(b, "OBJ", "obj"), method: fieldStr(b, "METHOD", "method"), args: argsFrom(ctx, b, genericArgNames(b)) };
    case "pf_raw_expr": return { kind: "RawExpr", id, text: String(extra(b).text ?? ""), reason: String(extra(b).reason ?? "") };
    default:
      ctx.warnings.push({ blockId: b.id, message: `Block type "${b.type}" cannot be used as a value.` });
      return { kind: "RawExpr", id, text: "/* unsupported block */", reason: `block ${b.type} used as value` };
  }
}

function applyBase<T extends BaseLike>(node: T, b: BlockState): T {
  const ex = extra(b);
  const lc = ex.leadingComments;
  if (Array.isArray(lc)) node.leadingComments = lc.map(String);
  if (typeof ex.trailingComment === "string") node.trailingComment = ex.trailingComment;
  if (typeof ex.blankLineBefore === "boolean") node.blankLineBefore = ex.blankLineBefore;
  const disabled = (b.disabledReasons ?? []).includes(MANUALLY_DISABLED) || b.enabled === false;
  if (disabled) node.disabled = true;
  return node;
}

function chainToStmts(head: BlockState | undefined, ctx: FromCtx): Stmt[] {
  const out: Stmt[] = [];
  for (let b = head; b; b = b.next?.block) {
    const s = blockToStmt(b, ctx);
    if (s) out.push(s);
  }
  return out;
}

function varDeclFrom(b: BlockState, ctx: FromCtx, id: string): VarDecl {
  const ex = extra(b);
  const d: VarDecl = { kind: "VarDecl", id, type: fieldStr(b, "TYPE", "int"), isConst: fieldBool(b, "CONST"), name: fieldStr(b, "NAME", "x") };
  if (ex.isArray) d.arraySize = fieldStr(b, "ARRAY_SIZE");
  const init = inputBlock(b, "INIT");
  if (init) d.init = blockToExpr(init, ctx);
  else if (ex.hasInit) d.init = emptyExpr(ctx, b, "INIT");
  if (typeof ex.itemCount === "number") {
    d.arrayInit = Array.from({ length: ex.itemCount }, (_, i) => exprIn(ctx, b, `ITEM${i}`));
  }
  return applyBase(d, b);
}

function blockToStmt(b: BlockState, ctx: FromCtx): Stmt | undefined {
  if (!isStatementBlockType(b.type)) {
    ctx.warnings.push({ blockId: b.id, message: `Block type "${b.type}" is not valid inside a function body and was skipped.` });
    return undefined;
  }
  const id = claim(ctx, b.id, `${b.type}_${ctx.seen.size}`);
  const ex = extra(b);
  const f = FRIENDLY_BY_TYPE.get(b.type);
  if (f && f.shape === "stmt") {
    const callId = claim(ctx, ex.callId, `${id}.call`);
    const args = argsFrom(ctx, b, f.args);
    const expr: Expr = f.callee
      ? { kind: "Call", id: callId, callee: f.callee, args }
      : { kind: "MethodCall", id: callId, object: f.object ?? fieldStr(b, "OBJ", "dht"), method: f.method!, args };
    return applyBase({ kind: "ExprStmt", id, expr } as Stmt, b);
  }
  switch (b.type) {
    case "pf_var_decl": return varDeclFrom(b, ctx, id);
    case "pf_expr_stmt": return applyBase({ kind: "ExprStmt", id, expr: exprIn(ctx, b, "EXPR") } as Stmt, b);
    case "pf_assign":
      return applyBase({ kind: "Assign", id, op: fieldStr(b, "OP", "=") as AssignOp, target: exprIn(ctx, b, "TARGET"), value: exprIn(ctx, b, "VALUE") } as Stmt, b);
    case "pf_if": {
      const ids = Array.isArray(ex.branchIds) ? (ex.branchIds as unknown[]) : [undefined];
      const branches: IfBranch[] = ids.map((bid, i) => ({
        id: claim(ctx, bid, `${id}.b${i}`),
        cond: exprIn(ctx, b, `IF${i}`),
        body: chainToStmts(inputBlock(b, `DO${i}`), ctx),
      }));
      const node: Stmt = { kind: "If", id, branches };
      if (ex.hasElse) node.elseBody = chainToStmts(inputBlock(b, "ELSE"), ctx);
      return applyBase(node, b);
    }
    case "pf_while": return applyBase({ kind: "While", id, cond: exprIn(ctx, b, "COND"), body: chainToStmts(inputBlock(b, "DO"), ctx) } as Stmt, b);
    case "pf_do_while": return applyBase({ kind: "DoWhile", id, cond: exprIn(ctx, b, "COND"), body: chainToStmts(inputBlock(b, "DO"), ctx) } as Stmt, b);
    case "pf_for": {
      const node: Extract<Stmt, { kind: "For" }> = { kind: "For", id, body: [] };
      const init = inputBlock(b, "INIT");
      if (init) {
        const s = blockToStmt(init, ctx);
        if (s) node.init = s;
        if (init.next?.block) ctx.warnings.push({ blockId: b.id, message: "Only the first statement in a for-loop initializer is used." });
      }
      const cond = inputBlock(b, "COND");
      if (cond) node.cond = blockToExpr(cond, ctx);
      else if (ex.hasCond) node.cond = emptyExpr(ctx, b, "COND");
      if (ex.update === "stmt") { const u = inputBlock(b, "UPDATE_STMT"); const s = u ? blockToStmt(u, ctx) : undefined; if (s) node.update = s; }
      else if (ex.update === "expr") { const u = inputBlock(b, "UPDATE"); if (u) node.update = blockToExpr(u, ctx); }
      node.body = chainToStmts(inputBlock(b, "DO"), ctx);
      return applyBase(node as Stmt, b);
    }
    case "pf_switch": {
      const cs = Array.isArray(ex.cases) ? (ex.cases as Array<{ id?: string; isDefault?: boolean }>) : [];
      const cases: SwitchCase[] = cs.map((c, i) => {
        const sc: SwitchCase = { id: claim(ctx, c.id, `${id}.c${i}`), body: [] };
        if (!c.isDefault) sc.value = exprIn(ctx, b, `CASE${i}`);
        sc.body = chainToStmts(inputBlock(b, `DO${i}`), ctx);
        return sc;
      });
      return applyBase({ kind: "Switch", id, subject: exprIn(ctx, b, "SUBJECT"), cases } as Stmt, b);
    }
    case "pf_break": return applyBase({ kind: "Break", id } as Stmt, b);
    case "pf_continue": return applyBase({ kind: "Continue", id } as Stmt, b);
    case "pf_return": {
      const node: Extract<Stmt, { kind: "Return" }> = { kind: "Return", id };
      const v = inputBlock(b, "VALUE");
      if (v) node.value = blockToExpr(v, ctx);
      else if (ex.hasValue) node.value = emptyExpr(ctx, b, "VALUE");
      return applyBase(node as Stmt, b);
    }
    case "pf_comment": return applyBase({ kind: "Comment", id, text: String(ex.text ?? "//") } as Stmt, b);
    case "pf_raw_stmt": return applyBase({ kind: "RawStatement", id, text: String(ex.text ?? ""), reason: String(ex.reason ?? "") } as Stmt, b);
  }
  return undefined;
}

function blockToTop(b: BlockState, ctx: FromCtx): TopLevel | undefined {
  if (!isTopLevelBlockType(b.type)) {
    ctx.warnings.push({ blockId: b.id, message: `Block type "${b.type}" cannot be placed at the top level and was skipped.` });
    return undefined;
  }
  const id = claim(ctx, b.id, `${b.type}_${ctx.seen.size}`);
  const ex = extra(b);
  switch (b.type) {
    case "pf_var_decl": return varDeclFrom(b, ctx, id);
    case "pf_include": return applyBase({ kind: "Include", id, path: fieldStr(b, "PATH"), system: fieldStr(b, "SYSTEM", "SYSTEM") === "SYSTEM" } as TopLevel, b);
    case "pf_define": return applyBase({ kind: "Define", id, name: fieldStr(b, "NAME"), value: fieldStr(b, "VALUE") } as TopLevel, b);
    case "pf_dht_object":
      return applyBase({ kind: "ObjectDecl", id, className: "DHT", name: fieldStr(b, "NAME", "dht"), args: [exprIn(ctx, b, "PIN"), exprIn(ctx, b, "TYPE")], hasParens: true } as TopLevel, b);
    case "pf_object":
      return applyBase({ kind: "ObjectDecl", id, className: fieldStr(b, "CLASS"), name: fieldStr(b, "NAME"), args: argsFrom(ctx, b, genericArgNames(b)), hasParens: ex.hasParens !== false } as TopLevel, b);
    case "pf_setup": case "pf_loop":
      return applyBase({ kind: "Function", id, returnType: "void", name: b.type === "pf_setup" ? "setup" : "loop", params: [], body: chainToStmts(inputBlock(b, "BODY"), ctx) } as TopLevel, b);
    case "pf_function": {
      const stored = Array.isArray(ex.params) ? (ex.params as Param[]).map((p) => ({ type: String(p.type), name: String(p.name) })) : [];
      const label = fieldStr(b, "PARAMS");
      const params = label === formatParams(stored) ? stored : parseParams(label);
      return applyBase({ kind: "Function", id, returnType: fieldStr(b, "RTYPE", "void"), name: fieldStr(b, "NAME", "myFunction"), params, body: chainToStmts(inputBlock(b, "BODY"), ctx) } as TopLevel, b);
    }
    case "pf_comment": return applyBase({ kind: "Comment", id, text: String(ex.text ?? "//") } as TopLevel, b);
    case "pf_raw_top": return applyBase({ kind: "RawTopLevel", id, text: String(ex.text ?? ""), reason: String(ex.reason ?? "") } as TopLevel, b);
  }
  return undefined;
}

function resolveState(input: WorkspaceState | WorkspaceLike): WorkspaceState {
  if (input && typeof (input as WorkspaceLike).getAllBlocks === "function") {
    if (!workspaceSaver) throw new Error("workspaceToIr(workspace) needs the Blockly entry point (@pinflow/block-definitions/blockly) to be loaded");
    return workspaceSaver(input as WorkspaceLike);
  }
  return input as WorkspaceState;
}

/** Full conversion with orphan/warning details. */
export function workspaceToIrDetailed(input: WorkspaceState | WorkspaceLike, opts: WorkspaceToIrOptions = {}): WorkspaceToIrResult {
  const state = resolveState(input);
  const roots = [...(state.blocks?.blocks ?? [])]
    .map((b, i) => ({ b, i }))
    .sort((p, q) => (p.b.y ?? 0) - (q.b.y ?? 0) || (p.b.x ?? 0) - (q.b.x ?? 0) || p.i - q.i)
    .map((p) => p.b);
  const ctx: FromCtx = { seen: new Set(), warnings: [] };
  const items: TopLevel[] = [];
  const orphanBlockIds: string[] = [];
  for (const root of roots) {
    if (!isTopLevelBlockType(root.type)) { orphanBlockIds.push(root.id); continue; }
    for (let b: BlockState | undefined = root; b; b = b.next?.block) {
      const t = blockToTop(b, ctx);
      if (t) items.push(t);
    }
  }
  return { file: { path: opts.path ?? "main.ino", items, eol: opts.eol ?? "\n" }, orphanBlockIds, warnings: ctx.warnings };
}

/** Convert Blockly serialization (or a live workspace) into a SketchFile. */
export function workspaceToIr(input: WorkspaceState | WorkspaceLike, opts: WorkspaceToIrOptions = {}): SketchFile {
  return workspaceToIrDetailed(input, opts).file;
}

/* ------------------------------------------------------------------------ */
/* Utilities used by the workbench                                           */
/* ------------------------------------------------------------------------ */

/** Root block id -> position, for preserving the user's layout across re-imports. */
export function rootPositions(state: WorkspaceState): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const b of state.blocks?.blocks ?? []) out[b.id] = { x: b.x ?? 0, y: b.y ?? 0 };
  return out;
}

/** Strip positions so two states can be compared structurally. */
export function structuralKey(state: WorkspaceState): string {
  const strip = (b: BlockState): unknown => {
    const { x: _x, y: _y, ...rest } = b;
    const o: Record<string, unknown> = { ...rest };
    if (rest.inputs) o.inputs = Object.fromEntries(Object.entries(rest.inputs).map(([k, v]) => [k, v.block ? strip(v.block) : null]));
    if (rest.next?.block) o.next = strip(rest.next.block);
    return o;
  };
  return JSON.stringify((state.blocks?.blocks ?? []).map(strip));
}
