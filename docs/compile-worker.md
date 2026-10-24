# PinFlow compile worker (`apps/compile-worker`)

Real Arduino compilation service (spec §9.3, §9.5, §15.4). TypeScript on Node 22, run with
`tsx`, plain `node:http`, zod validation. Calls the pinned **arduino-cli 1.5.1** with
**arduino:avr 1.8.8** and **esp32:esp32 3.3.12**; libraries **DHT sensor library 1.4.7** and
**Adafruit Unified Sensor 1.1.15** (all recorded in `apps/compile-worker/toolchain.lock.json`).

> **Isolation is process-level only** (temp dir, rlimits via `prlimit`, wall-clock timeout,
> scrubbed env, no shell, output cap). It is **not** a container. See
> `docs/security-threat-model.md` for what that does and does not protect against and for the
> production plan (gVisor/Firecracker per job, egress deny).

## 1. Install the toolchain (once, needs network)
```bash
infra/scripts/setup-arduino-toolchain.sh          # → <repo>/.arduino-cache (gitignored)
```
Installs arduino-cli (sha256-verified), writes `.arduino-cache/arduino-cli.yaml`
(data/downloads/user/build-cache dirs inside `.arduino-cache`, metrics off), installs the pinned
cores and libraries. The ESP32 core is ~2 GB; on small machines run it detached and poll.

## 2. Start the worker
```bash
cd apps/compile-worker
COMPILE_WORKER_TOKEN="$(openssl rand -hex 24)" PORT=4100 pnpm start
# → [compile-worker] listening on http://127.0.0.1:4100 …
curl -s localhost:4100/health
```

| Env | Default | Meaning |
|---|---|---|
| `COMPILE_WORKER_TOKEN` | — (**required** unless `NODE_ENV=test`; ≥24 chars when `NODE_ENV=production`) | shared bearer token |
| `PORT` / `HOST` | `4100` / `127.0.0.1` | listen address |
| `ARDUINO_CACHE_DIR` | `<repo>/.arduino-cache` | toolchain root (`bin/arduino-cli`, `arduino-cli.yaml`) |
| `ARDUINO_CLI_PATH`, `ARDUINO_CLI_CONFIG` | derived from cache dir | override binary/config |
| `ARDUINO_BUILD_CACHE_DIR` | `<cache>/build-cache` | must equal `build_cache.path` in the yaml |
| `COMPILE_HOME_DIR` | `<cache>/home` | `HOME` for the compiler process |
| `COMPILE_WORK_ROOT` | `os.tmpdir()` | where per-job `pinflow-job-*` dirs are created |
| `COMPILE_CONCURRENCY` | `1` | parallel compiles |
| `COMPILE_MAX_QUEUE` | `16` | queued jobs before `503 queue_full` |
| `COMPILE_TIMEOUT_MS` | per board: 60 000 AVR, 120 000 ESP32 | wall clock override for all boards |
| `COMPILE_RATE_LIMIT_PER_MIN` | `20` | per token + `X-PinFlow-User-Id` |
| `COMPILE_MAX_OUTPUT_BYTES` / `COMPILE_LOG_VIEW_BYTES` | 4 MiB / 64 KiB | captured / returned log |
| `COMPILE_JOB_RETENTION_MS` | 1 h | in-memory job retention |
| `COMPILE_RLIMIT_AS_BYTES`, `_CPU_SECONDS`, `_FSIZE_BYTES`, `_NOFILE`, `_NPROC` | 4 GiB, 300 s, 512 MiB, 1024, unset | rlimits via `prlimit` (`COMPILE_DISABLE_PRLIMIT=1` to skip) |
| `COMPILE_USE_BUILD_PATH` | unset | `1` = pass `--build-path` (disables core cache, see §5) |
| `COMPILE_JOBS` | `1` | arduino-cli `--jobs N` (1 bounds peak RAM; `0` = all CPUs) |

The web app talks to it server-side only (`COMPILE_WORKER_URL`, `COMPILE_WORKER_TOKEN`). A typed
client is exported at `@pinflow/compile-worker/client` (`submitJob`, `getJob`, `cancelJob`,
`waitForJob`, `createCompileWorkerClient`); types at `@pinflow/compile-worker/types`.

## 3. API contract
All routes except `GET /health` require `Authorization: Bearer <token>`. Errors are
`{ "error": "<code>", "message": "…", "details"?: … }`.

