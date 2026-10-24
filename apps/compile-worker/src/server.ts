import http from "node:http";
import { checkBearer, RateLimiter, tokenKey } from "./auth.js";
import { JobManager, QueueFullError } from "./jobs.js";
import { PathValidationError } from "./paths.js";
import { submitJobSchema } from "./schema.js";
import { TERMINAL_STATUSES, type ApiError, type JobView } from "./types.js";

export interface AppOptions {
  manager: JobManager;
  /** Bearer token. If empty, auth is disabled — only possible with NODE_ENV=test (enforced in config). */
  token: string;
  allowedFqbns: Set<string>;
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
  health?: () => unknown;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(s),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  res.end(s);
}

async function readJson(req: http.IncomingMessage, max: number): Promise<unknown> {
  const ct = req.headers["content-type"] ?? "";
  if (!/^application\/json\b/i.test(ct)) throw new HttpError(415, "unsupported_media_type", "content-type must be application/json");
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > max) throw new HttpError(413, "payload_too_large", `body exceeds ${max} bytes`);
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > max) throw new HttpError(413, "payload_too_large", `body exceeds ${max} bytes`);
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "body is not valid JSON");
  }
}

const JOB_RE = /^\/jobs\/([0-9a-f-]{36})(\/events|\/cancel)?$/;

export function createApp(o: AppOptions): http.Server {
  const maxBody = o.maxBodyBytes ?? 2 * 1024 * 1024;
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const p = url.pathname;
      if (req.method === "GET" && p === "/health") return send(res, 200, o.health ? o.health() : { ok: true });

      if (o.token && !checkBearer(req.headers.authorization, o.token)) {
        throw new HttpError(401, "unauthorized", "missing or invalid bearer token", undefined, { "www-authenticate": "Bearer" });
      }

      if (req.method === "POST" && p === "/jobs") {
        const userHeader = String(req.headers["x-pinflow-user-id"] ?? "")
          .slice(0, 64)
          .replace(/[^A-Za-z0-9_.:-]/g, "");
        const key = `${o.token ? tokenKey(o.token) : "anon"}:${userHeader}`;
        const wait = o.rateLimiter.take(key);
        if (wait > 0) throw new HttpError(429, "rate_limited", "too many compile jobs", undefined, { "retry-after": String(Math.ceil(wait / 1000)) });
        const body = await readJson(req, maxBody);
        const parsed = submitJobSchema.safeParse(body);
        if (!parsed.success) {
          throw new HttpError(400, "invalid_request", "request failed validation", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
        }
        if (!o.allowedFqbns.has(parsed.data.fqbn)) {
          throw new HttpError(400, "fqbn_not_allowed", `FQBN not supported: ${parsed.data.fqbn}`, { allowed: [...o.allowedFqbns] });
        }
        try {
          const job = o.manager.submit(parsed.data);
          return send(res, 202, { jobId: job.jobId, status: job.status });
        } catch (e) {
          if (e instanceof PathValidationError) throw new HttpError(400, "invalid_files", e.message, e.path ? { path: e.path } : undefined);
          if (e instanceof QueueFullError) throw new HttpError(503, "queue_full", e.message, undefined, { "retry-after": "10" });
          throw e;
        }
      }

      const m = JOB_RE.exec(p);
      if (m) {
        const id = m[1]!;
        if (req.method === "GET" && !m[2]) {
          const job = o.manager.get(id);
          if (!job) throw new HttpError(404, "not_found", "job not found");
          return send(res, 200, job);
        }
        if (req.method === "POST" && m[2] === "/cancel") {
          const job = o.manager.cancel(id);
          if (!job) throw new HttpError(404, "not_found", "job not found");
          return send(res, 200, { jobId: job.jobId, status: job.status });
        }
        if (req.method === "GET" && m[2] === "/events") {
          const job = o.manager.get(id);
          if (!job) throw new HttpError(404, "not_found", "job not found");
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
          let unsub: (() => void) | undefined;
          const write = (v: JobView) => {
            res.write(`event: status\ndata: ${JSON.stringify(v)}\n\n`);
            if (TERMINAL_STATUSES.includes(v.status)) {
              unsub?.();
              res.end();
            }
          };
          unsub = o.manager.subscribe(id, write);
          req.on("close", () => unsub?.());
          write(job);
          return;
        }
      }
      throw new HttpError(404, "not_found", "route not found");
    } catch (e) {
      if (e instanceof HttpError) {
        const body: ApiError = { error: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) };
        return send(res, e.status, body, e.headers);
      }
      console.error("[compile-worker] internal error", e);
      return send(res, 500, { error: "internal", message: "internal error" });
    }
  });
}
