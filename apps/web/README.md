# PinFlow Studio — web app (`apps/web`)

Next.js 16 (App Router, Turbopack) + React 19 + Tailwind 4. Owns the UI, auth, persistence and the
synchronized Blockly ↔ Monaco workbench. Engine packages (`cpp-parser`, `arduino-codegen`,
`sync-engine`, `board-registry`) are consumed as workspace dependencies.

## Run

```bash
CI=1 pnpm install --store-dir /workspace/work/.pnpm-store --no-frozen-lockfile   # from repo root
cd apps/web
cp .env.example .env.local          # optional
pnpm dev                            # prepare-assets + next dev on :3000
# production
NODE_OPTIONS=--max-old-space-size=1536 pnpm build && pnpm start
```

`scripts/prepare-assets.mjs` (run by `dev` and `prebuild`) copies the tree-sitter WASM files to
`public/wasm/`, Monaco's AMD build to `public/monaco/vs/` (served locally, no CDN), and generates
`src/generated/templates.ts` (from `../../examples` + `./templates`) and
`src/generated/parser-coverage.ts` (from `docs/parser-coverage.md` when present).

## Test

```bash
pnpm test                                 # vitest: unit + real parser/codegen/sync/Blockly pipeline
pnpm --filter @pinflow/database test      # repositories against PGlite (in-memory)
pnpm --filter @pinflow/block-definitions test
pnpm build && pnpm test:e2e               # Playwright against `next start` (port 3100, own PGlite dir)
```

Playwright uses `/usr/bin/chromium` when present (set `PW_CHROMIUM_PATH` to override).

## Architecture notes

- **Data**: `@pinflow/database` (Drizzle). PGlite by default, `DATABASE_URL` switches to node-postgres.
  Every project query takes the acting user id; foreign projects return 404. Saves use
  `expectedRevision` optimistic concurrency → HTTP 409 → conflict dialog.
- **Auth**: scrypt (N=32768) hashes, random session tokens stored as SHA-256, httpOnly SameSite=Lax
  cookies, DB-backed fixed-window rate limits, single-use verify/reset tokens, dev mail outbox.
- **Workbench**: `src/components/workbench/engine.ts` wires Monaco, Blockly, the parser Web Worker
  (`src/workers/parser.worker.ts`, main-thread fallback) and `SyncCoordinator`. Undo/redo in both
  editors is routed to the coordinator's unified history.
- **Persistence**: autosave 1.5 s after edits, IndexedDB draft outbox (`src/lib/outbox.ts`) with
  recovery on reload, offline handling, never "Saved" before the server acknowledges.
- **Compile**: `POST /api/projects/:id/compile` saves-then-submits the exact saved revision to the
  compile worker, records revision + SHA-256 source hash; the UI marks results outdated when the
  current source hash differs.
