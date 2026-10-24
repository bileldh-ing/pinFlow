/**
 * Blockly 13 block definitions for PinFlow. Importing this module registers
 * every block type in `Blockly.Blocks` (idempotent).
 *
 * Shape-changing ("mutator") blocks keep their structural data in
 * `pfExtra`, serialized through saveExtraState/loadExtraState. Mutations are
 * exposed through the block context menu (add/remove else-if, else, case,
 * argument, array item) and fire proper BlockChange('mutation') events so
 * undo/redo and the sync pipeline see them.
 */
import * as Blockly from "blockly";
import {
  ARITH_OPS, ASSIGN_OPS, BITWISE_OPS, BLOCK_CATEGORY, COMPARE_OPS, FRIENDLY_CALLS, KNOWN_CONSTANTS, LOGIC_OPS, UNARY_OPS,
  type FriendlyCall, friendlyText,
} from "./catalog";
import { bm } from "./i18n";
import { setWorkspaceSaver, type WorkspaceLike } from "./adapter";
import type { WorkspaceState } from "./state";

type Extra = Record<string, unknown>;
type MenuOption = Record<string, unknown>;
interface PfBlock extends Blockly.Block {
  pfExtra: Extra;
  pfUpdateShape?: () => void;
  pfSyncExtra?: () => void;
}

const STMT = ["Stmt"];
const TOP = ["TopLevel"];
const BOTHC = ["Stmt", "TopLevel"];

function style(type: string): string { return `${BLOCK_CATEGORY[type] ?? "advanced"}_blocks`; }
function opts(list: readonly string[]): [string, string][] { return list.map((o) => [o, o]); }

function preview(text: string, maxLines = 6, maxCols = 60): string[] {
  const lines = text.replace(/\t/g, "  ").split(/\r?\n/);
  const out = lines.slice(0, maxLines).map((l) => (l.length > maxCols ? `${l.slice(0, maxCols - 1)}…` : l));
  if (lines.length > maxLines) out.push(bm("blk.preview.more", { n: lines.length - maxLines }));
  return out;
}

/** Fire a mutation change event around a shape edit so undo + listeners see it. */
export function mutate(block: Blockly.Block, fn: () => void): void {
  const b = block as PfBlock;
  const oldState = JSON.stringify(b.saveExtraState?.() ?? null);
  fn();
  b.pfUpdateShape?.();
  const newState = JSON.stringify(b.saveExtraState?.() ?? null);
  if (oldState !== newState) {
    const Ev = Blockly.Events.get(Blockly.Events.BLOCK_CHANGE);
    Blockly.Events.fire(new Ev(b, "mutation", null, oldState, newState));
  }
}

const extraMixin = {
  saveExtraState(this: PfBlock): Extra | null {
    this.pfSyncExtra?.();
    return this.pfExtra && Object.keys(this.pfExtra).length ? { ...this.pfExtra } : null;
  },
  loadExtraState(this: PfBlock, state: Extra): void {
    this.pfExtra = { ...(state ?? {}) };
    this.pfUpdateShape?.();
  },
};

function define(type: string, init: (this: PfBlock) => void, more: Record<string, unknown> = {}): void {
  Blockly.Blocks[type] = {
    ...extraMixin,
    init(this: PfBlock) {
      this.pfExtra = {};
      this.setStyle(style(type));
      init.call(this);
      this.pfUpdateShape?.();
    },
    ...more,
  };
}

function hasBlock(b: Blockly.Block, input: string): boolean { return !!b.getInputTargetBlock(input); }

/* --------------------------- arg-count helpers --------------------------- */

function argShape(this: PfBlock, prefix = "ARG"): void {
  const n = Number(this.pfExtra.argCount ?? 0);
  let i = 0;
  for (; i < n; i++) {
    if (!this.getInput(`${prefix}${i}`)) {
      this.appendValueInput(`${prefix}${i}`).appendField(i === 0 ? "(" : ",");
      if (this.getInput("CLOSE")) this.moveInputBefore(`${prefix}${i}`, "CLOSE");
    }
  }
  while (this.getInput(`${prefix}${i}`)) { this.removeInput(`${prefix}${i}`); i++; }
}