### `POST /jobs` → `202 { "jobId": "uuid", "status": "queued" }`
```json
{
  "projectId": "proj_1",            // string id ([A-Za-z0-9_.:-]{1,128}) or non-negative integer
  "revisionId": 42,                 // same; echoed back as a string
  "fqbn": "esp32:esp32:esp32",      // allowlist: arduino:avr:uno|nano|mega, esp32:esp32:esp32
  "files": [ { "path": "dht11.ino", "content": "…" }, { "path": "src/util.cpp", "content": "…" } ],
  "sourceHash": "sha256:…",        // client hash, echoed back for "outdated" detection
  "sketchName": "dht11"             // optional; required only with several root .ino files
}
```
File rules: relative POSIX paths, no `..`/`.`/hidden/absolute/backslash/drive/control chars,
NFC, depth ≤ 4, ≤ 160 chars, extensions `.ino .cpp .c .h .hpp`, `.ino` only at the root, main
file `<sketchName>.ino` must exist (sketch dir name = main .ino), ≤ 32 files, ≤ 256 KiB each,
≤ 1 MiB total, no case-insensitive duplicates, no NUL bytes. Unknown fields are rejected.

Errors: `400 invalid_request` (schema), `400 fqbn_not_allowed` (`details.allowed`),
`400 invalid_files` (`details.path`), `401 unauthorized`, `413 payload_too_large` (> 2 MiB),
`415 unsupported_media_type`, `429 rate_limited` (`Retry-After`), `503 queue_full`.

### `GET /jobs/:id` → `200 JobView`
```json
{
  "jobId": "…", "projectId": "proj_1", "revisionId": "42", "fqbn": "esp32:esp32:esp32",
  "sketchName": "dht11-esp32", "sourceHash": "sha256:abc", "computedSourceHash": "sha256:<64 hex>",
  "status": "queued|preparing|compiling|succeeded|failed|canceled|timeout",
  "createdAt": "ISO", "startedAt": "ISO", "finishedAt": "ISO", "durationMs": 12345, "exitCode": 0,
  "diagnostics": [ { "severity": "error|warning|note|info", "message": "…", "file": "broken-uno.ino",
                     "line": 10, "column": 29, "external": true?, "source": "compiler|linker|arduino-cli",
                     "raw": "broken-uno.ino:10:29: error: …" } ],
  "sizes": { "flash": { "used": 274084, "percent": 20, "max": 1310720 },
             "ram":   { "used": 22132, "percent": 6, "max": 327680, "freeForLocals": 305548 } },
  "toolchain": { "arduinoCli": "1.5.1", "platform": { "id": "esp32:esp32", "version": "3.3.12" },
                 "libraries": [ … allowlisted … ], "buildPlatform": { … as reported by the CLI … },
                 "usedLibraries": [ { "name": "DHT sensor library", "version": "1.4.7" }, … ],
                 "verified": true },
  "log": { "text": "<redacted raw output, ≤ 64 KiB>", "truncated": false, "bytes": 72577 },
  "error": "human-readable reason (failed/canceled/timeout)"
}
```
`computedSourceHash` = `sha256` over files sorted by path, each as `path \0 content \0`.
`diagnostics[].file` is the user's relative path; locations in cores/libraries carry
`external: true` and a redacted path (`<arduino-data>/…`). Temp dirs, the cache dir and the repo
root are redacted from `log.text`.

### `POST /jobs/:id/cancel` → `200 { "jobId", "status" }`
Queued jobs become `canceled` immediately; running jobs get their process group killed
(SIGTERM, SIGKILL after 2 s). Terminal jobs are returned unchanged. Unknown id → 404.

### `GET /jobs/:id/events` (SSE)
`event: status` with the full `JobView` on every state change; the stream ends at a terminal state.

### `GET /health` (no auth)
`{ ok, toolchainVerified, platforms: { "arduino:avr": true, "esp32:esp32": true }, isolation, queued, running, jobs }`.

## 4. Execution pipeline
1. zod schema → FQBN allowlist → path validator → rate limit / queue.
2. `preparing`: `mkdtemp(<work>/pinflow-job-XXXX)`; `<job>/<sketchName>/…` written with
   `O_CREAT|O_EXCL|O_NOFOLLOW`; `<job>/tmp` is the compiler's `TMPDIR`.
