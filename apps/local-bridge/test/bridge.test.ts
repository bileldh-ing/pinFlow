import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createBridge, PORT_RE, type Exec } from "../src/bridge.js";

// No hardware: arduino-cli is replaced by a fake Exec. Upload against a real board is NOT tested.
const ORIGIN = "http://localhost:3000";
const boardList = JSON.stringify({
  detected_ports: [
    { port: { address: "/dev/ttyUSB0", protocol: "serial", label: "/dev/ttyUSB0" }, matching_boards: [{ name: "Arduino Uno", fqbn: "arduino:avr:uno" }] },
    { port: { address: "192.168.1.5", protocol: "network" } },
  ],
});

let close: (() => void) | undefined;
afterEach(() => close?.());

async function start() {
  const calls: Array<{ file: string; args: string[] }> = [];
  const fake: Exec = async (file, args) => {
    calls.push({ file, args });
    if (args.includes("board")) return { code: 0, stdout: boardList, stderr: "" };
    return { code: 0, stdout: "ok", stderr: "" };
  };
  const b = createBridge({ cliPath: "/usr/bin/arduino-cli", allowedOrigins: [ORIGIN], port: 0, exec: fake, pairingCode: "ABCD1234", log: () => {} });
  await b.listen();
  close = () => b.server.close();
  const url = `http://127.0.0.1:${(b.server.address() as AddressInfo).port}`;
  const req = async (method: string, p: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(url + p, {
      method,
      headers: { origin: ORIGIN, ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: r.status, body: (await r.json().catch(() => undefined)) as any };
  };
  return { b, req, calls };
}

describe("local bridge (arduino-cli faked; no hardware)", () => {
  it("refuses to bind to a non-loopback host", () => {
    const b = createBridge({ cliPath: "x", allowedOrigins: [], port: 0 });
    expect(() => b.listen("0.0.0.0")).toThrow(/loopback/);
  });

  it("rejects disallowed origins and unpaired requests", async () => {
    const { req } = await start();
    expect((await req("GET", "/boards", undefined, { origin: "https://evil.example" })).status).toBe(403);
    expect((await req("GET", "/boards")).status).toBe(401);
  });

  it("pairs once with the code, then lists serial boards via argument arrays", async () => {
    const { req, calls } = await start();
    expect((await req("POST", "/pair", { code: "WRONG" })).status).toBe(401);
    const ok = await req("POST", "/pair", { code: "abcd1234" });
    expect(ok.status).toBe(200);
    expect((await req("POST", "/pair", { code: "ABCD1234" })).status).toBe(410); // single use
    const boards = await req("GET", "/boards", undefined, { authorization: `Bearer ${ok.body.token}` });
    expect(boards.body.ports).toEqual([{ address: "/dev/ttyUSB0", label: "/dev/ttyUSB0", boards: [{ name: "Arduino Uno", fqbn: "arduino:avr:uno" }] }]);
    expect(calls[0]).toEqual({ file: "/usr/bin/arduino-cli", args: ["board", "list", "--json"] });
  });

  it("validates upload requests strictly and uses fixed argument arrays", async () => {
    const { req, calls } = await start();
    const { token } = (await req("POST", "/pair", { code: "ABCD1234" })).body;
    const H = { authorization: `Bearer ${token}` };
    const good = {
      fqbn: "arduino:avr:uno",
      port: "/dev/ttyUSB0",
      revisionId: "rev_1",
      confirm: true,
      files: [{ path: "blink.ino", content: "void setup(){}void loop(){}" }],
    };
    expect((await req("POST", "/upload", { ...good, confirm: false }, H)).body.error).toBe("confirmation_required");
    expect((await req("POST", "/upload", { ...good, port: "/dev/ttyUSB0; rm -rf /" }, H)).body.error).toBe("invalid_port");
    expect((await req("POST", "/upload", { ...good, port: "/etc/passwd" }, H)).body.error).toBe("invalid_port");
    expect((await req("POST", "/upload", { ...good, port: "/dev/ttyUSB7" }, H)).body.error).toBe("port_not_found");
    expect((await req("POST", "/upload", { ...good, fqbn: "x:y:z" }, H)).body.error).toBe("fqbn_not_allowed");
    expect((await req("POST", "/upload", { ...good, extraArgs: "--verbose" }, H)).body.error).toBe("unknown_field");
    expect((await req("POST", "/upload", { ...good, files: [{ path: "../x.ino", content: "" }] }, H)).body.error).toBe("invalid_files");
    const r = await req("POST", "/upload", good, H);
    expect(r.body).toMatchObject({ ok: true, phase: "upload", hardwareTested: false });
    const up = calls.find((c) => c.args.includes("upload"))!;
    expect(up.args.slice(0, 5)).toEqual(["upload", "--fqbn", "arduino:avr:uno", "--port", "/dev/ttyUSB0"]);
  });

  it("rejects non-loopback Host headers (DNS rebinding)", async () => {
    const { b } = await start();
    const port = (b.server.address() as AddressInfo).port;
    const status = await new Promise<number>((resolve) => {
      http.get({ host: "127.0.0.1", port, path: "/boards", headers: { host: "evil.example", origin: ORIGIN } }, (res) => resolve(res.statusCode ?? 0));
    });
    expect(status).toBe(421);
  });

  it("port regex", () => {
    for (const p of ["/dev/ttyUSB0", "/dev/ttyACM12", "COM3", "/dev/cu.usbserial-1410"]) expect(PORT_RE.test(p), p).toBe(true);
    for (const p of ["/dev/sda", "COM3 ", "../dev/ttyUSB0", "/dev/ttyUSB0\n", "/dev/cu.$(id)"]) expect(PORT_RE.test(p), p).toBe(false);
  });
});