function argMenu(block: PfBlock, options: MenuOption[]): void {
  options.push({ text: bm("blk.args.add"), enabled: true, callback: () => mutate(block, () => { block.pfExtra.argCount = Number(block.pfExtra.argCount ?? 0) + 1; }) });
  options.push({
    text: bm("blk.args.remove"), enabled: Number(block.pfExtra.argCount ?? 0) > 0,
    callback: () => mutate(block, () => { block.pfExtra.argCount = Math.max(0, Number(block.pfExtra.argCount ?? 0) - 1); }),
  });
}

/* ------------------------------ text blocks ------------------------------ */

function textShape(this: PfBlock, badge: string): void {
  const text = String(this.pfExtra.text ?? "");
  let i = 0;
  while (this.getInput(`L${i}`)) { this.removeInput(`L${i}`); i++; }
  preview(text).forEach((line, idx) => {
    this.appendDummyInput(`L${idx}`).appendField(new Blockly.FieldLabel(line || " ", "pf-mono"));
  });
  this.setTooltip(`${badge}${this.pfExtra.reason ? ` — ${String(this.pfExtra.reason)}` : ""}. ${bm("blk.text.tipSuffix")}`);
}

/** Replace the verbatim text of a raw/comment block (fires a mutation event). */
export function setBlockText(block: Blockly.Block, text: string): void {
  mutate(block, () => { (block as PfBlock).pfExtra.text = text; });
}

/** Read the verbatim text/reason of a raw/comment block. */
export function getBlockExtra(block: Blockly.Block): Extra {
  return { ...((block as PfBlock).pfExtra ?? {}) };
}

/* ---------------------------- block catalogue ---------------------------- */

let registered = false;

