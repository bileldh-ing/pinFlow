import { createBridge } from "./bridge.js";

const port = Number(process.env.PINFLOW_BRIDGE_PORT ?? 4180);
const origins = (process.env.PINFLOW_BRIDGE_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const bridge = createBridge({
  cliPath: process.env.ARDUINO_CLI_PATH ?? "arduino-cli",
  configFile: process.env.ARDUINO_CLI_CONFIG,
  allowedOrigins: origins,
  port,
});
await bridge.listen("127.0.0.1");
console.log(`[pinflow-bridge] listening on http://127.0.0.1:${port} — allowed origins: ${origins.join(", ")}`);
console.log(`[pinflow-bridge] pairing code (valid 5 minutes, single use): ${bridge.pairingCode}`);
console.log("[pinflow-bridge] NOTE: upload has NOT been tested against real hardware yet.");
