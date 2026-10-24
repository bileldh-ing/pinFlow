import { describe, expect, it } from "vitest";
import { initialSaveState, needsSave, saveReducer, type SaveEvent, type SaveState } from "@/lib/save-state";

const run = (s: SaveState, ...events: SaveEvent[]) => events.reduce(saveReducer, s);

describe("save-state machine", () => {
  it("never reports saved before the server acknowledges", () => {
    let s = run(initialSaveState(1), { type: "EDIT" });
    expect(s.status).toBe("local_unsaved");
    s = run(s, { type: "SAVE_START" });
    expect(s.status).toBe("saving");
    expect(needsSave(s)).toBe(false);
    s = run(s, { type: "SAVE_OK", revision: 2 });
    expect(s.status).toBe("saved");
    expect(s.baseRevision).toBe(2);
  });
  it("edits during an in-flight save stay unsaved after the ack", () => {
    const s = run(initialSaveState(1), { type: "EDIT" }, { type: "SAVE_START" }, { type: "EDIT" }, { type: "SAVE_OK", revision: 2 });
    expect(s.status).toBe("local_unsaved");
    expect(needsSave(s)).toBe(true);
    expect(s.baseRevision).toBe(2);
  });
  it("conflict is sticky until reset", () => {
    let s = run(initialSaveState(3), { type: "EDIT" }, { type: "SAVE_START" }, { type: "SAVE_CONFLICT", currentRevision: 5 });
    expect(s.status).toBe("conflict");
    s = run(s, { type: "EDIT" }, { type: "SAVE_START" }, { type: "OFFLINE" }, { type: "ONLINE" });
    expect(s.status).toBe("conflict");
    expect(s.conflictRevision).toBe(5);
    s = run(s, { type: "RESET", revision: 5 });
    expect(s.status).toBe("saved");
    expect(s.baseRevision).toBe(5);
  });
  it("offline keeps edits pending and returns to unsaved when back online", () => {
    let s = run(initialSaveState(1), { type: "EDIT" }, { type: "OFFLINE" }, { type: "EDIT" });
    expect(s.status).toBe("offline");
    s = run(s, { type: "ONLINE" });
    expect(s.status).toBe("local_unsaved");
    expect(needsSave(s)).toBe(true);
  });
  it("failed saves can be retried", () => {
    const s = run(initialSaveState(1), { type: "EDIT" }, { type: "SAVE_START" }, { type: "SAVE_FAIL", error: "500" });
    expect(s.status).toBe("save_failed");
    expect(s.lastError).toBe("500");
    expect(needsSave(s)).toBe(true);
  });
});
