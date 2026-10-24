import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initParser, parseSketch } from "../../cpp-parser/src/index";
import { DHT_PACK, detectDependencies, getBoard, getPin, listBoards, validatePins, validateSketch, type Diagnostic } from "../src/index";

beforeAll(async () => {
  await initParser();
});

const ESP32 = "esp32:esp32:esp32";
const UNO = "arduino:avr:uno";
const sketch = (body: string, globals = "") => parseSketch(`${globals}\nvoid setup() {\n}\nvoid loop() {\n${body}\n}\n`).file;
const codes = (d: Diagnostic[]) => d.map((x) => x.code).sort();
const EX = join(__dirname, "../../../examples");

describe("board profiles", () => {
  it("lists versioned ESP32 Dev Module, Uno and Nano profiles", () => {
    expect(listBoards().map((b) => b.fqbn)).toEqual([ESP32, UNO, "arduino:avr:nano"]);
    for (const b of listBoards()) expect(b.profileVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(getBoard("esp32:esp32:esp32:UploadSpeed=921600")?.id).toBe("esp32-dev-module");
    expect(getBoard("foo:bar:baz")).toBeUndefined();
  });
  it("ESP32 pin metadata", () => {
    const b = getBoard(ESP32)!;
    for (const g of [34, 35, 36, 39]) expect(getPin(b, g)!.inputOnly).toBe(true);
    for (const g of [0, 2, 5, 12, 15]) expect(getPin(b, g)!.strapping).toBe(true);
    for (const g of [6, 7, 8, 9, 10, 11]) expect(getPin(b, g)!.flash).toBe(true);
    expect(getPin(b, 4)!.capabilities).toContain("adc2");
    expect(getPin(b, 32)!.capabilities).toContain("adc1");
    expect(getPin(b, 24)).toBeUndefined();
    expect(b.analogWrite.note).toMatch(/3\.x/);
  });
  it("Uno pin metadata", () => {
    const b = getBoard(UNO)!;
    expect(b.pins.filter((p) => p.capabilities.includes("pwm")).map((p) => p.gpio)).toEqual([3, 5, 6, 9, 10, 11]);
    expect(b.constants.A0).toBe(14);
    expect(b.constants.A5).toBe(19);
    expect(getPin(b, 0)!.serial).toBe(true);
    expect(getPin(b, 1)!.serial).toBe(true);
  });
});

describe("validatePins (advisory, with certainty + explanation + action)", () => {
  it("every diagnostic explains itself", () => {
    const all = validatePins(sketch("pinMode(35, OUTPUT);\ndigitalWrite(7, HIGH);\ndelay(5000);"), ESP32);
    expect(all.length).toBeGreaterThan(0);
    for (const d of all) {
      expect(d.message.length).toBeGreaterThan(10);
      expect(d.explanation.length).toBeGreaterThan(10);
      expect(d.recommendedAction.length).toBeGreaterThan(5);
      expect(["certain", "likely", "heuristic"]).toContain(d.certainty);
      expect(d.span).toBeDefined();
    }
  });
  it("ESP32: OUTPUT on input-only pin, flash pin, no pull-up on 34-39", () => {
    expect(codes(validatePins(sketch("pinMode(34, OUTPUT);"), ESP32))).toContain("input-only-pin-output");
    expect(codes(validatePins(sketch("pinMode(36, INPUT_PULLUP);"), ESP32))).toContain("input-only-no-pullup");
    expect(codes(validatePins(sketch("pinMode(6, OUTPUT);"), ESP32))).toContain("flash-pin");
    expect(codes(validatePins(sketch("pinMode(12, INPUT_PULLUP);"), ESP32))).toContain("strapping-pin");
    expect(codes(validatePins(sketch("pinMode(4, OUTPUT);\ndigitalWrite(4, HIGH);"), ESP32))).toEqual([]);
  });
  it("resolves pins through #define, const globals and board constants", () => {
    const d = validatePins(sketch("pinMode(SENSOR, OUTPUT);\npinMode(OTHER, OUTPUT);", "#define SENSOR 39\nconst int OTHER = 9;"), ESP32);
    expect(d.find((x) => x.code === "input-only-pin-output")).toMatchObject({ pin: 39, certainty: "certain" });
    expect(d.find((x) => x.code === "flash-pin")).toMatchObject({ pin: 9 });
    const v = validatePins(sketch("pinMode(p, OUTPUT);", "int p = 34;"), ESP32);
    expect(v.find((x) => x.code === "input-only-pin-output")!.certainty).toBe("likely");
    expect(validatePins(sketch("analogWrite(A0, 1);"), UNO).find((x) => x.code === "analogwrite-no-pwm")).toMatchObject({ pin: 14 });
  });
  it("ESP32 ADC2 + Wi-Fi, analogWrite core note", () => {
    const noWifi = validatePins(sketch("int v = analogRead(4);"), ESP32);
    expect(noWifi.find((x) => x.code === "adc2-wifi")).toMatchObject({ severity: "info" });
    const wifi = validatePins(parseSketch("#include <WiFi.h>\nvoid setup() {}\nvoid loop() { int v = analogRead(4); }\n").file, ESP32);
    expect(wifi.find((x) => x.code === "adc2-wifi")).toMatchObject({ severity: "board_warning", certainty: "certain" });
    expect(codes(validatePins(sketch("int v = analogRead(34);"), ESP32))).toEqual([]);
    expect(codes(validatePins(sketch("pinMode(4, OUTPUT);\nanalogWrite(4, 128);"), ESP32))).toContain("analogwrite-core-note");
  });
  it("DHT library pin on an input-only ESP32 pin is flagged (library drives the line)", () => {
    const f = parseSketch("#include <DHT.h>\nDHT dht(35, DHT11);\nvoid setup() { dht.begin(); }\nvoid loop() {}\n").file;
    expect(validatePins(f, ESP32).find((x) => x.code === "input-only-pin-output")).toMatchObject({ pin: 35 });
  });
  it("Uno: non-PWM analogWrite, serial pins with Serial, nonexistent pin, analogRead channel numbers", () => {
    expect(codes(validatePins(sketch("pinMode(7, OUTPUT);\nanalogWrite(7, 100);"), UNO))).toContain("analogwrite-no-pwm");
    expect(codes(validatePins(sketch("pinMode(9, OUTPUT);\nanalogWrite(9, 100);"), UNO))).toEqual([]);
    const serial = parseSketch("void setup() { Serial.begin(9600); pinMode(1, OUTPUT); }\nvoid loop() {}\n").file;
    expect(codes(validatePins(serial, UNO))).toContain("serial-pin-conflict");
    expect(codes(validatePins(sketch("pinMode(22, OUTPUT);"), UNO))).toContain("pin-not-on-board");
    expect(validatePins(sketch("int v = analogRead(0);"), UNO).find((x) => x.code === "analogread-channel-number")).toMatchObject({ severity: "info" });
  });
  it("heuristic: digitalWrite without pinMode; info: long blocking delay", () => {
    const d = validatePins(sketch("digitalWrite(13, HIGH);\ndelay(2000);"), UNO);
    expect(d.find((x) => x.code === "pin-without-pinmode")).toMatchObject({ severity: "warning", certainty: "heuristic" });
    expect(d.find((x) => x.code === "blocking-delay")).toMatchObject({ severity: "info" });
    expect(codes(validatePins(sketch("delay(500);"), UNO))).toEqual([]);
  });
  it("unknown board -> single info diagnostic", () => {
    expect(validatePins(sketch(""), "x:y:z")).toMatchObject([{ code: "unknown-board", severity: "info" }]);
  });
  it("shipped examples: DHT11 starter has only the educational delay note; non-blocking example is quiet except the strapping-pin LED note", () => {
    const starter = parseSketch(readFileSync(join(EX, "dht11-esp32/dht11-esp32.ino"), "utf8")).file;
    expect(codes(validateSketch(starter, ESP32))).toEqual(["blocking-delay"]);
    const nb = parseSketch(readFileSync(join(EX, "dht11-esp32-nonblocking/dht11-esp32-nonblocking.ino"), "utf8")).file;
    expect(codes(validateSketch(nb, ESP32))).toEqual(["strapping-pin"]);
    const blink = parseSketch(readFileSync(join(EX, "blink-uno/blink-uno.ino"), "utf8")).file;
    expect(codes(validateSketch(blink, UNO))).toEqual(["blocking-delay", "blocking-delay"]);
    const button = parseSketch(readFileSync(join(EX, "button-led/button-led.ino"), "utf8")).file;
    expect(codes(validateSketch(button, UNO))).toEqual([]);
  });
});

describe("library registry", () => {
  it("DHT pack metadata", () => {
    expect(DHT_PACK).toMatchObject({ name: "DHT sensor library", author: "Adafruit", license: "MIT", architectures: ["*"] });
    expect(DHT_PACK.dependencies[0]).toMatchObject({ name: "Adafruit Unified Sensor", license: "Apache-2.0" });
    expect(DHT_PACK.classes[0]!.methods.map((m) => m.name)).toEqual(expect.arrayContaining(["begin", "readTemperature", "readHumidity"]));
    expect(DHT_PACK.patterns[0]!.id).toBe("dht-failed-read-check");
  });
  it("detectDependencies from #include lines (native and inside raw #ifdef)", () => {
    const f = parseSketch('#include <DHT.h>\n#include <Wire.h>\n#include "local.h"\n#ifdef ESP32\n#include <WiFi.h>\n#include <Servo.h>\n#endif\nvoid setup() {}\nvoid loop() {}\n').file;
    const d = detectDependencies(f, "esp32");
    expect(d.libraries.map((l) => [l.pack.id, l.via])).toEqual([["adafruit-dht", "include"]]);
    expect(d.coreHeaders).toEqual(["Wire.h", "WiFi.h"]);
    expect(d.unknownHeaders).toEqual(["local.h", "Servo.h"]);
    expect(d.installNames).toEqual(["DHT sensor library@1.4.7", "Adafruit Unified Sensor@1.1.15"]);
    expect(d.installCommand).toBe('arduino-cli lib install "DHT sensor library@1.4.7" "Adafruit Unified Sensor@1.1.15"');
    expect(detectDependencies(parseSketch("void setup(){}\nvoid loop(){}\n").file).installCommand).toBeUndefined();
  });
  it("validateSketch reports missing setup/loop and unknown libraries", () => {
    const f = parseSketch("#include <Servo.h>\nvoid setup() {}\n").file;
    expect(codes(validateSketch(f, UNO))).toEqual(["missing-loop", "unknown-library"]);
  });
});
