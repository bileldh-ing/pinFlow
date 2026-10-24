#!/bin/sh
# Run Playwright e2e against a production `next start` on :3100 with a fresh PGlite dir.
# usage: infra/scripts/run-e2e.sh [spec...]   (build first: cd apps/web && pnpm build)
# Pass DATABASE_URL to run against PostgreSQL, COMPILE_WORKER_URL/TOKEN + E2E_COMPILE=1 for real compiles.
set -u
cd "$(dirname "$0")/../../apps/web"
if curl -s -o /dev/null http://localhost:3100/; then echo "port 3100 already in use - refusing to test a stale server"; exit 2; fi
rm -rf .pglite-data-e2e   # signup rate limits (20/h per IP) are DB-backed
mkdir -p test-results
PGLITE_DIR=.pglite-data-e2e COOKIE_SECURE=0 PINFLOW_DEV_OUTBOX=1 NODE_OPTIONS=--max-old-space-size=640 ./node_modules/.bin/next start -p 3100 > test-results/e2e-server.log 2>&1 &
SP=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3100/signup && break; sleep 2; done
E2E_BASE_URL=http://localhost:3100 ./node_modules/.bin/playwright test "$@"
R=$?
pkill -P $SP 2>/dev/null; kill $SP 2>/dev/null
exit $R
