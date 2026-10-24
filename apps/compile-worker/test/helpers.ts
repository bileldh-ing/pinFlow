import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { loadConfig, type WorkerConfig } from "../src/config.js";
import { createWorker, type Worker } from "../src/worker.js";
import type { CompileRunner } from "../src/runner.js";
import { REPO_ROOT } from "../src/toolchain.js";

export const FIXTURES = path.join(REPO_ROOT, "fixtures", "compile");
export const TOKEN = "test-token-0123456789abcdefghij";

/** Load a fixture sketch directory as API files (paths relative to the sketch root). */
export function loadFixture(name: string): Array<{ path: string; content: string }> {
  const root = path.join(FIXTURES, name);
  const out: Array<{ path: string; content: string }> = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else out.push({ path: path.relative(root, full).split(path.sep).join("/"), content: readFileSync(full, "utf8") });
    }
  };
  walk(root);
  return out;
}

export interface Started {
  worker: Worker;
  url: string;
  cfg: WorkerConfig;
  workRoot: string;
}

export async function startWorker(
  opts: { runner?: CompileRunner; env?: Record<string, string>; skipVerify?: boolean } = {},
): Promise<Started> {
  // PINFLOW_TEST_WORK_ROOT lets hosts whose /tmp is RAM-backed put job dirs on disk
  const workRoot = mkdtempSync(path.join(process.env.PINFLOW_TEST_WORK_ROOT ?? os.tmpdir(), "pinflow-test-root-"));
  const cfg = loadConfig({ NODE_ENV: "test", COMPILE_WORKER_TOKEN: TOKEN, COMPILE_WORK_ROOT: workRoot, ...opts.env });
  const worker = createWorker(cfg, { runner: opts.runner, skipVerify: opts.skipVerify ?? !!opts.runner });
  // remove the per-test work root when the worker is closed
  const close = worker.close.bind(worker);
  worker.close = async () => {
    await close();
    rmSync(workRoot, { recursive: true, force: true });
  };
  await new Promise<void>((r) => worker.server.listen(0, "127.0.0.1", () => r()));
  const { port } = worker.server.address() as AddressInfo;
  return { worker, url: `http://127.0.0.1:${port}`, cfg, workRoot };
}

export async function api(url: string, method: string, p: string, body?: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(url + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, body: (text ? JSON.parse(text) : undefined) as any };
}

export async function waitFor(url: string, jobId: string, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const r = await api(url, "GET", `/jobs/${jobId}`);
    if (["succeeded", "failed", "canceled", "timeout"].includes(r.body.status)) return r.body;
    if (Date.now() > end) throw new Error(`job still ${r.body.status}`);
    await new Promise((res) => setTimeout(res, 50));
  }
}

export const job = (files: Array<{ path: string; content: string }>, fqbn = "arduino:avr:uno") => ({
  projectId: "proj_1",
  revisionId: "rev_1",
  fqbn,
  files,
  sourceHash: "sha256:abc123",
});
