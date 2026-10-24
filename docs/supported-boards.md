# Supported boards (compile worker)

Source of truth: `apps/compile-worker/toolchain.lock.json` (the worker's FQBN allowlist is read
from its `boards` array). Anything else is rejected with `400 fqbn_not_allowed`.

| Board | FQBN | Core (pinned) | Default timeout | Verified here |
|---|---|---|---|---|
| Arduino Uno | `arduino:avr:uno` | `arduino:avr@1.8.8` (avr-gcc 7.3.0-atmel3.6.1-arduino7) | 60 s | real compile: `blink-uno`, plus failing fixtures `broken-uno`, `missing-header-uno`, `linker-error-uno` |
| Arduino Nano (ATmega328P) | `arduino:avr:nano` | `arduino:avr@1.8.8` | 60 s | allowlisted; same core/toolchain as Uno, no dedicated fixture compile yet |
| Arduino Mega / Mega 2560 | `arduino:avr:mega` | `arduino:avr@1.8.8` | 60 s | used in the real-compile cancellation test (the job is canceled, so a full Mega build is not asserted) |
| ESP32 Dev Module | `esp32:esp32:esp32` | `esp32:esp32@3.3.12` (esp-x32 2601 / xtensa-esp-elf gcc 14.2.0) | 120 s (warm cache only; cold build 11–18 min on the dev box) | real compile: `dht11-esp32` with DHT sensor library 1.4.7 succeeded (worker run + direct CLI run); later re-runs OOM-killed by host |

Measured on the dev machine (arm64, 2 vCPU): `blink-uno` on Uno → flash 924 / 32 256 B (2 %),
RAM 9 / 2 048 B; `dht11-esp32` on ESP32 Dev → flash 274 084 / 1 310 720 B (20 %), RAM 22 132 /
327 680 B (6 %). A cold ESP32 build (core not yet cached) took 11–18 min here — far above the
120 s timeout — so the core cache must be pre-warmed (see docs/compile-worker.md §5).

Board options (e.g. `:cpu=atmega328old`, ESP32 partition schemes) are **not** accepted yet: the
FQBN must match the allowlist exactly. Adding options means adding explicit, tested entries.

Allowlisted libraries (preinstalled, never installed on demand):
- DHT sensor library 1.4.7 (Adafruit)
- Adafruit Unified Sensor 1.1.15

Toolchain: arduino-cli 1.5.1 (Linux ARM64 asset sha256 recorded in the lock file).

Upload support: none in the compile worker. Upload is a local-bridge operation and has **not been
hardware-tested** (see `docs/local-bridge.md`).

## Adding a board
1. Add the core to `platforms` (exact version) and the board to `boards` in `toolchain.lock.json`.
2. Run `infra/scripts/setup-arduino-toolchain.sh`.
3. Add a fixture under `fixtures/compile/<name>/<name>.ino` and a real-compile test in
   `apps/compile-worker/test/integration.test.ts`; record measured flash/RAM here.
