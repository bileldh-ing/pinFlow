# PinFlow compile worker — security threat model

Scope: `apps/compile-worker` (server-side compilation, spec §9.3/§9.5/§12) and
`apps/local-bridge` (opt-in local upload, spec §9.4).

## 1. Honest statement of the current isolation level

**The compile worker in this repository provides PROCESS-LEVEL isolation only. It is NOT a
container, VM or seccomp sandbox.** It was built and tested on a shared Linux arm64 dev machine
without Docker or root. What it does today:

| Control | Implementation | File |
|---|---|---|
| No shell | `spawn(cmd, argv[], { shell: false })`; FQBN from an allowlist, sketch name regex-checked | `src/runner.ts` |
| Disposable workspace | per-job `mkdtemp` dir (`0700`), sketch + build + `TMPDIR` inside it, `rm -rf` before the job is reported terminal | `src/jobs.ts` |
| Path safety | strict relative-path validator (no `..`, absolute, backslash, drive letters, hidden segments, control chars, NFD, reserved names), extension allowlist, depth/size/count limits, case-insensitive duplicates; files opened `O_CREAT|O_EXCL|O_NOFOLLOW`; realpath containment check | `src/paths.ts`, `src/jobs.ts` |
| Symlinks/archives | the API accepts only `{path, content}` strings (strict zod schema) — symlinks, modes and archives cannot be expressed | `src/schema.ts` |
| Resource limits | `prlimit`: `RLIMIT_AS` 4 GiB, `RLIMIT_CPU` 300 s, `RLIMIT_FSIZE` 512 MiB, `RLIMIT_NOFILE` 1024, no core dumps; optional `RLIMIT_NPROC` (`COMPILE_RLIMIT_NPROC`, off by default because it counts every process of the uid) | `src/runner.ts`, `src/config.ts` |
| Wall clock | per-board timeout (60 s AVR, 120 s ESP32; `COMPILE_TIMEOUT_MS` override); whole process group SIGTERM→SIGKILL | `src/runner.ts`, `src/jobs.ts` |
| Concurrency / queue | `COMPILE_CONCURRENCY` (default 1), bounded queue (`COMPILE_MAX_QUEUE`, 503 when full) | `src/jobs.ts` |
| Output cap | 4 MiB captured, 64 KiB returned in the job view | `src/runner.ts`, `src/jobs.ts` |
| Env scrub | child env is exactly `PATH, HOME, TMPDIR, LC_ALL, LANG, GOMEMLIMIT, ARDUINO_METRICS_ENABLED, ARDUINO_UPDATER_ENABLE_NOTIFICATION` — no tokens, DB URLs or cloud credentials | `src/runner.ts` (tested) |
| Log redaction | temp dir, build dir, arduino data dir and repo root replaced by placeholders | `src/diagnostics.ts` |
| No dependency installs | compile never passes `--libraries`/`--library`; only preinstalled allowlisted libraries (lock file) exist; startup verification flags any extra library | `src/toolchain.ts` |
| AuthN | shared bearer token (`COMPILE_WORKER_TOKEN`, required unless `NODE_ENV=test`, ≥24 chars in production), SHA-256 + `timingSafeEqual` compare | `src/auth.ts` |
| Abuse | token bucket per token + `X-PinFlow-User-Id` (default 20 jobs/min), 2 MiB body limit, strict content-type | `src/server.ts` |
| Bind address | `HOST` defaults to `127.0.0.1` | `src/config.ts` |

### What process-level isolation does NOT protect against
- The compiler (and anything a malicious sketch can make GCC do — e.g. `#include "/etc/passwd"`
  to leak file contents into error messages) runs **as the worker's uid** and can **read any file
  that uid can read**. Absolute `#include` paths are not blocked by the path validator because they
  live inside file *contents*. Mitigation today: run the worker under a dedicated uid with nothing
  sensitive readable; production: container/VM (below).
- **No network isolation.** Compilation does not need network (cores/libs preinstalled), but nothing
  prevents a toolchain process from opening sockets.