export function registerPinflowBlocks(): void {
  if (registered) return;
  registered = true;

  // Top level -------------------------------------------------------------
  define("pf_include", function () {
    this.appendDummyInput().appendField("#include")
      .appendField(new Blockly.FieldDropdown([["<…>", "SYSTEM"], ['"…"', "LOCAL"]]), "SYSTEM")
      .appendField(new Blockly.FieldTextInput("DHT.h"), "PATH");
    this.setPreviousStatement(true, TOP); this.setNextStatement(true, TOP);
    this.setTooltip(bm("blk.include.tip"));
  });
  define("pf_define", function () {
    this.appendDummyInput().appendField("#define").appendField(new Blockly.FieldTextInput("NAME"), "NAME").appendField(new Blockly.FieldTextInput("value"), "VALUE");
    this.setPreviousStatement(true, TOP); this.setNextStatement(true, TOP);
    this.setTooltip(bm("blk.define.tip"));
  });
  define("pf_dht_object", function () {
    this.appendDummyInput().appendField(bm("blk.dht.label")).appendField(new Blockly.FieldTextInput("dht"), "NAME");
    this.appendValueInput("PIN").appendField(bm("blk.dht.onPin"));
    this.appendValueInput("TYPE").appendField(bm("blk.dht.type"));
    this.setInputsInline(true);
    this.setPreviousStatement(true, TOP); this.setNextStatement(true, TOP);
    this.setTooltip(bm("blk.dht.tip"));
  });
  define("pf_object", function () {
    this.appendDummyInput("HEAD").appendField(new Blockly.FieldTextInput("Servo"), "CLASS").appendField(new Blockly.FieldTextInput("obj"), "NAME");
    this.appendDummyInput("CLOSE").appendField(new Blockly.FieldLabel(""), "CLOSE_TXT");
    this.setInputsInline(true);
    this.setPreviousStatement(true, TOP); this.setNextStatement(true, TOP);
    this.setTooltip(bm("blk.object.tip"));
    this.pfExtra = { argCount: 0, hasParens: false };
  }, {
    pfUpdateShape(this: PfBlock) {
      argShape.call(this);
      const n = Number(this.pfExtra.argCount ?? 0);
      this.getField("CLOSE_TXT")?.setValue(n > 0 ? ")" : this.pfExtra.hasParens ? "()" : "");
    },
    customContextMenu(this: PfBlock, options: MenuOption[]) { argMenu(this, options); },
  });

  const fnBody = function (this: PfBlock, label: string) {
    this.appendDummyInput().appendField(label);
    this.appendStatementInput("BODY").setCheck(STMT);
    this.setPreviousStatement(true, TOP); this.setNextStatement(true, TOP);
  };
  define("pf_setup", function () { fnBody.call(this, bm("blk.setup.label")); this.setTooltip(bm("blk.setup.tip")); });
  define("pf_loop", function () { fnBody.call(this, bm("blk.loop.label")); this.setTooltip(bm("blk.loop.tip")); });
  define("pf_function", function () {
    this.appendDummyInput().appendField(bm("blk.function.label")).appendField(new Blockly.FieldTextInput("void"), "RTYPE")
      .appendField(new Blockly.FieldTextInput("myFunction"), "NAME").appendField("(")
      .appendField(new Blockly.FieldTextInput(""), "PARAMS").appendField(")");
    this.appendStatementInput("BODY").setCheck(STMT);
    this.setPreviousStatement(true, TOP); this.setNextStatement(true, TOP);
    this.setTooltip(bm("blk.function.tip"));
  });
  define("pf_raw_top", function () {
    this.appendDummyInput("HEAD").appendField(bm("blk.raw.head"));
    this.setPreviousStatement(true, TOP); this.setNextStatement(true, TOP);
    this.pfExtra = { text: "", reason: "" };
  }, { pfUpdateShape(this: PfBlock) { textShape.call(this, bm("blk.raw.badge")); } });
  define("pf_comment", function () {
    this.appendDummyInput("HEAD").appendField(bm("blk.comment.head"));
    this.setPreviousStatement(true, BOTHC); this.setNextStatement(true, BOTHC);
    this.pfExtra = { text: "// note" };
  }, { pfUpdateShape(this: PfBlock) { textShape.call(this, bm("blk.comment.badge")); } });

  // Variables -------------------------------------------------------------
  define("pf_var_decl", function () {
    this.appendDummyInput("HEAD")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "CONST").appendField("const")
      .appendField(new Blockly.FieldTextInput("int"), "TYPE")
      .appendField(new Blockly.FieldTextInput("value"), "NAME");
    this.appendValueInput("INIT").appendField("=");
    this.setInputsInline(true);
    this.setPreviousStatement(true, BOTHC); this.setNextStatement(true, BOTHC);
    this.setTooltip(bm("blk.var.tip"));
    this.pfExtra = { isArray: false, hasInit: true, itemCount: null };
  }, {
    pfSyncExtra(this: PfBlock) { this.pfExtra.hasInit = hasBlock(this, "INIT"); },
    pfUpdateShape(this: PfBlock) {
      const isArray = !!this.pfExtra.isArray;
      const head = this.getInput("HEAD")!;
      if (isArray && !this.getField("ARRAY_SIZE")) {
        head.appendField("[", "AOPEN").appendField(new Blockly.FieldTextInput(""), "ARRAY_SIZE").appendField("]", "ACLOSE");
      } else if (!isArray && this.getField("ARRAY_SIZE")) {
        head.removeField("AOPEN"); head.removeField("ARRAY_SIZE"); head.removeField("ACLOSE");
      }
      const n = typeof this.pfExtra.itemCount === "number" ? (this.pfExtra.itemCount as number) : -1;
      let i = 0;
      for (; i < n; i++) if (!this.getInput(`ITEM${i}`)) { this.appendValueInput(`ITEM${i}`).appendField(i === 0 ? "= {" : ","); if (this.getInput("ICLOSE")) this.moveInputBefore(`ITEM${i}`, "ICLOSE"); }
      while (this.getInput(`ITEM${i}`)) { this.removeInput(`ITEM${i}`); i++; }
      if (n >= 0 && !this.getInput("ICLOSE")) this.appendDummyInput("ICLOSE").appendField("}");
      if (n < 0 && this.getInput("ICLOSE")) this.removeInput("ICLOSE");
    },
    customContextMenu(this: PfBlock, options: MenuOption[]) {
      options.push({ text: this.pfExtra.isArray ? bm("blk.var.makeScalar") : bm("blk.var.makeArray"), enabled: true, callback: () => mutate(this, () => { this.pfExtra.isArray = !this.pfExtra.isArray; if (!this.pfExtra.isArray) this.pfExtra.itemCount = null; }) });
      if (this.pfExtra.isArray) {
        options.push({ text: bm("blk.var.addItem"), enabled: true, callback: () => mutate(this, () => { this.pfExtra.itemCount = (typeof this.pfExtra.itemCount === "number" ? (this.pfExtra.itemCount as number) : 0) + 1; }) });
        options.push({ text: bm("blk.var.removeItem"), enabled: typeof this.pfExtra.itemCount === "number", callback: () => mutate(this, () => { const n = Number(this.pfExtra.itemCount); this.pfExtra.itemCount = n > 1 ? n - 1 : null; }) });
      }
    },
  });
  define("pf_assign", function () {
    this.appendValueInput("TARGET").appendField(bm("blk.assign.label"));
    this.appendValueInput("VALUE").appendField(new Blockly.FieldDropdown(opts(ASSIGN_OPS)), "OP");
    this.setInputsInline(true);
    this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT);
    this.setTooltip(bm("blk.assign.tip"));
  });
  define("pf_ident", function () {
    this.appendDummyInput().appendField(new Blockly.FieldTextInput("value"), "NAME");
    this.setOutput(true, null); this.setTooltip(bm("blk.ident.tip"));
  });
  define("pf_index", function () {
    this.appendValueInput("TARGET"); this.appendValueInput("INDEX").appendField("[");
    this.appendDummyInput().appendField("]"); this.setInputsInline(true); this.setOutput(true, null);
    this.setTooltip(bm("blk.index.tip"));
  });
  define("pf_update", function () {
    this.appendValueInput("TARGET")
      .appendField(new Blockly.FieldDropdown([[bm("blk.update.prefix"), "PRE"], [bm("blk.update.postfix"), "POST"]]), "FIX")
      .appendField(new Blockly.FieldDropdown([["++", "++"], ["--", "--"]]), "OP");
    this.setInputsInline(true); this.setOutput(true, null); this.setTooltip(bm("blk.update.tip"));
  });

  // Statements --------------------------------------------------------------
  define("pf_expr_stmt", function () {
    this.appendValueInput("EXPR").appendField(bm("blk.exprStmt.label"));
    this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT);
    this.setTooltip(bm("blk.exprStmt.tip"));
  });
  define("pf_if", function () {
    this.appendValueInput("IF0").appendField(bm("blk.if.label"));
    this.appendStatementInput("DO0").setCheck(STMT);
    this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT);
    this.setTooltip(bm("blk.if.tip"));
    this.pfExtra = { branchIds: [null], hasElse: false };
  }, {
    pfUpdateShape(this: PfBlock) {
      const ids = Array.isArray(this.pfExtra.branchIds) ? (this.pfExtra.branchIds as unknown[]) : [null];
      let i = 1;
      for (; i < ids.length; i++) {
        if (!this.getInput(`IF${i}`)) {
          this.appendValueInput(`IF${i}`).appendField(bm("blk.if.elseIf"));
          this.appendStatementInput(`DO${i}`).setCheck(STMT);
          if (this.getInput("ELSE")) { this.moveInputBefore(`IF${i}`, "ELSE"); this.moveInputBefore(`DO${i}`, "ELSE"); }
        }
      }
      while (this.getInput(`IF${i}`)) { this.removeInput(`IF${i}`); this.removeInput(`DO${i}`); i++; }
      if (this.pfExtra.hasElse && !this.getInput("ELSE")) this.appendStatementInput("ELSE").setCheck(STMT).appendField(bm("blk.if.else"));
      if (!this.pfExtra.hasElse && this.getInput("ELSE")) this.removeInput("ELSE");
    },
    customContextMenu(this: PfBlock, options: MenuOption[]) {
      const ids = () => (Array.isArray(this.pfExtra.branchIds) ? [...(this.pfExtra.branchIds as unknown[])] : [null]);
      options.push({ text: bm("blk.if.addElseIf"), enabled: true, callback: () => mutate(this, () => { this.pfExtra.branchIds = [...ids(), null]; }) });
      options.push({ text: bm("blk.if.removeElseIf"), enabled: ids().length > 1, callback: () => mutate(this, () => { this.pfExtra.branchIds = ids().slice(0, -1); }) });
      options.push({ text: this.pfExtra.hasElse ? bm("blk.if.removeElse") : bm("blk.if.addElse"), enabled: true, callback: () => mutate(this, () => { this.pfExtra.hasElse = !this.pfExtra.hasElse; }) });
    },
  });
  define("pf_while", function () {
    this.appendValueInput("COND").appendField(bm("blk.while.label"));
    this.appendStatementInput("DO").setCheck(STMT);
    this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT);
    this.setTooltip(bm("blk.while.tip"));
  });
  define("pf_do_while", function () {
    this.appendDummyInput().appendField(bm("blk.doWhile.do"));
    this.appendStatementInput("DO").setCheck(STMT);
    this.appendValueInput("COND").appendField(bm("blk.doWhile.while"));
    this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT);
    this.setTooltip(bm("blk.doWhile.tip"));
  });
  define("pf_for", function () {
    this.appendDummyInput().appendField(bm("blk.for.label"));
    this.appendStatementInput("INIT").setCheck(STMT).appendField(bm("blk.for.init"));
    this.appendValueInput("COND").appendField(bm("blk.for.while"));
    this.appendValueInput("UPDATE").appendField(bm("blk.for.step"));
    this.appendStatementInput("DO").setCheck(STMT).appendField(bm("blk.for.do"));
    this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT);
    this.setTooltip(bm("blk.for.tip"));
    this.pfExtra = { hasInit: true, hasCond: true, update: "expr" };
  }, {
    pfSyncExtra(this: PfBlock) {
      this.pfExtra.hasInit = hasBlock(this, "INIT");
      this.pfExtra.hasCond = hasBlock(this, "COND");
      if (this.pfExtra.update === "expr" && !hasBlock(this, "UPDATE")) this.pfExtra.update = "none";
      else if (this.pfExtra.update === "none" && hasBlock(this, "UPDATE")) this.pfExtra.update = "expr";
    },
    pfUpdateShape(this: PfBlock) {
      const wantStmt = this.pfExtra.update === "stmt";
      if (wantStmt && this.getInput("UPDATE")) { this.removeInput("UPDATE"); this.appendStatementInput("UPDATE_STMT").setCheck(STMT).appendField(bm("blk.for.step")); this.moveInputBefore("UPDATE_STMT", "DO"); }
      if (!wantStmt && this.getInput("UPDATE_STMT")) { this.removeInput("UPDATE_STMT"); this.appendValueInput("UPDATE").appendField(bm("blk.for.step")); this.moveInputBefore("UPDATE", "DO"); }
    },
  });
  define("pf_switch", function () {
    this.appendValueInput("SUBJECT").appendField(bm("blk.switch.label"));
    this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT);
    this.setTooltip(bm("blk.switch.tip"));
    this.pfExtra = { cases: [] };
  }, {
    pfUpdateShape(this: PfBlock) {
      const cases = Array.isArray(this.pfExtra.cases) ? (this.pfExtra.cases as Array<{ isDefault?: boolean }>) : [];
      cases.forEach((c, idx) => {
        const want = c.isDefault ? "DEF" : "CASE";
        const other = c.isDefault ? "CASE" : "DEF";
        if (this.getInput(`${other}${idx}`)) this.removeInput(`${other}${idx}`);
        if (!this.getInput(`${want}${idx}`)) {
          if (c.isDefault) this.appendDummyInput(`DEF${idx}`).appendField(bm("blk.switch.default"));
          else this.appendValueInput(`CASE${idx}`).appendField(bm("blk.switch.case"));
          if (this.getInput(`DO${idx}`)) this.moveInputBefore(`${want}${idx}`, `DO${idx}`);
        }
        if (!this.getInput(`DO${idx}`)) this.appendStatementInput(`DO${idx}`).setCheck(STMT);
      });
      let i = cases.length;
      while (this.getInput(`DO${i}`) || this.getInput(`CASE${i}`) || this.getInput(`DEF${i}`)) {
        for (const p of ["CASE", "DEF", "DO"]) if (this.getInput(`${p}${i}`)) this.removeInput(`${p}${i}`);
        i++;
      }
    },
    customContextMenu(this: PfBlock, options: MenuOption[]) {
      const cs = () => (Array.isArray(this.pfExtra.cases) ? [...(this.pfExtra.cases as unknown[])] : []);
      options.push({ text: bm("blk.switch.addCase"), enabled: true, callback: () => mutate(this, () => { this.pfExtra.cases = [...cs(), { id: null, isDefault: false }]; }) });
      options.push({ text: bm("blk.switch.addDefault"), enabled: true, callback: () => mutate(this, () => { this.pfExtra.cases = [...cs(), { id: null, isDefault: true }]; }) });
      options.push({ text: bm("blk.switch.removeCase"), enabled: cs().length > 0, callback: () => mutate(this, () => { this.pfExtra.cases = cs().slice(0, -1); }) });
    },
  });
  define("pf_break", function () { this.appendDummyInput().appendField(bm("blk.break.label")); this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT); this.setTooltip(bm("blk.break.tip")); });
  define("pf_continue", function () { this.appendDummyInput().appendField(bm("blk.continue.label")); this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT); this.setTooltip(bm("blk.continue.tip")); });
  define("pf_return", function () {
    this.appendValueInput("VALUE").appendField(bm("blk.return.label"));
    this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT);
    this.setTooltip(bm("blk.return.tip"));
    this.pfExtra = { hasValue: false };
  }, { pfSyncExtra(this: PfBlock) { this.pfExtra.hasValue = hasBlock(this, "VALUE"); } });
  define("pf_raw_stmt", function () {
    this.appendDummyInput("HEAD").appendField(bm("blk.raw.head"));
    this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT);
    this.pfExtra = { text: "", reason: "" };
  }, { pfUpdateShape(this: PfBlock) { textShape.call(this, bm("blk.raw.badge")); } });

  // Expressions -------------------------------------------------------------
  define("pf_number", function () { this.appendDummyInput().appendField(new Blockly.FieldTextInput("0"), "NUM"); this.setOutput(true, null); this.setTooltip(bm("blk.number.tip")); });
  define("pf_bool", function () { this.appendDummyInput().appendField(new Blockly.FieldDropdown([[bm("blk.bool.true"), "TRUE"], [bm("blk.bool.false"), "FALSE"]]), "BOOL"); this.setOutput(true, null); this.setTooltip(bm("blk.bool.tip")); });
  define("pf_string", function () {
    this.appendDummyInput().appendField("“").appendField(new Blockly.FieldTextInput("Hello"), "TEXT").appendField("”");
    this.setOutput(true, null); this.setTooltip(bm("blk.string.tip"));
  });
  define("pf_char", function () { this.appendDummyInput().appendField("‘").appendField(new Blockly.FieldTextInput("a"), "TEXT").appendField("’"); this.setOutput(true, null); this.setTooltip(bm("blk.char.tip")); });
  define("pf_constant", function () { this.appendDummyInput().appendField(new Blockly.FieldDropdown(opts(KNOWN_CONSTANTS)), "NAME"); this.setOutput(true, null); this.setTooltip(bm("blk.constant.tip")); });
  const binary = (type: string, ops: readonly string[], tip: () => string) => define(type, function () {
    this.appendValueInput("A"); this.appendValueInput("B").appendField(new Blockly.FieldDropdown(opts(ops)), "OP");
    this.setInputsInline(true); this.setOutput(true, null); this.setTooltip(tip());
  });
  binary("pf_arith", ARITH_OPS, () => bm("blk.arith.tip"));
  binary("pf_compare", COMPARE_OPS, () => bm("blk.compare.tip"));
  binary("pf_logic", LOGIC_OPS, () => bm("blk.logic.tip"));
  binary("pf_bitwise", BITWISE_OPS, () => bm("blk.bitwise.tip"));
  define("pf_not", function () { this.appendValueInput("A").appendField(bm("blk.not.label")); this.setOutput(true, null); this.setTooltip(bm("blk.not.tip")); });
  define("pf_unary", function () { this.appendValueInput("A").appendField(new Blockly.FieldDropdown(opts(UNARY_OPS)), "OP"); this.setOutput(true, null); this.setTooltip(bm("blk.unary.tip")); });
  define("pf_paren", function () { this.appendValueInput("INNER").appendField("("); this.appendDummyInput().appendField(")"); this.setInputsInline(true); this.setOutput(true, null); this.setTooltip(bm("blk.paren.tip")); });
  define("pf_ternary", function () {
    this.appendValueInput("COND"); this.appendValueInput("THEN").appendField("?"); this.appendValueInput("ELSE").appendField(":");
    this.setInputsInline(true); this.setOutput(true, null); this.setTooltip(bm("blk.ternary.tip"));
  });
  const callLike = (type: string, head: (this: PfBlock) => void, tip: () => string) => define(type, function () {
    head.call(this);
    this.appendDummyInput("CLOSE").appendField(new Blockly.FieldLabel("( )"), "CLOSE_TXT");
    this.setInputsInline(true); this.setOutput(true, null);
    this.setTooltip(tip());
    this.pfExtra = { argCount: 0 };
  }, {
    pfUpdateShape(this: PfBlock) { argShape.call(this); this.getField("CLOSE_TXT")?.setValue(Number(this.pfExtra.argCount) > 0 ? ")" : "( )"); },
    customContextMenu(this: PfBlock, options: MenuOption[]) { argMenu(this, options); },
  });
  callLike("pf_call", function () { this.appendDummyInput("HEAD").appendField(bm("blk.call.label")).appendField(new Blockly.FieldTextInput("myFunction"), "NAME"); },
    () => bm("blk.call.tip"));
  callLike("pf_method_call", function () { this.appendDummyInput("HEAD").appendField(new Blockly.FieldTextInput("obj"), "OBJ").appendField(".").appendField(new Blockly.FieldTextInput("method"), "METHOD"); },
    () => bm("blk.method.tip"));
  define("pf_raw_expr", function () {
    this.appendDummyInput("HEAD").appendField("⚠ C++").appendField(new Blockly.FieldLabel("", "pf-mono"), "RAWTXT");
    this.setOutput(true, null);
    this.pfExtra = { text: "", reason: "" };
  }, {
    pfUpdateShape(this: PfBlock) {
      const t = String(this.pfExtra.text ?? "");
      this.getField("RAWTXT")?.setValue(preview(t, 1, 40)[0] ?? "");
      this.setTooltip(`${bm("blk.rawExpr.tip")}${this.pfExtra.reason ? ` — ${String(this.pfExtra.reason)}` : ""}`);
    },
  });

  for (const f of FRIENDLY_CALLS) defineFriendly(f);
}

function defineFriendly(f: FriendlyCall): void {
  define(f.type, function () {
    const text = friendlyText(f);
    const parts = text.label.split(/(%[A-Z_]+)/).filter((p) => p !== "");
    let pending: Array<string | Blockly.Field> = [];
    const flush = (input: Blockly.Input) => {
      for (const p of pending) { if (typeof p === "string") input.appendField(p.trim()); else input.appendField(p, "OBJ"); }
      pending = [];
    };
    for (const p of parts) {
      if (p === "%OBJ") { pending.push(new Blockly.FieldTextInput("dht")); continue; }
      if (p.startsWith("%")) { flush(this.appendValueInput(p.slice(1))); continue; }
      if (p.trim()) pending.push(p);
    }
    if (pending.length) flush(this.appendDummyInput());
    this.setInputsInline(true);
    if (f.shape === "stmt") { this.setPreviousStatement(true, STMT); this.setNextStatement(true, STMT); }
    else this.setOutput(true, null);
    this.setTooltip(text.tooltip);
  });
}

setWorkspaceSaver((ws: WorkspaceLike) => Blockly.serialization.workspaces.save(ws as unknown as Blockly.Workspace) as WorkspaceState);
registerPinflowBlocks();

export { Blockly };
