/**
 * PinFlow Local Bridge (spec 9.4) — minimal implementation.
 *
 *  - binds to loopback ONLY (127.0.0.1 / ::1); refuses other hosts
 *  - Host header must be loopback (DNS-rebinding defence)
 *  - Origin header must be in the allowlist for every request
 *  - pairing: the bridge prints a one-time 8-char code; the web app exchanges it at POST /pair
 *    for a short-lived bearer session token (single use, 5 min expiry, 5 attempts)
 *  - only GET /boards and POST /upload; no arbitrary commands, paths or flags
 *  - every arduino-cli call is execFile with an argument array and a timeout
 *
 * UPLOAD IS NOT HARDWARE-TESTED: no board was attached on the development machine.
 */
import { execFile } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PathValidationError, validateSketch, type ValidatedSketch } from "@pinflow/compile-worker/paths";

export const BRIDGE_FQBNS = new Set(["arduino:avr:uno", "arduino:avr:nano", "arduino:avr:mega", "esp32:esp32:esp32"]);
/** Serial port names we accept. Must ALSO be present in the current `board list` output. */
export const PORT_RE =
  /^(\/dev\/tty(USB|ACM)\d{1,3}|\/dev\/cu\.[A-Za-z0-9_.-]{1,64}|\/dev\/tty\.[A-Za-z0-9_.-]{1,64}|COM\d{1,3})$/;

export type Exec = (file: string, args: string[], timeoutMs: number) => Promise<{ code: number; stdout: string; stderr: string }>;

export const realExec: Exec = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, shell: false }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr || (err && !stdout ? err.message : "")) });
    });
  });

export interface BridgeOptions {
  cliPath: string;
  configFile?: string;
  allowedOrigins: string[];
  port: number;
  exec?: Exec;
  now?: () => number;
  pairingCode?: string;
  sessionTtlMs?: number;
  log?: (msg: string) => void;
}

class BridgeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const LOOPBACK_HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
const sha = (s: string) => createHash("sha256").update(s).digest();
const eq = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

