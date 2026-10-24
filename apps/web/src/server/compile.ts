import "server-only";
import type { ApiError, JobView, SubmitJobRequest, SubmitJobResponse } from "@pinflow/compile-worker/types";

/**
 * Server-side adapter for the PinFlow compile worker (apps/compile-worker).
 * Mirrors @pinflow/compile-worker/client (same endpoints, headers and error type) and uses its
 * types; the client module itself is not imported because its `./types.js` ESM specifiers do
 * not resolve under Turbopack. The URL and bearer token never reach the browser.
 */
class CompileWorkerError extends Error {
  constructor(readonly status: number, readonly body: ApiError | undefined) { super(body?.message ?? `compile worker responded ${status}`); this.name = "CompileWorkerError"; }
}
type Opts = { baseUrl: string; token: string; userId?: string; fetch: typeof fetch };
async function call<T>(o: Opts, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${o.token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (o.userId) headers["x-pinflow-user-id"] = o.userId;
  const res = await o.fetch(new URL(path, o.baseUrl).toString(), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) throw new CompileWorkerError(res.status, json as ApiError | undefined);
  return json as T;
}
const cwSubmit = (o: Opts, req: SubmitJobRequest) => call<SubmitJobResponse>(o, "POST", "/jobs", req);
const cwGet = (o: Opts, id: string) => call<JobView>(o, "GET", `/jobs/${encodeURIComponent(id)}`);
const cwCancel = (o: Opts, id: string) => call<{ jobId: string; status: string }>(o, "POST", `/jobs/${encodeURIComponent(id)}/cancel`, {});
export interface WorkerDiagnostic {
  /** Empty when the diagnostic has no sketch location (linker / arduino-cli errors) → project-level. */
  file: string;
  line: number;
  column: number;
  severity: string;
  message: string;
  source?: string;
  external?: boolean;
}

export interface NormalizedJob {
  status: string;
  diagnostics: WorkerDiagnostic[];
  sizes: unknown;
  toolchain: unknown;
  log: string;
  error: string | null;
}

export class CompileWorkerUnavailable extends Error {
  constructor(msg: string) { super(msg); this.name = "CompileWorkerUnavailable"; }
}

function options(userId?: string) {
  const baseUrl = process.env.COMPILE_WORKER_URL;
  const token = process.env.COMPILE_WORKER_TOKEN ?? "";
  if (!baseUrl) throw new CompileWorkerUnavailable("No compile worker is configured (COMPILE_WORKER_URL is not set). Compilation is unavailable on this server.");
  const timed: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000), cache: "no-store" });
  return { baseUrl, token, userId, fetch: timed };
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CompileWorkerUnavailable) throw e;
    if (e instanceof CompileWorkerError) {
      if (e.status === 401 || e.status === 403) throw new CompileWorkerUnavailable("The compile worker rejected this server's credentials (check COMPILE_WORKER_TOKEN).");
      if (e.status === 429) throw new CompileWorkerUnavailable(`The compile worker is busy or rate-limited: ${e.message}`);
      throw new CompileWorkerUnavailable(`The compile worker returned HTTP ${e.status}: ${e.message}`);
    }
    const host = (() => { try { return new URL(process.env.COMPILE_WORKER_URL ?? "").host; } catch { return "the configured host"; } })();
    throw new CompileWorkerUnavailable(`The compile worker at ${host} is unreachable (${e instanceof Error ? e.message : "network error"}).`);
  }
}

export function normalizeJob(j: JobView): NormalizedJob {
  const log = j.log ? `${j.log.text}${j.log.truncated ? `\n… [log truncated, ${j.log.bytes} bytes total]` : ""}` : "";
  return {
    status: j.status,
    diagnostics: (j.diagnostics ?? []).map((d) => ({
      file: d.external ? "" : (d.file ?? ""), line: d.external ? 0 : (d.line ?? 0), column: d.external ? 0 : (d.column ?? 0),
      severity: d.severity, message: d.external && d.file ? `${d.message} (in ${d.file}${d.line ? `:${d.line}` : ""})` : d.message, source: d.source, external: d.external,
    })),
    sizes: j.sizes ?? null,
    toolchain: j.toolchain ?? null,
    log: log.slice(-200_000),
    error: j.error ?? null,
  };
}

export async function submitJob(body: { projectId: string; revisionId: number; fqbn: string; files: Array<{ path: string; content: string }>; sourceHash: string }, userId?: string): Promise<{ jobId: string; status: string }> {
  return wrap(() => cwSubmit(options(userId), body));
}
export async function getJob(jobId: string): Promise<NormalizedJob> { return wrap(async () => normalizeJob(await cwGet(options(), jobId))); }
export async function cancelJob(jobId: string): Promise<void> { await wrap(() => cwCancel(options(), jobId)); }

export const TERMINAL = new Set(["succeeded", "failed", "canceled", "cancelled", "timeout", "error"]);
