/**
 * Compile runners.
 *
 * ISOLATION NOTE: ArduinoCliRunner provides PROCESS-LEVEL isolation only:
 *   - argument arrays via spawn() (never a shell), sketch name/FQBN pre-validated
 *   - fresh mkdtemp job directory (owned by JobManager) as cwd and TMPDIR
 *   - scrubbed environment (PATH, HOME, TMPDIR, LC_ALL/LANG, GOMEMLIMIT and ARDUINO_* only)
 *   - prlimit(1) rlimits (address space, CPU seconds, file size, open files, no core dumps,
 *     optional process count) when /usr/bin/prlimit exists
 *   - own process group, killed (SIGTERM then SIGKILL) on cancel/timeout
 *   - output size cap
 * It is NOT a container: the compiler runs as the worker's uid, can read files that uid can
 * read and is not network-isolated. See docs/security-threat-model.md for the production plan.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export interface RunInput {
  fqbn: string;
  /** Absolute sketch dir; its basename equals the sketch name. */
  sketchDir: string;
  buildDir: string;
  /** Job temp root (cwd). */
  jobDir: string;
  /** TMPDIR for gcc temp files (inside jobDir). */
  tmpDir: string;
  signal: AbortSignal;
  maxOutputBytes: number;
}

export interface RunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  /** captured stdout (the arduino-cli --json document when json mode is on) */
  output: string;
  /** captured stderr */
  stderr?: string;
  outputBytes: number;
  truncated: boolean;
  durationMs: number;
  /** true if the run ended because the signal was aborted */
  aborted: boolean;
  spawnError?: string;
}

/** Runner abstraction so tests can inject a fake (see test/fake-runner.ts — TEST ONLY). */
export interface CompileRunner {
  run(input: RunInput): Promise<RunResult>;
}

export interface RlimitConfig {
  /** RLIMIT_AS bytes */
  addressSpaceBytes?: number;
  /** RLIMIT_CPU seconds */
  cpuSeconds?: number;
  /** RLIMIT_FSIZE bytes */
  fileSizeBytes?: number;
  /** RLIMIT_NOFILE */
  openFiles?: number;
  /** RLIMIT_NPROC – counts ALL processes of the uid, so only set it when the worker has its own uid. */
  processes?: number;
}

export interface ArduinoCliRunnerOptions {
  cliPath: string;
  configFile: string;
  /** HOME for arduino-cli (holds its user cache). */
  homeDir: string;
  prlimitPath?: string | null;
  rlimits?: RlimitConfig;
  warnings?: "none" | "default" | "more" | "all";
  /** Use `--json` machine output (default true). */
  json?: boolean;
  /**
   * Pass `--build-path <job>/build` (default false). arduino-cli 1.5 only reuses its cached
   * core.a (build_cache.path/cores) when NO --build-path is given; with it, every ESP32 job
   * recompiles the whole core (~11 min cold on a 2-CPU arm64 box). Without it, the build goes to
   * build_cache.path/sketches/<md5(sketch path)>, which the JobManager deletes after the job.
   */
  useBuildPath?: boolean;
  /** arduino-cli `--jobs N` (parallel gcc processes). Unset = CLI default (all CPUs). Lower it on memory-starved hosts. */
  jobs?: number;
}

export const DEFAULT_RLIMITS: RlimitConfig = {
  addressSpaceBytes: 4 * 1024 ** 3,
  cpuSeconds: 300,
  fileSizeBytes: 512 * 1024 ** 2,
  openFiles: 1024,
};

export function buildEnv(opts: { homeDir: string; tmpDir: string }): NodeJS.ProcessEnv {
  return {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: opts.homeDir,
    TMPDIR: opts.tmpDir,
    LC_ALL: "C",
    LANG: "C",
    ARDUINO_METRICS_ENABLED: "false",
    ARDUINO_UPDATER_ENABLE_NOTIFICATION: "false",
    // soft cap for arduino-cli's Go heap (it peaks ~220 MB RSS on ESP32 builds); gcc is unaffected
    GOMEMLIMIT: "192MiB",
  };
}

