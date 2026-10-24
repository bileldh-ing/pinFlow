/**
 * ⚠️ TEST-ONLY fake compile runner. Never wired into src/; injected via createWorker({ runner }).
 * Simulates a compiler that either finishes after a delay or hangs until aborted.
 */
import { existsSync } from "node:fs";
import type { CompileRunner, RunInput, RunResult } from "../src/runner.js";

export interface FakeBehaviour {
  delayMs?: number;
  hang?: boolean;
  exitCode?: number;
  /** may reference {sketchDir}, substituted with the real job sketch dir */
  output?: string;
}

export class FakeRunner implements CompileRunner {
  calls: RunInput[] = [];
  /** whether the sketch dir existed when run() was called */
  sawSketchDir: boolean[] = [];
  constructor(public behaviour: FakeBehaviour = {}) {}
  run(input: RunInput): Promise<RunResult> {
    this.calls.push(input);
    this.sawSketchDir.push(existsSync(input.sketchDir));
    const b = this.behaviour;
    const started = Date.now();
    return new Promise((resolve) => {
      const done = (aborted: boolean) => {
        const output = (b.output ?? "").split("{sketchDir}").join(input.sketchDir);
        resolve({
          exitCode: aborted ? null : (b.exitCode ?? 0),
          signal: aborted ? "SIGTERM" : null,
          output,
          outputBytes: Buffer.byteLength(output),
          truncated: false,
          durationMs: Date.now() - started,
          aborted,
        });
      };
      const t = b.hang ? undefined : setTimeout(() => done(false), b.delayMs ?? 5);
      input.signal.addEventListener(
        "abort",
        () => {
          if (t) clearTimeout(t);
          done(true);
        },
        { once: true },
      );
    });
  }
}
