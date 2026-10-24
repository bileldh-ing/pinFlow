import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ToolchainInfo } from "./types.js";

export interface BoardEntry {
  fqbn: string;
  name: string;
  platform: string;
  timeoutMs: number;
}

export interface ToolchainLock {
  arduinoCli: { version: string; commit?: string; asset: string; sha256: string; url: string };
  boardManagerUrls: string[];
  platforms: Array<{ id: string; version: string; tools?: Record<string, string> }>;
  libraries: Array<{ name: string; version: string }>;
  boards: BoardEntry[];
}

export const WORKER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(WORKER_ROOT, "..", "..");

export function loadToolchainLock(file = path.join(WORKER_ROOT, "toolchain.lock.json")): ToolchainLock {
  return JSON.parse(readFileSync(file, "utf8")) as ToolchainLock;
}

export function fqbnAllowlist(lock: ToolchainLock): Map<string, BoardEntry> {
  return new Map(lock.boards.map((b) => [b.fqbn, b]));
}

export function toolchainFor(lock: ToolchainLock, fqbn: string, verified: boolean): ToolchainInfo {
  const board = lock.boards.find((b) => b.fqbn === fqbn);
  const platform = board ? lock.platforms.find((p) => p.id === board.platform) : undefined;
  return {
    arduinoCli: lock.arduinoCli.version,
    platform: platform ? { id: platform.id, version: platform.version } : null,
    libraries: lock.libraries.map((l) => ({ ...l })),
    verified,
  };
}

function runOnce(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** Read-only CLI query with retries (memory-starved hosts can OOM-kill `lib list`). */
async function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs = 60_000, attempts = 3): Promise<string> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await runOnce(cmd, args, env, timeoutMs);
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last;
}

export interface VerifyResult {
  ok: boolean;
  /** per-platform verification (cli + libraries + that core) */
  platformOk: Record<string, boolean>;
  problems: string[];
  installed: { arduinoCli?: string; platforms: Record<string, string>; libraries: Record<string, string> };
}

/** Compare the installed arduino-cli/cores/libs against the lock file. Never installs anything. */
export async function verifyToolchain(
  lock: ToolchainLock,
  cliPath: string,
  configFile: string,
  env: NodeJS.ProcessEnv,
): Promise<VerifyResult> {
  const problems: string[] = [];
  const platformOk: Record<string, boolean> = {};
  let baseOk = true;
  const installed: VerifyResult["installed"] = { platforms: {}, libraries: {} };
  try {
    const v = JSON.parse(await run(cliPath, ["version", "--json"], env));
    installed.arduinoCli = v.VersionString ?? v.version;
    if (installed.arduinoCli !== lock.arduinoCli.version) {
      problems.push(`arduino-cli ${installed.arduinoCli} != locked ${lock.arduinoCli.version}`);
      baseOk = false;
    }
    const cores = JSON.parse(await run(cliPath, ["--config-file", configFile, "core", "list", "--json"], env));
    for (const p of cores.platforms ?? []) installed.platforms[p.id] = p.installed_version ?? p.installed;
    for (const p of lock.platforms) {
      platformOk[p.id] = installed.platforms[p.id] === p.version;
      if (!platformOk[p.id]) problems.push(`core ${p.id}: installed ${installed.platforms[p.id] ?? "none"}, locked ${p.version}`);
    }
    const libs = JSON.parse(await run(cliPath, ["--config-file", configFile, "lib", "list", "--json"], env));
    for (const l of libs.installed_libraries ?? []) installed.libraries[l.library.name] = l.library.version;
    for (const l of lock.libraries) {
      if (installed.libraries[l.name] !== l.version) {
        baseOk = false;
        problems.push(`library ${l.name}: installed ${installed.libraries[l.name] ?? "none"}, locked ${l.version}`);
      }
    }
    for (const name of Object.keys(installed.libraries)) {
      if (!lock.libraries.some((l) => l.name === name)) {
        problems.push(`library ${name} installed but not in allowlist`);
        baseOk = false;
      }
    }
  } catch (e) {
    problems.push(`toolchain check failed: ${(e as Error).message.split("\n")[0]}`);
    baseOk = false;
  }
  for (const k of Object.keys(platformOk)) platformOk[k] = baseOk && platformOk[k]!;
  return { ok: problems.length === 0, platformOk, problems, installed };
}