export function createBridge(o: BridgeOptions) {
  const exec = o.exec ?? realExec;
  const now = o.now ?? Date.now;
  const log = o.log ?? ((m: string) => console.log(`[pinflow-bridge] ${m}`));
  let pairing: { code: string; expires: number; attempts: number } | null = {
    code: o.pairingCode ?? randomBytes(6).toString("base64url").slice(0, 8).toUpperCase(),
    expires: now() + 5 * 60_000,
    attempts: 0,
  };
  const sessions = new Map<string, number>(); // token -> expiry
  let busy = false;
  const base = o.configFile ? ["--config-file", o.configFile] : [];

  const send = (res: http.ServerResponse, status: number, body: unknown, origin?: string) => {
    const h: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" };
    if (origin) {
      h["access-control-allow-origin"] = origin;
      h["vary"] = "Origin";
    }
    res.writeHead(status, h);
    res.end(JSON.stringify(body));
  };

  async function readJson(req: http.IncomingMessage, max = 2 * 1024 * 1024): Promise<Record<string, unknown>> {
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) throw new BridgeError(415, "unsupported_media_type");
    let n = 0;
    const chunks: Buffer[] = [];
    for await (const c of req) {
      n += (c as Buffer).length;
      if (n > max) throw new BridgeError(413, "payload_too_large");
      chunks.push(c as Buffer);
    }
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
      return v as Record<string, unknown>;
    } catch {
      throw new BridgeError(400, "invalid_json");
    }
  }

  async function listBoards() {
    const r = await exec(o.cliPath, [...base, "board", "list", "--json"], 15_000);
    if (r.code !== 0) throw new BridgeError(502, "board_list_failed", r.stderr.slice(0, 500));
    const doc = JSON.parse(r.stdout || "{}");
    const ports = (doc.detected_ports ?? []) as Array<{
      port?: { address?: string; protocol?: string; label?: string };
      matching_boards?: Array<{ name?: string; fqbn?: string }>;
    }>;
    return ports
      .filter((p) => p.port?.protocol === "serial" && p.port.address)
      .map((p) => ({
        address: p.port!.address!,
        label: p.port!.label ?? p.port!.address!,
        boards: (p.matching_boards ?? []).map((b) => ({ name: b.name ?? "", fqbn: b.fqbn ?? "" })),
      }));
  }

  function validateUpload(body: Record<string, unknown>): { fqbn: string; port: string; revisionId: string; sketch: ValidatedSketch } {
    const allowedKeys = ["fqbn", "port", "files", "revisionId", "sketchName", "confirm"];
    if (Object.keys(body).some((k) => !allowedKeys.includes(k))) throw new BridgeError(400, "unknown_field");
    if (body.confirm !== true) throw new BridgeError(400, "confirmation_required", "upload must be explicitly confirmed by the user");
    if (typeof body.fqbn !== "string" || !BRIDGE_FQBNS.has(body.fqbn)) throw new BridgeError(400, "fqbn_not_allowed");
    if (typeof body.port !== "string" || !PORT_RE.test(body.port)) throw new BridgeError(400, "invalid_port");
    if (typeof body.revisionId !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(body.revisionId)) throw new BridgeError(400, "invalid_revision");
    try {
      const files = body.files;
      if (
        !Array.isArray(files) ||
        files.some((f) => typeof f?.path !== "string" || typeof f?.content !== "string" || Object.keys(f).length !== 2)
      ) {
        throw new PathValidationError("invalid files");
      }
      const sketch = validateSketch(files as Array<{ path: string; content: string }>, typeof body.sketchName === "string" ? body.sketchName : undefined);
      return { fqbn: body.fqbn, port: body.port, revisionId: body.revisionId, sketch };
    } catch (e) {
      throw new BridgeError(400, "invalid_files", (e as Error).message);
    }
  }

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const allowedOrigin = origin && o.allowedOrigins.includes(origin) ? origin : undefined;
    try {
      if (!LOOPBACK_HOST_RE.test(req.headers.host ?? "")) return send(res, 421, { error: "bad_host" });
      if (!allowedOrigin) return send(res, 403, { error: "origin_not_allowed" });
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": allowedOrigin,
          "access-control-allow-methods": "GET, POST",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-max-age": "600",
          vary: "Origin",
        });
        return res.end();
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "POST" && url.pathname === "/pair") {
        const body = await readJson(req, 1024);
        if (!pairing || now() > pairing.expires || pairing.attempts >= 5) {
          return send(res, 410, { error: "pairing_expired", message: "restart the bridge to get a new pairing code" }, allowedOrigin);
        }
        pairing.attempts++;
        if (typeof body.code !== "string" || !eq(body.code.toUpperCase(), pairing.code)) return send(res, 401, { error: "bad_code" }, allowedOrigin);
        pairing = null; // single use
        const token = randomBytes(32).toString("base64url");
        const ttl = o.sessionTtlMs ?? 8 * 3600_000;
        sessions.set(token, now() + ttl);
        log(`paired with ${allowedOrigin}`);
        return send(res, 200, { token, expiresInMs: ttl }, allowedOrigin);
      }
      const auth = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1];
      const exp = auth ? [...sessions.entries()].find(([t]) => eq(t, auth))?.[1] : undefined;
      if (!exp || exp < now()) return send(res, 401, { error: "unpaired" }, allowedOrigin);

      if (req.method === "GET" && url.pathname === "/boards") return send(res, 200, { ports: await listBoards() }, allowedOrigin);

      if (req.method === "POST" && url.pathname === "/upload") {
        const { fqbn, port, revisionId, sketch } = validateUpload(await readJson(req));
        const ports = await listBoards();
        if (!ports.some((p) => p.address === port)) throw new BridgeError(409, "port_not_found", "port is not currently connected");
        if (busy) throw new BridgeError(409, "busy");
        busy = true;
        const dir = await mkdtemp(path.join(os.tmpdir(), "pinflow-bridge-"));
        try {
          const sk = path.join(dir, sketch.sketchName);
          for (const f of sketch.files) {
            const target = path.resolve(sk, f.path);
            if (!target.startsWith(sk + path.sep)) throw new BridgeError(400, "invalid_files", "path escape");
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, f.content, { flag: "wx" });
          }
          const build = path.join(dir, "build");
          const compile = await exec(o.cliPath, [...base, "compile", "--fqbn", fqbn, "--build-path", build, "--no-color", sk], 180_000);
          if (compile.code !== 0) {
            return send(res, 200, { ok: false, phase: "compile", log: (compile.stdout + compile.stderr).slice(-20_000) }, allowedOrigin);
          }
          const upload = await exec(
            o.cliPath,
            [...base, "upload", "--fqbn", fqbn, "--port", port, "--input-dir", build, "--no-color", sk],
            120_000,
          );
          log(`upload ${revisionId} -> ${port} (${fqbn}): ${upload.code === 0 ? "ok" : "failed"}`);
          return send(
            res,
            200,
            { ok: upload.code === 0, phase: "upload", log: (upload.stdout + upload.stderr).slice(-20_000), hardwareTested: false },
            allowedOrigin,
          );
        } finally {
          busy = false;
          await rm(dir, { recursive: true, force: true });
        }
      }
      return send(res, 404, { error: "not_found" }, allowedOrigin);
    } catch (e) {
      if (e instanceof BridgeError) return send(res, e.status, { error: e.code, message: e.message }, allowedOrigin);
      return send(res, 500, { error: "internal", message: "internal error" }, allowedOrigin);
    }
  });

  return {
    server,
    get pairingCode() {
      return pairing?.code;
    },
    listen(host = "127.0.0.1") {
      if (!["127.0.0.1", "::1", "localhost"].includes(host)) throw new Error("the bridge only binds to loopback");
      return new Promise<void>((r) => server.listen(o.port, host, () => r()));
    },
  };
}
