import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { clearDraft, getDraft, putDraft, recoveryDecision } from "@/lib/outbox";

describe("IndexedDB draft outbox", () => {
  it("stores, reads and clears drafts per project", async () => {
    const idb = new IDBFactory();
    const d = { projectId: "p1", baseRevision: 3, files: [{ path: "a.ino", content: "x" }], updatedAt: 1 };
    await putDraft(d, idb);
    expect(await getDraft("p1", idb)).toEqual(d);
    expect(await getDraft("p2", idb)).toBeUndefined();
    await clearDraft("p1", idb);
    expect(await getDraft("p1", idb)).toBeUndefined();
  });
  it("decides recovery: none / restore on same base / duplicate on older base", () => {
    const files = [{ path: "a.ino", content: "server" }];
    expect(recoveryDecision(undefined, 3, files).kind).toBe("none");
    expect(recoveryDecision({ projectId: "p", baseRevision: 3, files, updatedAt: 1 }, 3, files).kind).toBe("none");
    expect(recoveryDecision({ projectId: "p", baseRevision: 3, files: [{ path: "a.ino", content: "local" }], updatedAt: 1 }, 3, files).kind).toBe("offer_restore");
    expect(recoveryDecision({ projectId: "p", baseRevision: 2, files: [{ path: "a.ino", content: "local" }], updatedAt: 1 }, 3, files).kind).toBe("offer_duplicate");
  });
});
