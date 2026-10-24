import type { SketchFile } from "@pinflow/arduino-ir";

/** One logical revision: source text and structural IR always travel together. */
export interface Snapshot {
  source: string;
  file: SketchFile;
}

interface Entry {
  snap: Snapshot;
  key?: string;
  at: number;
}

/**
 * Unified undo/redo history of logical snapshots (spec 3.5: one stack for code + blocks,
 * never two drifting stacks). Consecutive pushes with the same coalesce key within
 * `coalesceMs` replace the top entry (e.g. one drag = one undo step).
 */
export class UnifiedHistory {
  private entries: Entry[] = [];
  private index = -1;

  constructor(initial: Snapshot, private readonly limit = 200, private readonly coalesceMs = 1000) {
    this.entries.push({ snap: initial, at: -Infinity });
    this.index = 0;
  }

  get current(): Snapshot {
    return this.entries[this.index]!.snap;
  }

  push(snap: Snapshot, opts: { key?: string; now?: number } = {}): void {
    const now = opts.now ?? 0;
    const top = this.entries[this.index]!;
    // drop redo branch
    this.entries.length = this.index + 1;
    if (opts.key !== undefined && top.key === opts.key && now - top.at <= this.coalesceMs && this.index > 0) {
      this.entries[this.index] = { snap, key: opts.key, at: now };
      return;
    }
    if (top.snap.source === snap.source && this.index > 0 && opts.key === undefined) {
      // same text: refresh the IR (e.g. ids) without a new undo step
      this.entries[this.index] = { ...top, snap };
      return;
    }
    this.entries.push({ snap, key: opts.key, at: now });
    this.index++;
    if (this.entries.length > this.limit) {
      this.entries.shift();
      this.index--;
    }
  }

  canUndo(): boolean {
    return this.index > 0;
  }
  canRedo(): boolean {
    return this.index < this.entries.length - 1;
  }
  undo(): Snapshot | null {
    if (!this.canUndo()) return null;
    this.index--;
    this.entries[this.index]!.key = undefined; // never coalesce into a restored entry
    return this.current;
  }
  redo(): Snapshot | null {
    if (!this.canRedo()) return null;
    this.index++;
    return this.current;
  }
  get size(): number {
    return this.entries.length;
  }
}
