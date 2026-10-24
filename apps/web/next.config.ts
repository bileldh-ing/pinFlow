import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@pinflow/arduino-ir", "@pinflow/cpp-parser", "@pinflow/arduino-codegen", "@pinflow/sync-engine",
    "@pinflow/board-registry", "@pinflow/block-definitions", "@pinflow/database", "@pinflow/compile-worker",
  ],
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};
export default config;
