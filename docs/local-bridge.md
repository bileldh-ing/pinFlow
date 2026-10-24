# PinFlow Local Bridge — design (spec §9.4)

Status: design + minimal implementation in `apps/local-bridge` (board discovery and
compile-and-upload through the user's own arduino-cli). **Upload has NOT been tested with real
hardware** — no board was attached on the development machine; tests replace arduino-cli with a
fake executor.

## Goals
- Upload is opt-in, local and visible. The default PinFlow mode is "compile only".
- The web UI can never pass arbitrary commands, flags, paths or shell snippets.
- Works without cloud involvement: the bridge talks to the browser over loopback HTTP.

## Process model
```
Browser (app origin) ──HTTPS── PinFlow web app (cloud)
   │
   └─ fetch http://127.0.0.1:4180  (CORS, Origin allowlist, Bearer session)
          PinFlow Bridge (Node, user's machine, user's privileges)
            └─ execFile(arduino-cli, [fixed argv…], timeout)   ── USB serial ── board
```

## Security controls
| Control | Detail |
|---|---|
| Loopback only | `listen("127.0.0.1")`; `listen()` throws for any non-loopback host |
| DNS rebinding | `Host` header must be `127.0.0.1`, `localhost` or `[::1]` (+port), else 421 |
| Origin allowlist | `PINFLOW_BRIDGE_ORIGINS` (default `http://localhost:3000`); every request without an allowed `Origin` → 403; CORS headers only echo allowed origins |
| Pairing | on start the bridge prints an 8-char one-time code (5 min, 5 attempts, single use). `POST /pair {code}` returns a random 256-bit bearer session (8 h). Codes and tokens are compared via SHA-256 + `timingSafeEqual` |
| Strict operations | only `GET /boards` and `POST /upload`; unknown JSON fields → 400 |
| FQBN allowlist | same four FQBNs as the compile worker |
| Port validation | regex (`/dev/ttyUSB*`, `/dev/ttyACM*`, `/dev/cu.*`, `/dev/tty.*`, `COM*`) **and** the port must appear in a fresh `arduino-cli board list --json` |
| Files | same validator as the compile worker (`@pinflow/compile-worker/paths`); written with `wx` into a fresh `mkdtemp` dir, deleted afterwards |
| Explicit confirmation | `confirm: true` must be present; the UI must show board, port, revision, FQBN and operation before sending |
| No shell | `execFile` with argv arrays, timeouts (board list 15 s, compile 180 s, upload 120 s) |
| One at a time | concurrent uploads → 409 `busy` |

## API
`POST /pair` `{ "code": "ABCD1234" }` → `200 { "token": "…", "expiresInMs": 28800000 }`

`GET /boards` (Bearer) → `200 { "ports": [{ "address": "/dev/ttyUSB0", "label": "…", "boards": [{ "name": "Arduino Uno", "fqbn": "arduino:avr:uno" }] }] }`

`POST /upload` (Bearer)
```json
{ "fqbn": "arduino:avr:uno", "port": "/dev/ttyUSB0", "revisionId": "rev_42", "confirm": true,
  "files": [{ "path": "blink.ino", "content": "…" }], "sketchName": "blink" }
```
→ `200 { "ok": true|false, "phase": "compile"|"upload", "log": "…", "hardwareTested": false }`.
Errors: `400 confirmation_required|fqbn_not_allowed|invalid_port|invalid_files|unknown_field`,
`409 port_not_found|busy`, `401 unpaired`, `403 origin_not_allowed`, `421 bad_host`.

The bridge compiles locally before uploading (arduino-cli `compile --build-path` then
`upload --input-dir`), so no binary artifacts have to be shipped from the cloud worker. The
cloud compile result remains the source of truth for diagnostics; the bridge's compile uses the
user's locally installed cores, which may differ — the UI must show the bridge's versions.

## Running
```
ARDUINO_CLI_PATH=$(which arduino-cli) PINFLOW_BRIDGE_ORIGINS=http://localhost:3000 \
  pnpm --filter @pinflow/local-bridge start
```

## Not done / next steps
- Hardware acceptance tests (spec §15.6): Uno over `/dev/ttyACM0`, ESP32 DevKit over CP210x —
  including ESP32 boot-mode failures and recovery instructions.
- Progress streaming (SSE) for upload; currently one response at the end.
- Packaging (signed installers), auto-start, OS keychain storage of the session, user-visible
  tray UI showing the pairing code and an audit log of uploads.
- Web Serial / WebUSB alternative for browsers that support it, so the bridge becomes optional.
