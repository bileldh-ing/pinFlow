/**
 * IndexedDB draft outbox: every local change is written here (debounced) so a
 * crash, reload or offline period never loses work. Cleared once the server
 * acknowledges the exact content.
 */
export interface Draft {
  projectId: string;
  baseRevision: number;
  files: Array<{ path: string; content: string }>;
  workspace?: unknown;
  updatedAt: number;
}

const DB_NAME = "pinflow";
const STORE = "drafts";

function open(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "projectId" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(idb: IDBFactory, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open(idb).then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  }));
}

function factory(): IDBFactory | null {
  return typeof indexedDB === "undefined" ? null : indexedDB;
}

export async function putDraft(d: Draft, idb: IDBFactory | null = factory()): Promise<void> {
  if (!idb) return;
  await tx(idb, "readwrite", (s) => s.put(d));
}
export async function getDraft(projectId: string, idb: IDBFactory | null = factory()): Promise<Draft | undefined> {
  if (!idb) return undefined;
  return (await tx(idb, "readonly", (s) => s.get(projectId))) as Draft | undefined;
}
export async function clearDraft(projectId: string, idb: IDBFactory | null = factory()): Promise<void> {
  if (!idb) return;
  await tx(idb, "readwrite", (s) => s.delete(projectId));
}

/** Decide what to do with a stored draft when a project loads. */
export type RecoveryDecision = { kind: "none" } | { kind: "offer_restore"; draft: Draft } | { kind: "offer_duplicate"; draft: Draft };
export function recoveryDecision(draft: Draft | undefined, serverRevision: number, serverFiles: Array<{ path: string; content: string }>): RecoveryDecision {
  if (!draft) return { kind: "none" };
  const same = JSON.stringify(draft.files) === JSON.stringify(serverFiles);
  if (same) return { kind: "none" };
  if (draft.baseRevision === serverRevision) return { kind: "offer_restore", draft };
  return { kind: "offer_duplicate", draft };
}
