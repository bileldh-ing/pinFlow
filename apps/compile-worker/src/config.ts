import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_RLIMITS, type RlimitConfig } from "./runner.js";
import { REPO_ROOT } from "./toolchain.js";

export interface WorkerConfig {
  port: number;
  host: string;
  token: string;
  cliPath: string;
  configFile: string;
  arduinoCacheDir: string;
  /** must match build_cache.path in arduino-cli.yaml */
  buildCacheDir: string;
  /** pass --build-path per job (disables arduino-cli's core cache; see runner.ts) */
  useBuildPath: boolean;
  /** arduino-cli --jobs (COMPILE_JOBS, default 1 to bound peak RAM; "0" = all CPUs) */
  compileJobs: number | undefined;
  homeDir: string;
  workRoot: string;
  concurrency: number;
  maxQueue: number;
  defaultTimeoutMs: number | undefined;
  rateLimitPerMin: number;
  maxOutputBytes: number;
  logViewBytes: number;
  retentionMs: number;
  rlimits: RlimitConfig;
  usePrlimit: boolean;
}

const int = (v: string | undefined, d: number) => {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const token = env.COMPILE_WORKER_TOKEN ?? "";
  if (!token && env.NODE_ENV !== "test") {
    throw new Error("COMPILE_WORKER_TOKEN is required (auth may only be disabled with NODE_ENV=test)");
  }
  if (token && token.length < 24 && env.NODE_ENV === "production") {
    throw new Error("COMPILE_WORKER_TOKEN must be at least 24 characters in production");
  }
  const cache = path.resolve(env.ARDUINO_CACHE_DIR ?? path.join(REPO_ROOT, ".arduino-cache"));
  const homeDir = path.resolve(env.COMPILE_HOME_DIR ?? path.join(cache, "home"));
  mkdirSync(homeDir, { recursive: true });
  return {
    port: int(env.PORT, 4100),
    host: env.HOST ?? "127.0.0.1",
    token,
    cliPath: env.ARDUINO_CLI_PATH ?? path.join(cache, "bin", "arduino-cli"),
    configFile: env.ARDUINO_CLI_CONFIG ?? path.join(cache, "arduino-cli.yaml"),
    arduinoCacheDir: cache,
    buildCacheDir: path.resolve(env.ARDUINO_BUILD_CACHE_DIR ?? path.join(cache, "build-cache")),
    useBuildPath: env.COMPILE_USE_BUILD_PATH === "1",
    compileJobs: env.COMPILE_JOBS === "0" ? undefined : int(env.COMPILE_JOBS, 1),
    homeDir,
    workRoot: env.COMPILE_WORK_ROOT ?? os.tmpdir(),
    concurrency: int(env.COMPILE_CONCURRENCY, 1),
    maxQueue: int(env.COMPILE_MAX_QUEUE, 16),
    defaultTimeoutMs: env.COMPILE_TIMEOUT_MS ? int(env.COMPILE_TIMEOUT_MS, 120_000) : undefined,
    rateLimitPerMin: int(env.COMPILE_RATE_LIMIT_PER_MIN, 20),
    maxOutputBytes: int(env.COMPILE_MAX_OUTPUT_BYTES, 4 * 1024 * 1024),
    logViewBytes: int(env.COMPILE_LOG_VIEW_BYTES, 64 * 1024),
    retentionMs: int(env.COMPILE_JOB_RETENTION_MS, 60 * 60 * 1000),
    rlimits: {
      addressSpaceBytes: int(env.COMPILE_RLIMIT_AS_BYTES, DEFAULT_RLIMITS.addressSpaceBytes!),
      cpuSeconds: int(env.COMPILE_RLIMIT_CPU_SECONDS, DEFAULT_RLIMITS.cpuSeconds!),
      fileSizeBytes: int(env.COMPILE_RLIMIT_FSIZE_BYTES, DEFAULT_RLIMITS.fileSizeBytes!),
      openFiles: int(env.COMPILE_RLIMIT_NOFILE, DEFAULT_RLIMITS.openFiles!),
      processes: env.COMPILE_RLIMIT_NPROC ? int(env.COMPILE_RLIMIT_NPROC, 256) : undefined,
    },
    usePrlimit: env.COMPILE_DISABLE_PRLIMIT !== "1",
  };
}
