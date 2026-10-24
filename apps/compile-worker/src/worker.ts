/** Wires config + toolchain + runner + job manager + HTTP app together. */
import { createHash } from "node:crypto";
import path from "node:path";
import { RateLimiter } from "./auth.js";
import type { WorkerConfig } from "./config.js";
import { JobManager } from "./jobs.js";
import { ArduinoCliRunner, buildEnv, detectPrlimit, type CompileRunner } from "./runner.js";
import { createApp } from "./server.js";
import {
  fqbnAllowlist,
  loadToolchainLock,
  REPO_ROOT,
  toolchainFor,
  verifyToolchain,
  type ToolchainLock,
  type VerifyResult,
} from "./toolchain.js";

export interface Worker {
  server: ReturnType<typeof createApp>;
  manager: JobManager;
  lock: ToolchainLock;
  verification: Promise<VerifyResult>;
  close(): Promise<void>;
}

export function createWorker(
  cfg: WorkerConfig,
  opts: { runner?: CompileRunner; lock?: ToolchainLock; skipVerify?: boolean } = {},
): Worker {
  const lock = opts.lock ?? loadToolchainLock();
  const boards = fqbnAllowlist(lock);
  let verified: VerifyResult | undefined;
  const verification = opts.skipVerify
    ? Promise.resolve<VerifyResult>({ ok: false, platformOk: {}, problems: ["verification skipped"], installed: { platforms: {}, libraries: {} } })
    : verifyToolchain(lock, cfg.cliPath, cfg.configFile, buildEnv({ homeDir: cfg.homeDir, tmpDir: cfg.workRoot }));
  void verification.then((v) => {
    verified = v;
  });
  const prlimitPath = cfg.usePrlimit ? detectPrlimit() : null;
  const runner =
    opts.runner ??
    new ArduinoCliRunner({
      cliPath: cfg.cliPath,
      configFile: cfg.configFile,
      homeDir: cfg.homeDir,
      prlimitPath,
      rlimits: cfg.rlimits,
      useBuildPath: cfg.useBuildPath,
      jobs: cfg.compileJobs,
    });
  const manager = new JobManager({
    runner,
    workRoot: cfg.workRoot,
    concurrency: cfg.concurrency,
    maxQueue: cfg.maxQueue,
    timeoutMsFor: (fqbn) => cfg.defaultTimeoutMs ?? boards.get(fqbn)?.timeoutMs ?? 120_000,
    toolchainFor: (fqbn) => toolchainFor(lock, fqbn, verified?.platformOk[boards.get(fqbn)?.platform ?? ""] ?? false),
    redact: [
      { prefix: cfg.arduinoCacheDir + "/data", placeholder: "<arduino-data>" },
      { prefix: cfg.arduinoCacheDir + "/user", placeholder: "<arduino-user>" },
      { prefix: cfg.arduinoCacheDir, placeholder: "<arduino-cache>" },
      { prefix: REPO_ROOT, placeholder: "<repo>" },
    ],
    maxOutputBytes: cfg.maxOutputBytes,
    logViewBytes: cfg.logViewBytes,
    retentionMs: cfg.retentionMs,
    isDisposableBuildPath: (p) => {
      const root = path.join(cfg.buildCacheDir, "sketches") + path.sep;
      const resolved = path.resolve(p);
      return resolved.startsWith(root) && /^[0-9A-Fa-f]{32}$/.test(path.basename(resolved));
    },
    // arduino-cli 1.5: <build_cache.path>/sketches/<MD5(sketch dir path), upper-case hex>
    predictBuildPath: (sketchDir) => path.join(cfg.buildCacheDir, "sketches", createHash("md5").update(sketchDir).digest("hex").toUpperCase()),
  });
  const server = createApp({
    manager,
    token: cfg.token,
    allowedFqbns: new Set(boards.keys()),
    rateLimiter: RateLimiter.perMinute(cfg.rateLimitPerMin),
    health: () => ({
      ok: verified !== undefined && Object.values(verified.platformOk).some(Boolean),
      toolchainVerified: verified?.ok ?? false,
      platforms: verified?.platformOk ?? {},
      isolation: prlimitPath && !opts.runner ? "process (rlimits via prlimit); not a container" : "process; not a container",
      ...manager.stats(),
    }),
  });
  return {
    server,
    manager,
    lock,
    verification,
    close: () =>
      new Promise<void>((resolve) => {
        manager.stop();
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}
