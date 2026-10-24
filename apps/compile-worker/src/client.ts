/**
 * Minimal compile-worker client for the web app (server-side only: the bearer token must never be
 * shipped to browsers). Uses global fetch; no Node-only imports.
 */
import type { ApiError, JobView, SubmitJobRequest, SubmitJobResponse } from "./types.js";
import { TERMINAL_STATUSES } from "./types.js";

export type { JobView, SubmitJobRequest, SubmitJobResponse, ApiError };
export { TERMINAL_STATUSES };

export class CompileWorkerError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | undefined,
  ) {
    super(body?.message ?? `compile worker responded ${status}`);
    this.name = "CompileWorkerError";
  }
}

export interface ClientOptions {
  baseUrl: string;
  token: string;
  /** Forwarded as X-PinFlow-User-Id for per-user rate limiting. */
  userId?: string;
  fetch?: typeof fetch;
}

async function call<T>(o: ClientOptions, method: string, path: string, body?: unknown): Promise<T> {
  const f = o.fetch ?? fetch;
  const headers: Record<string, string> = { authorization: `Bearer ${o.token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (o.userId) headers["x-pinflow-user-id"] = o.userId;
  const res = await f(new URL(path, o.baseUrl).toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) throw new CompileWorkerError(res.status, json as ApiError | undefined);
  return json as T;
}

export function submitJob(o: ClientOptions, req: SubmitJobRequest): Promise<SubmitJobResponse> {
  return call(o, "POST", "/jobs", req);
}

export function getJob(o: ClientOptions, jobId: string): Promise<JobView> {
  return call(o, "GET", `/jobs/${encodeURIComponent(jobId)}`);
}

export function cancelJob(o: ClientOptions, jobId: string): Promise<{ jobId: string; status: string }> {
  return call(o, "POST", `/jobs/${encodeURIComponent(jobId)}/cancel`, {});
}

/** Poll until the job reaches a terminal status (or the timeout elapses). */
export async function waitForJob(
  o: ClientOptions,
  jobId: string,
  { intervalMs = 1000, timeoutMs = 300_000 } = {},
): Promise<JobView> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await getJob(o, jobId);
    if (TERMINAL_STATUSES.includes(job.status)) return job;
    if (Date.now() > deadline) throw new Error(`job ${jobId} still ${job.status} after ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export function createCompileWorkerClient(o: ClientOptions) {
  return {
    submitJob: (req: SubmitJobRequest) => submitJob(o, req),
    getJob: (id: string) => getJob(o, id),
    cancelJob: (id: string) => cancelJob(o, id),
    waitForJob: (id: string, opts?: { intervalMs?: number; timeoutMs?: number }) => waitForJob(o, id, opts),
  };
}
