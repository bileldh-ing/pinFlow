/**
 * @pinflow/sync-engine — framework-agnostic synchronization core (spec 3.5).
 */
import type { GenerateResult, ParseResult, SketchFile } from "@pinflow/arduino-ir";

export { SyncCoordinator, type SyncDeps, type ParseOutcome, type RemoteOutcome } from "./coordinator";
export { UnifiedHistory, type Snapshot } from "./history";
export { debounce, ManualScheduler, realScheduler, type Debounced, type Scheduler } from "./debounce";
export { diffSketch, structuralHash, normalizeIr, type SketchDiff } from "@pinflow/arduino-ir";

export interface FixedPointReport {
  /** generate(parse(generate(parse(src)))) === generate(parse(src)) */
  stable: boolean;
  /** Generate passes that changed the text before it stopped changing (0 = source already canonical). */
  passes: number;
  /** True when the source itself is already canonical (generate(parse(src)) === src). */
  canonical: boolean;
  code: string;
  /** Set when a parse failed along the way. */
  error?: string;
}

/**
 * Spec 3.6 #7: repeated sync must reach a fixed point. Runs parse->generate up to
 * `maxPasses` times and reports whether the text stopped changing.
 */
export function checkFixedPoint(
  source: string,
  parse: (src: string, prev?: SketchFile) => ParseResult,
  generate: (file: SketchFile) => GenerateResult,
  maxPasses = 3,
): FixedPointReport {
  let code = source;
  let prev: SketchFile | undefined;
  for (let pass = 1; pass <= maxPasses + 1; pass++) {
    const r = parse(code, prev);
    if (!r.ok) return { stable: false, passes: pass, canonical: false, code, error: r.diagnostics[0]?.message ?? "parse failed" };
    const next = generate(r.file).code;
    if (next === code) return { stable: true, passes: pass - 1, canonical: pass === 1, code };
    code = next;
    prev = r.file;
  }
  return { stable: false, passes: maxPasses, canonical: false, code };
}