- Shared arduino build cache (`.arduino-cache/build-cache`): `cores/` holds `core.a` archives keyed
  by core+FQBN+options and is writable by the compiler process → theoretical cache poisoning
  between tenants. The worker deliberately omits `--build-path` because arduino-cli 1.5 only reuses
  the core cache without it; each job's build then lands in `build-cache/sketches/<MD5(job sketch
  dir)>`, which the worker deletes after the job (also on cancel/timeout). Production: pre-warmed
  core cache per worker pool, ideally mounted read-only into a per-job sandbox.
- `RLIMIT_AS` is per process, not per job tree; total memory is bounded only by concurrency ×
  limit. `RLIMIT_NPROC` is per uid, so fork bombs are only bounded when it is enabled with a
  dedicated uid. Real fix: cgroups (`pids.max`, `memory.max`) via the container runtime.
- GCC itself is a large attack surface (parser bugs). Treat compiler compromise as "attacker
  has code execution as worker uid".

## 2. Assets and trust boundaries

Assets: other users' source code, the bearer token, production DB credentials (must never be on
the worker host), the toolchain (integrity), worker availability, the user's machine and boards
(bridge).

Boundaries: browser → web app (session auth) → compile worker (bearer token, internal network
only) → compiler process (untrusted code). Browser → local bridge (loopback, origin allowlist,
pairing token) → arduino-cli → USB device.

## 3. Threats (STRIDE-style) and mitigations

| # | Threat | Mitigation now | Production plan |
|---|---|---|---|
| T1 | Path traversal / absolute paths / symlinks in uploaded files write outside the job dir | validator + `O_NOFOLLOW|O_EXCL` + realpath check; tests with malicious names | same + read-only rootfs |
| T2 | Command/flag injection via FQBN, sketch name, file names | allowlist FQBN, regexes, argv arrays, no shell | same |
| T3 | Reading host secrets through `#include` or compiler plugins (`-fplugin` cannot be set by users; build flags are not user-controllable) | env scrub, no secrets on host, dedicated uid (recommended) | container with only the toolchain mounted, no secrets |
| T4 | Resource exhaustion (infinite template recursion, huge outputs, fork bombs) | wall-clock timeout, rlimits, output cap, concurrency=1, queue cap, rate limit | cgroups memory/pids/cpu, per-user quotas in API |
| T5 | Network exfiltration / SSRF to metadata service (169.254.169.254) | none at process level | egress deny-all NetworkPolicy, `--network none` per job sandbox |
| T6 | Cross-tenant leakage via temp dirs | unique `mkdtemp` 0700 dirs deleted before result is published; source dropped from memory after the job | per-job sandbox, tmpfs |
| T7 | Toolchain supply chain | pinned versions + CLI sha256 in `toolchain.lock.json`; startup verification; never installs from user input | build toolchain image in CI, sign image, scan, read-only mount |
| T8 | Token theft / brute force | constant-time compare, long random token, worker on loopback/internal net; client is server-side only | mTLS or short-lived signed job tokens from the API, rotation |
| T9 | Log leakage (paths, secrets) | redaction of temp/cache/repo paths; env never printed | central log scrubbing |
| T10 | Bridge abused by malicious websites (CSRF, DNS rebinding) | loopback bind only, Host header check, Origin allowlist, one-time pairing code → bearer session, strict upload schema, port must be currently detected, explicit `confirm: true` | signed bridge releases, OS keychain for session |

## 4. Production isolation plan

1. **Per-job disposable sandbox**: implement `SandboxedRunner` (same `CompileRunner` interface) that
   runs `arduino-cli compile` inside **gVisor (`runsc`)** or a **Firecracker microVM** with:
   rootless/non-root uid, read-only toolchain image, tmpfs work dir, `--network none`,
   `pids.max=256`, `memory.max=2–3 GiB`, CPU quota, seccomp default profile, no capabilities,
   `no_new_privs`.
2. **Worker container** (`infra/docker/compile-worker.Dockerfile`, *written but not built here —
   no Docker on the dev machine*): non-root uid 10001, read-only rootfs, tini, prlimit, healthcheck.
3. **Network**: worker reachable only from the API service; **egress deny-all**; block cloud
   metadata; no DB credentials or service-account tokens mounted.
4. **Quotas**: per-user/day compile quotas and job retention enforced in the API (DB), not only
   the in-memory token bucket.
5. **Toolchain image** built in CI from `toolchain.lock.json`, scanned and signed; workers recycled
   regularly.

## 5. Residual risks accepted for the MVP
Process-level isolation on a single-tenant/dev deployment; in-memory job store (jobs lost on
restart, 1 h retention); shared bearer token. These must be addressed before multi-tenant launch.
