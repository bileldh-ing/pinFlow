# Implementation status (updated 2026-10-24, i18n release)

Statuses: `implemented-and-tested`, `implemented-but-not-fully-tested`, `partial`, `blocked`.

| Feature | Status | Evidence / limitation |
|---|---|---|
| IR contract + utilities | implemented-and-tested | packages/arduino-ir; additive changes in docs/ir-changes.md |
| Tree-sitter C++ -> IR parser (subset v1) | implemented-and-tested | 129 tests in cpp-parser: 15 golden fixtures (spec 15.2), round-trip, fixed point, raw byte-identical, CRLF, UTF-8, malformed, stable IDs, fast-check properties |
| Raw/advanced C++ preservation | implemented-and-tested | Golden fixtures 11-12, property tests, web e2e (preserved block survives block edit) |
| Code generator + source maps | implemented-and-tested | arduino-codegen 8 tests + parser round-trip suite |
| Sync coordinator (origin, stale discard, last-good IR, unified undo) | implemented-and-tested | sync-engine 14 tests + parser/coordinator integration property |
| Board profiles + pin warnings (ESP32 Dev, Uno, Nano) | implemented-and-tested | board-registry 15 tests |
| DHT library pack + dependency detection | implemented-and-tested | board-registry tests; versions from upstream library.properties |
| Blockly blocks, toolbox search, IR<->workspace adapter | implemented-and-tested | block-definitions 17 tests (headless Blockly) |
| Database (Drizzle, PGlite / Postgres), tenant isolation, optimistic concurrency, revisions | implemented-and-tested | database 14 tests (PGlite); also passes on real PostgreSQL 17 via DATABASE_URL |
| Auth (scrypt, DB sessions, rate limit, verify email, reset password) | implemented-but-not-fully-tested | unit tests + e2e signup; email is a dev outbox, SMTP not wired |
| Landing, docs, templates, dashboard, history, settings (warm liquid-glass redesign, docs/design-system.md) | implemented-and-tested | Playwright main suite passed (workbench flow, access control, no-worker, flows.spec: onboarding, all 7 templates, rename/duplicate/trash/delete, history restore, ZIP export, .ino import, theme, layouts, phone tabs; screenshots spec); same suite passed on PostgreSQL 17 |
| Workbench: Blockly + Monaco split, live two-way sync, syntax-error banner, autosave, IndexedDB recovery, conflict dialog, export .ino/ZIP | implemented-and-tested | web unit 28 tests incl. real pipeline test; e2e full DHT11 flow |
| Compile worker (arduino-cli 1.5.1, avr 1.8.8, esp32 3.3.12) | implemented-and-tested | 79 tests; real compiles: Blink Uno 924 B flash; DHT11 ESP32 274,084 B flash (compiled twice; ESP32 tests opt-in because host OOM) |
| Compile from the web UI end to end | implemented-and-tested | tests/e2e/compile-real.spec.ts passed against the real worker (Blink on arduino:avr:uno compiles, marked outdated after edit; undeclared-function sketch shows compile error) |
| Compile sandbox | partial | process-level isolation only (temp dir, rlimits, timeout, env scrub, no shell). Container/gVisor plan + untested Dockerfile in infra/docker |
| Local bridge + upload | partial | apps/local-bridge, 6 tests with fake CLI; NOT hardware-tested, upload disabled in UI |
| Multi-file sketch editing | partial | other files preserved untouched; only main .ino is edited |
| CI workflow | partial | see .github/workflows/ci.yml (not run on GitHub yet) |
| Internationalization: English (default/fallback), French, Arabic (RTL) for all UI, auth/server messages, onboarding, dashboard, templates, settings, docs page, workbench chrome, every Blockly block (labels, dropdown captions, tooltips, context menus), toolbox categories and block search (active language + English); Blockly core messages; RTL Blockly workspace for Arabic; Noto Sans Arabic | implemented-and-tested | web unit i18n.test.ts (17: dictionary completeness/placeholders, negotiation, templates, docs anchors, byte-identical codegen for all 7 templates across en→fr→ar→en); block-definitions i18n.test.ts (14); e2e i18n.spec.ts (3). Legal pages + parser coverage reference stay English with a note; parser/board/compiler diagnostic texts (from packages) stay English |
| Language switcher (globe + code, radio menu with check) and light/dark/system theme menu in site header, auth/onboarding headers, app header and workbench top bar | implemented-and-tested | Radix dropdown (keyboard + aria), cookie + localStorage, server-rendered lang/dir, Blockly + Monaco themes switch live; e2e i18n.spec.ts + flows.spec.ts theme test |
| Pricing/billing, collaboration, AI tutor | not started (optional per spec) | |

## Known issues
- ID-matching parse p95 reached 177 ms under heavy host load (target 150 ms); see docs/performance.md.
- First ESP32 build takes 11–18 min on a 2-CPU host; production must pre-warm the core cache.
- Ambiguous C++ (`(a) + b`, `a < b > (c)`) is kept as raw code rather than guessed.

## Test totals (2026-10-24, after i18n)
cpp-parser 129, arduino-codegen 8, sync-engine 14, board-registry 15, block-definitions 31 (+14 i18n), database 15, compile-worker 79 (+2 ESP32 opt-in skipped), local-bridge 6, web 47 (+17 i18n) — 344 unit tests. Typecheck clean; next build succeeds. Playwright main suite 10/10: workbench.spec 3, flows.spec 4, i18n.spec 3 (compile-real and screenshots specs are opt-in).
