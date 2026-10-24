/**
 * Save-state machine (spec 8.3). "saved" is only reachable through SAVE_OK,
 * i.e. after the server acknowledged a revision for the exact content sent.
 */
export type SaveStatus = "saved" | "local_unsaved" | "saving" | "offline" | "conflict" | "save_failed";

export interface SaveState {
  status: SaveStatus;
  /** Server revision our local copy is based on. */
  baseRevision: number;
  /** Local edit counter; increments on every edit. */
  localVersion: number;
  /** localVersion that is currently being saved / was last acknowledged. */
  inFlightVersion: number | null;
  ackedVersion: number;
  lastError?: string;
  conflictRevision?: number;
  lastSavedAt?: number;
}

export type SaveEvent =
  | { type: "EDIT" }
  | { type: "SAVE_START" }
  | { type: "SAVE_OK"; revision: number; at?: number }
  | { type: "SAVE_CONFLICT"; currentRevision: number }
  | { type: "SAVE_FAIL"; error: string }
  | { type: "OFFLINE" }
  | { type: "ONLINE" }
  | { type: "RESET"; revision: number };

export function initialSaveState(revision: number): SaveState {
  return { status: "saved", baseRevision: revision, localVersion: 0, inFlightVersion: null, ackedVersion: 0 };
}

export function saveReducer(s: SaveState, e: SaveEvent): SaveState {
  switch (e.type) {
    case "EDIT": {
      const localVersion = s.localVersion + 1;
      if (s.status === "conflict") return { ...s, localVersion }; // stay in conflict until resolved
      if (s.status === "offline") return { ...s, localVersion };
      if (s.status === "saving") return { ...s, localVersion }; // will be re-saved after ack
      return { ...s, localVersion, status: "local_unsaved" };
    }
    case "SAVE_START":
      if (s.status === "conflict") return s;
      return { ...s, status: "saving", inFlightVersion: s.localVersion, lastError: undefined };
    case "SAVE_OK": {
      const acked = s.inFlightVersion ?? s.ackedVersion;
      const dirty = s.localVersion > acked;
      return { ...s, baseRevision: e.revision, ackedVersion: acked, inFlightVersion: null, status: dirty ? "local_unsaved" : "saved", lastSavedAt: e.at ?? Date.now(), lastError: undefined };
    }
    case "SAVE_CONFLICT":
      return { ...s, status: "conflict", inFlightVersion: null, conflictRevision: e.currentRevision };
    case "SAVE_FAIL":
      return { ...s, status: "save_failed", inFlightVersion: null, lastError: e.error };
    case "OFFLINE":
      if (s.status === "conflict") return s;
      return { ...s, status: "offline", inFlightVersion: null };
    case "ONLINE":
      if (s.status !== "offline") return s;
      return { ...s, status: s.localVersion > s.ackedVersion ? "local_unsaved" : "saved" };
    case "RESET":
      return initialSaveState(e.revision);
  }
}

export function needsSave(s: SaveState): boolean {
  return (s.status === "local_unsaved" || s.status === "save_failed") && s.localVersion > s.ackedVersion;
}

export const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: "Saved",
  local_unsaved: "Unsaved changes",
  saving: "Saving…",
  offline: "Offline — kept locally",
  conflict: "Conflict",
  save_failed: "Save failed",
};