export function buildCompileArgs(
  opts: ArduinoCliRunnerOptions,
  input: Pick<RunInput, "fqbn" | "buildDir" | "sketchDir">,
): string[] {
  return [
    "--config-file",
    opts.configFile,
    "compile",
    "--fqbn",
    input.fqbn,
    ...(opts.useBuildPath ? ["--build-path", input.buildDir] : []),
    "--warnings",
    opts.warnings ?? "default",
    "--no-color",
    ...(opts.jobs ? ["--jobs", String(opts.jobs)] : []),
    ...(opts.json === false ? [] : ["--json"]),
    // never --libraries / --library from user input; only preinstalled allowlisted libs are used
    input.sketchDir,
  ];
}

export function prlimitArgs(r: RlimitConfig): string[] {
  const a: string[] = ["--core=0"];
  if (r.addressSpaceBytes) a.push(`--as=${r.addressSpaceBytes}`);
  if (r.cpuSeconds) a.push(`--cpu=${r.cpuSeconds}`);
  if (r.fileSizeBytes) a.push(`--fsize=${r.fileSizeBytes}`);
  if (r.openFiles) a.push(`--nofile=${r.openFiles}`);
  if (r.processes) a.push(`--nproc=${r.processes}`);
  return a;
}

export function detectPrlimit(): string | null {
  for (const p of ["/usr/bin/prlimit", "/bin/prlimit"]) if (existsSync(p)) return p;
  return null;
}

export class ArduinoCliRunner implements CompileRunner {
  constructor(private readonly opts: ArduinoCliRunnerOptions) {}

  run(input: RunInput): Promise<RunResult> {
    const started = Date.now();
    const cliArgs = buildCompileArgs(this.opts, input);
    let cmd = this.opts.cliPath;
    let args = cliArgs;
    if (this.opts.prlimitPath) {
      cmd = this.opts.prlimitPath;
      args = [...prlimitArgs(this.opts.rlimits ?? DEFAULT_RLIMITS), "--", this.opts.cliPath, ...cliArgs];
    }
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      let kept = 0;
      let total = 0;
      let truncated = false;
      let settled = false;
      let killTimer: NodeJS.Timeout | undefined;

      const child = spawn(cmd, args, {
        cwd: input.jobDir,
        env: buildEnv({ homeDir: this.opts.homeDir, tmpDir: input.tmpDir }),
        stdio: ["ignore", "pipe", "pipe"],
        detached: true, // own process group so we can kill gcc children too
        shell: false,
        windowsHide: true,
      });

      const onData = (b: Buffer, sink: Buffer[]) => {
        total += b.length;
        if (kept >= input.maxOutputBytes) {
          truncated = true;
          return;
        }
        const room = input.maxOutputBytes - kept;
        const part = b.length > room ? b.subarray(0, room) : b;
        if (b.length > room) truncated = true;
        sink.push(part);
        kept += part.length;
      };
      child.stdout!.on("data", (b: Buffer) => onData(b, chunks));
      child.stderr!.on("data", (b: Buffer) => onData(b, errChunks));

      const killGroup = (sig: NodeJS.Signals) => {
        if (child.pid === undefined) return;
        try {
          process.kill(-child.pid, sig);
        } catch {
          try {
            child.kill(sig);
          } catch {
            /* already gone */
          }
        }
      };
      const onAbort = () => {
        killGroup("SIGTERM");
        killTimer = setTimeout(() => killGroup("SIGKILL"), 2000);
        killTimer.unref();
      };
      if (input.signal.aborted) onAbort();
      else input.signal.addEventListener("abort", onAbort, { once: true });

      const finish = (exitCode: number | null, sig: NodeJS.Signals | null, spawnError?: string) => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener("abort", onAbort);
        if (killTimer) clearTimeout(killTimer);
        // make sure no stragglers survive in the group
        if (input.signal.aborted) killGroup("SIGKILL");
        resolve({
          exitCode,
          signal: sig,
          output: Buffer.concat(chunks).toString("utf8"),
          stderr: Buffer.concat(errChunks).toString("utf8"),
          outputBytes: total,
          truncated,
          durationMs: Date.now() - started,
          aborted: input.signal.aborted,
          spawnError,
        });
      };
      child.on("error", (err) => finish(null, null, err.message));
      child.on("close", (code, sig) => finish(code, sig));
    });
  }
}
