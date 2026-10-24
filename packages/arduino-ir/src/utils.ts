/**
 * ADDITIVE (v1.1) generic helpers over the IR. They rely only on the shape
 * convention "every structural node is an object with a string `id`", so they
 * keep working when node kinds are added.
 */
import type { NodeId, SketchFile } from "./index";

/** Any IR object that owns an id: Expr, Stmt, TopLevel, IfBranch, SwitchCase. */
export interface IrNodeLike {
  id: NodeId;
  kind?: string;
  [key: string]: unknown;
}

/** Fields that never carry structure or meaning. */
const NON_STRUCTURAL = new Set(["id", "span"]);
/** Layout-only fields stripped by `normalizeIr` unless `keepLayout`. */
const LAYOUT_FIELDS = new Set(["blankLineBefore"]);

export function isIrNode(v: unknown): v is IrNodeLike {
  return typeof v === "object" && v !== null && !Array.isArray(v) && typeof (v as { id?: unknown }).id === "string";
}

export interface ChildSlot {
  key: string;
  /** A single child node or an ordered list of child nodes. */
  value: IrNodeLike | IrNodeLike[];
}

/** Child slots of a node, ordered by key name (deterministic regardless of object construction order). */
export function childSlots(node: IrNodeLike): ChildSlot[] {
  const out: ChildSlot[] = [];
  for (const key of Object.keys(node).sort()) {
    if (NON_STRUCTURAL.has(key)) continue;
    const v = node[key];
    if (isIrNode(v)) out.push({ key, value: v });
    else if (Array.isArray(v) && v.length > 0 && v.every(isIrNode)) out.push({ key, value: v as IrNodeLike[] });
    else if (Array.isArray(v) && v.length === 0 && (key === "body" || key === "args" || key === "branches" || key === "cases" || key === "elseBody" || key === "arrayInit" || key === "items"))
      out.push({ key, value: [] });
  }
  return out;
}

/** Depth-first pre-order walk over every node with an id. */
export function walkIr(
  root: SketchFile | IrNodeLike,
  visit: (node: IrNodeLike, parent: IrNodeLike | null, key: string) => void,
): void {
  const rec = (n: IrNodeLike, parent: IrNodeLike | null, key: string) => {
    visit(n, parent, key);
    for (const slot of childSlots(n)) {
      if (Array.isArray(slot.value)) for (const c of slot.value) rec(c, n, slot.key);
      else rec(slot.value, n, slot.key);
    }
  };
  if ("items" in root && !("id" in root)) {
    for (const it of (root as SketchFile).items) rec(it as unknown as IrNodeLike, null, "items");
  } else rec(root as IrNodeLike, null, "");
}

/** Map of every node id in a file to its node. */
export function collectNodes(file: SketchFile): Map<NodeId, IrNodeLike> {
  const m = new Map<NodeId, IrNodeLike>();
  walkIr(file, (n) => m.set(n.id, n));
  return m;
}

/**
 * Deep copy without ids and spans (and without layout fields unless keepLayout).
 * Used for structural equality ("normalized IR") in tests and diffs.
 */
export function normalizeIr<T>(value: T, opts: { keepLayout?: boolean; keepComments?: boolean } = {}): T {
  const rec = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(rec);
    if (typeof v === "object" && v !== null) {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(v)) {
        if (NON_STRUCTURAL.has(k)) continue;
        if (!opts.keepLayout && LAYOUT_FIELDS.has(k)) continue;
        if (opts.keepComments === false && (k === "leadingComments" || k === "trailingComment")) continue;
        const x = (v as Record<string, unknown>)[k];
        if (x === undefined) continue;
        o[k] = rec(x);
      }
      return o;
    }
    return v;
  };
  return rec(value) as T;
}

function fnv1a(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

/** Own (non-child, non-id) content of a node as a canonical string. */
export function shallowSignature(node: IrNodeLike): string {
  const parts: string[] = [];
  for (const key of Object.keys(node).sort()) {
    if (NON_STRUCTURAL.has(key) || LAYOUT_FIELDS.has(key)) continue;
    const v = node[key];
    if (v === undefined) continue;
    if (isIrNode(v)) parts.push(`${key}:#`);
    else if (Array.isArray(v) && v.length > 0 && v.every(isIrNode)) parts.push(`${key}:#${v.length}`);
    else parts.push(`${key}:${JSON.stringify(v)}`);
  }
  return parts.join("|");
}

/**
 * Structural hash of a node subtree, ignoring ids, spans and layout.
 * Identical structure => identical hash. Memoized per object identity.
 */
export function structuralHash(node: IrNodeLike, memo: WeakMap<object, string> = new WeakMap()): string {
  const cached = memo.get(node);
  if (cached) return cached;
  const parts: string[] = [shallowSignature(node)];
  for (const slot of childSlots(node)) {
    if (Array.isArray(slot.value)) parts.push(`${slot.key}[${slot.value.map((c) => structuralHash(c, memo)).join(",")}]`);
    else parts.push(`${slot.key}(${structuralHash(slot.value, memo)})`);
  }
  const h = fnv1a(parts.join(";"));
  memo.set(node, h);
  return h;
}

export interface SketchDiff {
  /** Ids present only in the new file. */
  added: NodeId[];
  /** Ids present only in the old file. */
  removed: NodeId[];
  /** Ids in both whose own fields or child-id lists changed (shallow change). */
  changed: NodeId[];
  /** Ids in both whose parent or slot changed (moved/reparented). */
  moved: NodeId[];
  /** True when the top-level item id order changed. */
  topLevelOrderChanged: boolean;
  /** True when nothing structural changed (layout/span-only changes ignored). */
  unchanged: boolean;
}

/** Structural diff between two IR snapshots keyed by node id. */
export function diffSketch(prev: SketchFile | null | undefined, next: SketchFile): SketchDiff {
  const info = (f: SketchFile | null | undefined) => {
    const m = new Map<NodeId, { node: IrNodeLike; parent: string; key: string }>();
    if (f) walkIr(f, (n, p, k) => m.set(n.id, { node: n, parent: p ? p.id : "", key: k }));
    return m;
  };
  const a = info(prev);
  const b = info(next);
  const added: NodeId[] = [];
  const removed: NodeId[] = [];
  const changed: NodeId[] = [];
  const moved: NodeId[] = [];
  const childIds = (n: IrNodeLike) =>
    childSlots(n)
      .map((s) => `${s.key}:${Array.isArray(s.value) ? s.value.map((c) => c.id).join(",") : s.value.id}`)
      .join("|");
  for (const [id, nb] of b) {
    const na = a.get(id);
    if (!na) {
      added.push(id);
      continue;
    }
    if (shallowSignature(na.node) !== shallowSignature(nb.node) || childIds(na.node) !== childIds(nb.node)) changed.push(id);
    if (na.parent !== nb.parent || na.key !== nb.key) moved.push(id);
  }
  for (const id of a.keys()) if (!b.has(id)) removed.push(id);
  const order = (f: SketchFile | null | undefined) => (f ? f.items.map((i) => i.id).join(",") : "");
  const topLevelOrderChanged = order(prev) !== order(next);
  return {
    added,
    removed,
    changed,
    moved,
    topLevelOrderChanged,
    unchanged: added.length === 0 && removed.length === 0 && changed.length === 0 && moved.length === 0 && !topLevelOrderChanged,
  };
}
