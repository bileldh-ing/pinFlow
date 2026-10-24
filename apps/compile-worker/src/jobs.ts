import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { constants as fsc } from "node:fs";
import { mkdtemp, mkdir, open, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { parseDiagnostics, redactText, type PathMapping } from "./diagnostics.js";
import { validateSketch, type SketchFile } from "./paths.js";
import type { CompileRunner } from "./runner.js";
import { parseSizes, type SizeReport } from "./sizes.js";
import { TERMINAL_STATUSES, type JobStatus, type JobView, type SubmitJobRequest, type ToolchainInfo } from "./types.js";

export class QueueFullError extends Error {
  constructor() {
    super("compile queue is full");
  }
}

export interface JobManagerOptions {
  runner: CompileRunner;
  workRoot: string;
  concurrency: number;
  maxQueue: number;
  timeoutMsFor: (fqbn: string) => number;
  toolchainFor: (fqbn: string) => ToolchainInfo;
  /** Absolute prefixes to scrub from logs (arduino data dir, repo root…). */
  redact: Array<{ prefix: string; placeholder: string }>;
  maxOutputBytes: number;
  /** Bytes of raw log returned in the job view. */
  logViewBytes: number;
  retentionMs: number;
  /**
   * Returns true for a build directory reported by arduino-cli that belongs to this job and must be
   * deleted afterwards (e.g. <build_cache>/sketches/<hash> when --build-path is not used).
   */
  isDisposableBuildPath?: (p: string) => boolean;
  /** Where arduino-cli will put this job's build when --build-path is not used (deleted even on cancel/timeout). */
  predictBuildPath?: (sketchDir: string) => string;
}

interface JobRecord {
  view: JobView;
  files: SketchFile[];
  controller: AbortController;
  cancelRequested: boolean;
  timedOut: boolean;
  events: EventEmitter;
}

export function computeSourceHash(files: SketchFile[]): string {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    h.update(f.path, "utf8");
    h.update("\0");
    h.update(f.content, "utf8");
    h.update("\0");
  }
  return `sha256:${h.digest("hex")}`;
}

/** Write a user file inside root without following symlinks or escaping root. */
export async function writeSketchFile(root: string, rel: string, content: string): Promise<void> {
  const target = path.resolve(root, rel);
  if (!target.startsWith(root + path.sep)) throw new Error(`path escapes sketch dir: ${rel}`);
  const dir = path.dirname(target);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const realDir = await realpath(dir);
  const realRoot = await realpath(root);
  if (realDir !== realRoot && !realDir.startsWith(realRoot + path.sep)) throw new Error(`directory escapes sketch dir: ${rel}`);
  const fh = await open(target, fsc.O_WRONLY | fsc.O_CREAT | fsc.O_EXCL | fsc.O_NOFOLLOW, 0o600);
  try {
    await fh.writeFile(content, "utf8");
  } finally {
    await fh.close();
  }
}

interface CliJson {
  compiler_out?: string;
  compiler_err?: string;
  success?: boolean;
  error?: string;
  builder_result?: {
    used_libraries?: Array<{ name?: string; version?: string }>;
    executable_sections_size?: Array<{ name?: string; size?: number; max_size?: number }>;
    build_platform?: { id?: string; version?: string };
    build_path?: string;
  };
}

/**
 * Interpret `arduino-cli compile --json` stdout. Falls back to treating stdout+stderr as plain
 * text when the document is absent or truncated (e.g. output cap hit, crash).
 */
export function interpretCliOutput(
  stdout: string,
  stderr: string,
): {
  text: string;
  sizes?: SizeReport;
  usedLibraries?: Array<{ name: string; version: string }>;
  buildPlatform?: { id: string; version: string };
  buildPath?: string;
} {
  let doc: CliJson | undefined;
  const trimmed = stdout.trim();
  if (trimmed.startsWith("{")) {
    try {
      doc = JSON.parse(trimmed) as CliJson;
    } catch {
      doc = undefined;
    }
  }
  if (!doc) return { text: [stdout, stderr].filter(Boolean).join("\n") };
  const parts = [doc.compiler_out ?? "", doc.compiler_err ?? "", stderr];
  if (doc.error) parts.push(/^Error/.test(doc.error) ? doc.error : `Error during build: ${doc.error}`);
  const text = parts.filter((p) => p.trim()).join("\n");
  const br = doc.builder_result;
  const usedLibraries = br?.used_libraries
    ?.filter((l) => l.name)
    .map((l) => ({ name: l.name!, version: l.version ?? "" }));
  const bp = br?.build_platform?.id ? { id: br.build_platform.id, version: br.build_platform.version ?? "" } : undefined;
  let sizes: SizeReport | undefined = parseSizes(text);
  if (!sizes && br?.executable_sections_size?.length) {
    const sec = (n: string) => br.executable_sections_size!.find((x) => x.name === n);
    const t = sec("text");
    const d = sec("data");
    sizes = {
      flash: t ? { used: t.size ?? 0, max: t.max_size || undefined } : undefined,
      ram: d ? { used: d.size ?? 0, max: d.max_size || undefined } : undefined,
    };
  }
  return { text, sizes, usedLibraries, buildPlatform: bp, buildPath: br?.build_path || undefined };
}

