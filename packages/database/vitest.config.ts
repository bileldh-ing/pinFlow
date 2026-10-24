import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"], environment: "node", testTimeout: 60000, hookTimeout: 110000, fileParallelism: false } });
