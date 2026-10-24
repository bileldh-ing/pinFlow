export interface Scheduler {
  schedule(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Drop the pending call. */
  cancel(): void;
  /** Run the pending call now (no-op if none). */
  flush(): void;
  readonly pending: boolean;
}

/** Trailing-edge debounce with injectable timers (deterministic tests). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number, scheduler: Scheduler = realScheduler): Debounced<A> {
  let handle: unknown = null;
  let lastArgs: A | null = null;
  const run = () => {
    handle = null;
    const a = lastArgs;
    lastArgs = null;
    if (a) fn(...a);
  };
  const d = ((...args: A) => {
    lastArgs = args;
    if (handle !== null) scheduler.cancel(handle);
    handle = scheduler.schedule(run, ms);
  }) as Debounced<A>;
  d.cancel = () => {
    if (handle !== null) scheduler.cancel(handle);
    handle = null;
    lastArgs = null;
  };
  d.flush = () => {
    if (handle !== null) {
      scheduler.cancel(handle);
      run();
    }
  };
  Object.defineProperty(d, "pending", { get: () => handle !== null });
  return d;
}

/** Manual scheduler for tests: advance(ms) fires due callbacks in order. */
export class ManualScheduler implements Scheduler {
  private t = 0;
  private seq = 0;
  private tasks = new Map<number, { at: number; fn: () => void }>();
  schedule(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.tasks.set(id, { at: this.t + ms, fn });
    return id;
  }
  cancel(handle: unknown): void {
    this.tasks.delete(handle as number);
  }
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | undefined;
      for (const e of this.tasks) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      this.tasks.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
  get size(): number {
    return this.tasks.size;
  }
}