/** Parse arduino-cli's text "Used library  Version Path" table (fallback for non-JSON output). */
export function parseUsedLibraries(output: string): Array<{ name: string; version: string }> {
  const lines = output.split(/\r?\n/);
  const start = lines.findIndex((l) => /^Used library\s+Version\s+Path/.test(l));
  if (start < 0) return [];
  const out: Array<{ name: string; version: string }> = [];
  for (const l of lines.slice(start + 1)) {
    if (!l.trim() || /^Used platform/.test(l)) break;
    const m = /^(.+?)\s+(\S+)\s+\/\S.*$/.exec(l.trim());
    if (m) out.push({ name: m[1]!.trim(), version: m[2]! });
  }
  return out;
}

export class JobManager {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly queue: string[] = [];
  private running = 0;
  private readonly gcTimer: NodeJS.Timeout;

  constructor(private readonly o: JobManagerOptions) {
    this.gcTimer = setInterval(() => this.gc(), Math.min(60_000, o.retentionMs)).unref();
  }

  stop(): void {
    clearInterval(this.gcTimer);
    for (const id of [...this.queue]) this.cancel(id);
    for (const r of this.jobs.values()) if (!TERMINAL_STATUSES.includes(r.view.status)) r.controller.abort();
  }

  /** Validates sketch files (throws PathValidationError) and enqueues. FQBN must be pre-checked. */
  submit(req: SubmitJobRequest): JobView {
    const { sketchName, files } = validateSketch(req.files, req.sketchName);
    if (this.queue.length >= this.o.maxQueue) throw new QueueFullError();
    const jobId = randomUUID();
    const view: JobView = {
      jobId,
      projectId: String(req.projectId),
      revisionId: String(req.revisionId),
      fqbn: req.fqbn,
      sketchName,
      sourceHash: req.sourceHash,
      computedSourceHash: computeSourceHash(files),
      status: "queued",
      createdAt: new Date().toISOString(),
      diagnostics: [],
      toolchain: this.o.toolchainFor(req.fqbn),
      log: { text: "", truncated: false, bytes: 0 },
    };
    const rec: JobRecord = {
      view,
      files: files.map((f) => ({ path: f.path, content: f.content })),
      controller: new AbortController(),
      cancelRequested: false,
      timedOut: false,
      events: new EventEmitter(),
    };
    this.jobs.set(jobId, rec);
    this.queue.push(jobId);
    setImmediate(() => this.pump());
    return this.snapshot(rec);
  }

  get(id: string): JobView | undefined {
    const r = this.jobs.get(id);
    return r ? this.snapshot(r) : undefined;
  }

  /** Subscribe to status changes. Returns unsubscribe. */
  subscribe(id: string, fn: (v: JobView) => void): (() => void) | undefined {
    const r = this.jobs.get(id);
    if (!r) return undefined;
    const h = () => fn(this.snapshot(r));
    r.events.on("change", h);
    return () => r.events.off("change", h);
  }

  /** Returns the job view, or undefined if unknown. Terminal jobs are returned unchanged. */
  cancel(id: string): JobView | undefined {
    const r = this.jobs.get(id);
    if (!r) return undefined;
    if (TERMINAL_STATUSES.includes(r.view.status)) return this.snapshot(r);
    r.cancelRequested = true;
    const qi = this.queue.indexOf(id);
    if (qi >= 0) {
      this.queue.splice(qi, 1);
      this.finish(r, "canceled", "canceled before start");
    } else {
      r.controller.abort();
    }
    return this.snapshot(r);
  }

  stats() {
    return { queued: this.queue.length, running: this.running, jobs: this.jobs.size };
  }

  private snapshot(r: JobRecord): JobView {
    return structuredClone(r.view);
  }

  private setStatus(r: JobRecord, s: JobStatus) {
    r.view.status = s;
    r.events.emit("change");
  }

  private finish(r: JobRecord, s: JobStatus, error?: string) {
    r.view.finishedAt = new Date().toISOString();
    if (r.view.startedAt) r.view.durationMs = Date.parse(r.view.finishedAt) - Date.parse(r.view.startedAt);
    if (error) r.view.error = error;
    r.files = []; // drop source from memory once done
    this.setStatus(r, s);
  }

