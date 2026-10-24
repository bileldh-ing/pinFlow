/**
 * Stable node IDs across re-parses.
 *
 * Given the previous IR and a freshly parsed IR (with fresh ids), rewrite the
 * new ids so that structurally matching nodes keep their previous ids:
 *  1. lists are aligned: common prefix/suffix by structural hash, then exact-hash
 *     matches anywhere (moves keep ids), then same-kind + same-name (functions,
 *     variables, defines, calls...), then same kind between already-matched
 *     neighbours (an edited statement keeps its id: `delay(1000)` -> `delay(500)`);
 *  2. exact matches copy the whole subtree's ids; partial matches recurse slot by slot.
 * Each previous node is used at most once, so ids stay unique.
 */
import type { SketchFile } from "@pinflow/arduino-ir";
import { childSlots, structuralHash, type IrNodeLike } from "@pinflow/arduino-ir";

type Memo = WeakMap<object, string>;

function nameKey(n: IrNodeLike): string | undefined {
  switch (n.kind) {
    case "Function":
    case "VarDecl":
    case "ObjectDecl":
    case "Define":
      return `${n.kind}:${String(n.name)}`;
    case "Include":
      return `Include:${String(n.path)}`;
    case "MethodCall":
      return `MethodCall:${String(n.object)}.${String(n.method)}`;
    case "Call":
      return `Call:${String(n.callee)}`;
    default:
      return undefined;
  }
}

function copyIds(p: IrNodeLike, n: IrNodeLike): void {
  n.id = p.id;
  const ps = childSlots(p);
  const ns = childSlots(n);
  for (let i = 0; i < ns.length; i++) {
    const a = ps[i];
    const b = ns[i]!;
    if (!a) continue;
    if (Array.isArray(a.value) && Array.isArray(b.value)) {
      const bv = b.value;
      a.value.forEach((x, j) => {
        const y = bv[j];
        if (y) copyIds(x, y);
      });
    } else if (!Array.isArray(a.value) && !Array.isArray(b.value)) copyIds(a.value, b.value);
  }
}

function matchNode(p: IrNodeLike, n: IrNodeLike, memo: Memo): void {
  if (structuralHash(p, memo) === structuralHash(n, memo)) {
    copyIds(p, n);
    return;
  }
  n.id = p.id;
  const ps = new Map(childSlots(p).map((s) => [s.key, s.value]));
  for (const slot of childSlots(n)) {
    const pv = ps.get(slot.key);
    if (pv === undefined) continue;
    if (Array.isArray(slot.value) && Array.isArray(pv)) alignLists(pv, slot.value, memo);
    else if (!Array.isArray(slot.value) && !Array.isArray(pv) && pv.kind === slot.value.kind) matchNode(pv, slot.value, memo);
  }
}

export function alignLists(P: IrNodeLike[], N: IrNodeLike[], memo: Memo): void {
  const matchOf = new Array<number>(N.length).fill(-1); // N index -> P index
  const used = new Array<boolean>(P.length).fill(false);
  const hp = P.map((x) => structuralHash(x, memo));
  const hn = N.map((x) => structuralHash(x, memo));
  // 1. common prefix / suffix
  let pre = 0;
  while (pre < P.length && pre < N.length && hp[pre] === hn[pre]) {
    matchOf[pre] = pre;
    used[pre] = true;
    pre++;
  }
  let suf = 0;
  while (suf < P.length - pre && suf < N.length - pre && hp[P.length - 1 - suf] === hn[N.length - 1 - suf]) {
    matchOf[N.length - 1 - suf] = P.length - 1 - suf;
    used[P.length - 1 - suf] = true;
    suf++;
  }
  // 2. exact hash anywhere in the middle
  const byHash = new Map<string, number[]>();
  for (let i = pre; i < P.length - suf; i++) {
    const q = byHash.get(hp[i]!) ?? [];
    q.push(i);
    byHash.set(hp[i]!, q);
  }
  for (let j = pre; j < N.length - suf; j++) {
    const q = byHash.get(hn[j]!);
    while (q && q.length) {
      const i = q.shift()!;
      if (!used[i]) {
        used[i] = true;
        matchOf[j] = i;
        break;
      }
    }
  }
  // 3. same kind + same name
  const byName = new Map<string, number[]>();
  for (let i = 0; i < P.length; i++) {
    if (used[i]) continue;
    const k = nameKey(P[i]!);
    if (!k) continue;
    const q = byName.get(k) ?? [];
    q.push(i);
    byName.set(k, q);
  }
  for (let j = 0; j < N.length; j++) {
    if (matchOf[j]! >= 0) continue;
    const k = nameKey(N[j]!);
    const q = k ? byName.get(k) : undefined;
    while (q && q.length) {
      const i = q.shift()!;
      if (!used[i]) {
        used[i] = true;
        matchOf[j] = i;
        break;
      }
    }
  }
  // 4. same kind, positioned between matched neighbours
  for (let j = 0; j < N.length; j++) {
    if (matchOf[j]! >= 0) continue;
    let lo = -1;
    for (let k = j - 1; k >= 0; k--)
      if (matchOf[k]! >= 0) {
        lo = matchOf[k]!;
        break;
      }
    let hi = P.length;
    for (let k = j + 1; k < N.length; k++)
      if (matchOf[k]! >= 0) {
        hi = matchOf[k]!;
        break;
      }
    if (hi < lo) hi = P.length; // crossing moves: search the rest
    for (let i = lo + 1; i < hi; i++) {
      if (!used[i] && P[i]!.kind === N[j]!.kind) {
        used[i] = true;
        matchOf[j] = i;
        break;
      }
    }
  }
  for (let j = 0; j < N.length; j++) {
    const i = matchOf[j]!;
    if (i >= 0) matchNode(P[i]!, N[j]!, memo);
  }
}

/** Mutates `next` in place, reusing ids from `prev`. */
export function assignStableIds(next: SketchFile, prev: SketchFile | undefined): void {
  if (!prev) return;
  alignLists(prev.items as unknown as IrNodeLike[], next.items as unknown as IrNodeLike[], new WeakMap());
}
