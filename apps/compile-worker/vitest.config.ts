import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
    // real compiles are CPU/memory heavy: never run test files in parallel
    fileParallelism: false,
  },
});