  private pump() {
    while (this.running < this.o.concurrency && this.queue.length > 0) {
      const id = this.queue.shift()!;
      const r = this.jobs.get(id);
      if (!r || r.view.status !== "queued") continue;
      this.running++;
      this.execute(r)
        .catch((e) => {
          if (!TERMINAL_STATUSES.includes(r.view.status)) this.finish(r, "failed", `internal error: ${(e as Error).message}`);
        })
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }

  private async execute(r: JobRecord): Promise<void> {
    r.view.startedAt = new Date().toISOString();
    this.setStatus(r, "preparing");
    const timeoutMs = this.o.timeoutMsFor(r.view.fqbn);
    const timer = setTimeout(() => {
      r.timedOut = true;
      r.controller.abort();
    }, timeoutMs);
    let jobDir: string | undefined;
    const externalBuildPaths = new Set<string>();
    // the terminal status is published only AFTER the job dir is deleted
    let outcome: [JobStatus, string | undefined] | undefined;
    const done = (st: JobStatus, err?: string) => {
      outcome = [st, err];
    };
    try {
      jobDir = await realpath(await mkdtemp(path.join(this.o.workRoot, "pinflow-job-")));
      const sketchDir = path.join(jobDir, r.view.sketchName);
      const buildDir = path.join(jobDir, "build");
      const tmpDir = path.join(jobDir, "tmp");
      await mkdir(sketchDir, { mode: 0o700 });
      await mkdir(buildDir, { mode: 0o700 });
      await mkdir(tmpDir, { mode: 0o700 });
      for (const f of r.files) await writeSketchFile(sketchDir, f.path, f.content);
      if (r.controller.signal.aborted) {
        done(r.timedOut ? "timeout" : "canceled", r.timedOut ? `timed out after ${timeoutMs} ms` : "canceled");
        return;
      }
      const predicted = this.o.predictBuildPath?.(sketchDir);
      if (predicted && this.o.isDisposableBuildPath?.(predicted)) externalBuildPaths.add(predicted);
      this.setStatus(r, "compiling");
      const res = await this.o.runner.run({
        fqbn: r.view.fqbn,
        sketchDir,
        buildDir,
        jobDir,
        tmpDir,
        signal: r.controller.signal,
        maxOutputBytes: this.o.maxOutputBytes,
      });
      const interpreted = interpretCliOutput(res.output, res.stderr ?? "");
      const effectiveBuildDir = interpreted.buildPath ?? buildDir;
      if (interpreted.buildPath && interpreted.buildPath !== buildDir && this.o.isDisposableBuildPath?.(interpreted.buildPath)) {
        externalBuildPaths.add(interpreted.buildPath);
      }
      const mapping: PathMapping = { sketchDir, buildDir: effectiveBuildDir, redact: this.o.redact };
      const output = interpreted.text;
      r.view.diagnostics = parseDiagnostics(output, mapping);
      r.view.sizes = interpreted.sizes ?? parseSizes(output);
      const used = interpreted.usedLibraries ?? parseUsedLibraries(output);
      if (used.length) r.view.toolchain.usedLibraries = used;
      if (interpreted.buildPlatform) r.view.toolchain.buildPlatform = interpreted.buildPlatform;
      const redacted = redactText(output, mapping);
      r.view.log = {
        text: redacted.length > this.o.logViewBytes ? redacted.slice(0, this.o.logViewBytes) : redacted,
        truncated: res.truncated || redacted.length > this.o.logViewBytes,
        bytes: res.outputBytes,
      };
      r.view.exitCode = res.exitCode;
      if (r.timedOut) done("timeout", `timed out after ${timeoutMs} ms`);
      else if (r.cancelRequested || res.aborted) done("canceled", "canceled");
      else if (res.spawnError) done("failed", `could not start compiler: ${res.spawnError}`);
      else if (res.exitCode === 0) done("succeeded");
      else
        done(
          "failed",
          r.view.diagnostics.find((d) => d.severity === "error")?.message ??
            (res.exitCode === null && res.signal
              ? `compiler was killed by ${res.signal}${res.signal === "SIGKILL" ? " (likely out of memory on the worker host)" : ""}`
              : `compiler exited with code ${res.exitCode}`),
        );
    } finally {
      clearTimeout(timer);
      if (jobDir) await rm(jobDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
      for (const p of externalBuildPaths) await rm(p, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
      if (outcome) this.finish(r, outcome[0], outcome[1]);
    }
  }

  private gc() {
    const cutoff = Date.now() - this.o.retentionMs;
    for (const [id, r] of this.jobs) {
      if (TERMINAL_STATUSES.includes(r.view.status) && r.view.finishedAt && Date.parse(r.view.finishedAt) < cutoff) {
        this.jobs.delete(id);
      }
    }
  }
}
