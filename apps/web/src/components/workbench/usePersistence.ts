"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialSaveState, needsSave, saveReducer, type SaveState } from "@/lib/save-state";
import { clearDraft, getDraft, putDraft, recoveryDecision, type Draft, type RecoveryDecision } from "@/lib/outbox";
import { sourceHashBrowser } from "@/lib/hash";
import type { WorkbenchEngine } from "./engine";

export interface ProjectInfo {
  id: string;
  title: string;
  boardFqbn: string;
  revision: number;
  files: Array<{ path: string; content: string }>;
  mainPath: string;
  /** Coverage stored on the server (null until an editor measured it). */
  coverageRatio?: number | null;
}

export interface CompileState {
  status: "idle" | "saving" | "queued" | "preparing" | "compiling" | "succeeded" | "failed" | "canceled" | "timeout" | "error" | string;
  jobId?: string;
  revision?: number;
  sourceHash?: string;
  diagnostics: Array<{ file: string; line: number; column: number; severity: string; message: string }>;
  log?: string;
  error?: string | null;
  sizes?: unknown;
  toolchain?: unknown;
  startedAt?: number;
}

const TERMINAL = new Set(["succeeded", "failed", "canceled", "timeout", "error", "idle"]);

/** Autosave with optimistic concurrency + IndexedDB draft outbox + compile job tracking. */
export function usePersistence(engine: WorkbenchEngine | null, project: ProjectInfo | null) {
  const [save, dispatch] = useReducer(saveReducer, initialSaveState(project?.revision ?? 1));
  const saveRef = useRef<SaveState>(save);
  saveRef.current = save;
  const [recovery, setRecovery] = useState<RecoveryDecision>({ kind: "none" });
  const [compile, setCompile] = useState<CompileState>({ status: "idle", diagnostics: [] });
  const [currentHash, setCurrentHash] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<number | null> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const filesNow = useCallback((): Array<{ path: string; content: string }> => {
    if (!project || !engine) return project?.files ?? [];
    return project.files.map((f) => (f.path === project.mainPath ? { path: f.path, content: engine.getSource() } : f));
  }, [engine, project]);

  const doSave = useCallback(async (): Promise<number | null> => {
    if (!project || !engine) return null;
    if (inFlight.current) { await inFlight.current; if (!needsSave(saveRef.current)) return saveRef.current.baseRevision; }
    const s = saveRef.current;
    if (s.status === "conflict") return null;
    if (!needsSave(s) && s.status !== "saving") return s.baseRevision;
    if (typeof navigator !== "undefined" && !navigator.onLine) { dispatch({ type: "OFFLINE" }); return null; }
    engine.syncFromBlocks();
    const files = filesNow();
    const body = { expectedRevision: s.baseRevision, files, workspace: engine.getWorkspaceState(), ir: engine.getIr(), coverageRatio: engine.getCoverageRatio() };
    dispatch({ type: "SAVE_START" });
    const p = (async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (res.status === 409) { const j = await res.json().catch(() => ({})); dispatch({ type: "SAVE_CONFLICT", currentRevision: Number(j.currentRevision ?? 0) }); return null; }
        if (res.status === 401) { dispatch({ type: "SAVE_FAIL", error: "Your session expired — sign in again (your changes are kept locally)." }); return null; }
        if (!res.ok) { const j = await res.json().catch(() => ({})); dispatch({ type: "SAVE_FAIL", error: String(j.message ?? `HTTP ${res.status}`) }); return null; }
        const j = (await res.json()) as { revision: number };
        dispatch({ type: "SAVE_OK", revision: j.revision });
        if (JSON.stringify(filesNow()) === JSON.stringify(files)) await clearDraft(project.id).catch(() => undefined);
        return j.revision;
      } catch {
        dispatch({ type: navigator.onLine ? "SAVE_FAIL" : "OFFLINE", error: "Network error while saving." } as never);
        return null;
      }
    })();
    inFlight.current = p;
    const out = await p;
    inFlight.current = null;
    return out;
  }, [engine, project, filesNow]);

  // Re-save edits made while a save was in flight.
  useEffect(() => {
    if (save.status === "local_unsaved") { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => void doSave(), 1500); }
  }, [save.status, save.localVersion, doSave]);

  const onContentChange = useCallback(() => {
    dispatch({ type: "EDIT" });
    if (!project || !engine) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const d: Draft = { projectId: project.id, baseRevision: saveRef.current.baseRevision, files: filesNow(), workspace: engine.getWorkspaceState(), updatedAt: Date.now() };
      void putDraft(d).catch(() => undefined);
    }, 400);
    clearTimeout(hashTimer.current);
    hashTimer.current = setTimeout(() => { void sourceHashBrowser(filesNow()).then(setCurrentHash); }, 300);
  }, [engine, project, filesNow]);

  // Online/offline + unload protection.
  useEffect(() => {
    if (!project) return;
    const on = () => { dispatch({ type: "ONLINE" }); void doSave(); };
    const off = () => dispatch({ type: "OFFLINE" });
    const unload = (e: BeforeUnloadEvent) => { if (needsSave(saveRef.current) || saveRef.current.status === "saving" || saveRef.current.status === "offline") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("beforeunload", unload); };
  }, [project, doSave]);

  // Recovery check once on mount.
  useEffect(() => {
    if (!project) return;
    void sourceHashBrowser(project.files).then(setCurrentHash);
    void getDraft(project.id).then((d) => setRecovery(recoveryDecision(d, project.revision, project.files))).catch(() => undefined);
  }, [project]);

  const acceptRecovery = useCallback(async () => {
    if (recovery.kind === "none" || !engine || !project) return;
    const main = recovery.draft.files.find((f) => f.path === project.mainPath) ?? recovery.draft.files[0];
    if (main) await engine.loadSource(main.content, saveRef.current.baseRevision);
    setRecovery({ kind: "none" });
  }, [recovery, engine, project]);
  const discardRecovery = useCallback(async () => { if (project) await clearDraft(project.id).catch(() => undefined); setRecovery({ kind: "none" }); }, [project]);

  const reloadFromServer = useCallback(async () => {
    if (!project || !engine) return;
    const res = await fetch(`/api/projects/${project.id}/state`, { cache: "no-store" });
    if (!res.ok) return;
    const j = (await res.json()) as { revision: number; files: Array<{ path: string; content: string }> };
    const main = j.files.find((f) => f.path === project.mainPath) ?? j.files[0];
    dispatch({ type: "RESET", revision: j.revision });
    if (main) await engine.loadSource(main.content, j.revision);
    dispatch({ type: "RESET", revision: j.revision });
    await clearDraft(project.id).catch(() => undefined);
  }, [project, engine]);

  /* -------------------------------- compile -------------------------------- */

  const poll = useCallback((jobId: string) => {
    if (!project) return;
    clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/compile/${jobId}`, { cache: "no-store" });
        const j = await res.json();
        setCompile((c) => ({ ...c, ...j, startedAt: c.startedAt, diagnostics: Array.isArray(j.diagnostics) ? j.diagnostics : [] }));
        if (Array.isArray(j.diagnostics)) engine?.setCompileDiagnostics(j.diagnostics);
        if (!TERMINAL.has(j.status)) poll(jobId);
      } catch {
        setCompile((c) => ({ ...c, status: "error", error: "Lost connection while waiting for the compiler." }));
      }
    }, 1500);
  }, [project, engine]);

  const startCompile = useCallback(async () => {
    if (!project || !engine) return;
    setCompile({ status: "saving", diagnostics: [], startedAt: Date.now() });
    engine.setCompileDiagnostics([]);
    const rev = await doSave();
    if (rev == null) { setCompile({ status: "error", diagnostics: [], error: "Save your changes first (the project is offline, in conflict, or the save failed)." }); return; }
    try {
      const res = await fetch(`/api/projects/${project.id}/compile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: rev }) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) { setCompile({ status: "error", diagnostics: [], error: "The project changed on the server; reload before compiling." }); return; }
      if (!res.ok && !j.jobId) { setCompile({ status: "error", diagnostics: [], error: String(j.message ?? j.error ?? `HTTP ${res.status}`) }); return; }
      setCompile({ status: j.status ?? "queued", jobId: j.jobId, revision: j.revision, sourceHash: j.sourceHash, diagnostics: [], error: j.error ?? null, startedAt: Date.now() });
      if (j.jobId && !TERMINAL.has(j.status)) poll(j.jobId);
    } catch {
      setCompile({ status: "error", diagnostics: [], error: "Could not reach PinFlow to start the compile." });
    }
  }, [project, engine, doSave, poll]);

  const cancelCompile = useCallback(async () => {
    if (!project || !compile.jobId) return;
    clearTimeout(pollTimer.current);
    const res = await fetch(`/api/projects/${project.id}/compile/${compile.jobId}`, { method: "POST" }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setCompile((c) => ({ ...c, ...j, status: "canceled" }));
  }, [project, compile.jobId]);

  useEffect(() => () => { clearTimeout(saveTimer.current); clearTimeout(draftTimer.current); clearTimeout(pollTimer.current); clearTimeout(hashTimer.current); }, []);

  const outdated = !!(compile.sourceHash && currentHash && compile.sourceHash !== currentHash);
  return { save, doSave, onContentChange, recovery, acceptRecovery, discardRecovery, reloadFromServer, compile, startCompile, cancelCompile, outdated, filesNow, dispatch };
}
