import { loadConfig } from "./config.js";
import { createWorker } from "./worker.js";

const cfg = loadConfig();
const worker = createWorker(cfg);
worker.server.listen(cfg.port, cfg.host, () => {
  console.log(
    `[compile-worker] listening on http://${cfg.host}:${cfg.port} (concurrency=${cfg.concurrency}, auth=${cfg.token ? "bearer" : "DISABLED (NODE_ENV=test)"})`,
  );
  console.log("[compile-worker] isolation: process-level only (temp dir, rlimits, timeouts, env scrub, no shell) — NOT a container");
});
void worker.verification.then((v) =>
  console.log(`[compile-worker] toolchain ${v.ok ? "verified against toolchain.lock.json" : "NOT fully verified: " + v.problems.join("; ")}`),
);
const shutdown = () => {
  console.log("[compile-worker] shutting down");
  void worker.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