3. `compiling`: `prlimit --core=0 --as=… --cpu=… --fsize=… --nofile=… -- arduino-cli
   --config-file … compile --fqbn <fqbn> --warnings default --no-color --json <sketchDir>`
   via `spawn` (argv array, `shell:false`, detached process group, scrubbed env).
4. The `--json` document gives `compiler_out/err`, `executable_sections_size`, `build_platform`,
   `used_libraries`, `build_path`; text is parsed into diagnostics and flash/RAM sizes.
5. The job dir **and** the per-sketch build dir (`<build_cache>/sketches/<MD5(sketch dir)>`) are
   deleted, then the terminal status is published.

## 5. Performance notes and ESP32 status (measured on the dev box: Linux arm64, 2 vCPU, shared with other agents, JuiceFS, RAM-backed /tmp)
- `blink-uno` (`arduino:avr:uno`) through the worker: 5–13 s end-to-end, flash 924 B / 32 256 (2 %),
  RAM 9 B / 2 048 (0 %). All AVR integration tests pass (blink, broken sketch, missing header,
  linker error, real cancel).
- `dht11-esp32` (`esp32:esp32:esp32`): **compiled successfully with the real CLI** —
  flash 274 084 B / 1 310 720 (20 %), RAM 22 132 B / 327 680 (6 %), `usedLibraries` = DHT sensor
  library 1.4.7 + Adafruit Unified Sensor 1.1.15:
  - once **through the worker** (first integration run, 660 s, cold core, at that time with
    `--build-path` and gcc jobs = CPUs) — all 6 integration tests passed in that run;
  - once **directly** with `arduino-cli compile --jobs 1` (1083 s cold; output in
    `fixtures/compile/captured/dht11-esp32.cli.txt`).
  Later integration re-runs of the ESP32 tests were **OOM-killed by the host kernel** (dmesg shows
  host-wide OOM kills of arduino-cli, java, dart, postgres from other agents; ~0.3–1.3 GB free,
  `/tmp` is RAM-backed). The worker now reports this as
  `compiler was killed by SIGKILL (likely out of memory on the worker host)`. The ESP32
  integration test is therefore **not green on the final run** on this host; it is environmental,
  not a code failure, but it was not re-proven after the last changes (`--jobs 1` default,
  no `--build-path`, GOMEMLIMIT).
- Cold ESP32 builds (core not cached) take 11–18 min here, far above the 120 s production timeout.
  arduino-cli 1.5 only reuses its cached `core.a` (`build_cache/cores`) when **no** `--build-path`
  is passed, so the worker omits it by default and deletes the CLI's per-sketch build dir
  (`build_cache/sketches/<MD5(sketch dir)>`) itself. The core cache key includes compile flags, so
  the cache must be warmed with the worker's exact flags (`--warnings default`); the production
  image pre-warms it at build time. The warm-rebuild test (< 120 s) exists but could not complete
  on this host.
- Default `COMPILE_JOBS=1` bounds peak RAM (one cc1plus at a time). Put `COMPILE_WORK_ROOT` on disk
  when `/tmp` is RAM-backed.

## 6. Tests
```bash
cd apps/compile-worker
pnpm test:unit          # paths, FQBN allowlist, diagnostics (captured real outputs), auth,
                        # rate limit, queue, timeout & cancel (TEST-ONLY fake runner), real
                        # process runner (env scrub, prlimit, group kill, output cap)
pnpm test:integration   # real arduino-cli compiles: blink-uno, broken-uno (diagnostic file+line),
                        # missing-header-uno, linker-error-uno, real cancel
PINFLOW_INTEGRATION_ESP32=1 pnpm test:integration   # + dht11-esp32 (needs ~1-2 GB free RAM;
                        # 11-18 min with a cold core cache) and the warm-rebuild < 120 s check
```
Integration tests skip with a printed reason only when the CLI/cores are missing. Captured CLI
outputs live in `fixtures/compile/captured/` (regenerate with
`infra/scripts/capture-compile-outputs.sh text|json <sketch…>`).

## 7. Known limitations
- Process-level isolation only (see threat model). Shared core cache is writable by jobs.
- In-memory job store; jobs are lost on restart; single worker instance.
- No board options in FQBNs; Nano is allowlisted without its own fixture run.
- Cold ESP32 builds take minutes on small hosts; pre-warm the cache.
- Upload is not part of this service (see `docs/local-bridge.md`, not hardware-tested).
