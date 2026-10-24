/**
 * Coarse performance guard for a ~1000-line supported sketch. Thresholds are generous
 * (CI noise); the measured numbers are recorded in docs/performance.md.
 */
import { beforeAll, expect, it } from "vitest";
import { generate } from "@pinflow/arduino-codegen";
import { initParser, parseSketch } from "../src/index";

export function bigSketch(functions = 40): string {
  const parts = ["#include <DHT.h>", "#define DHTPIN 4", "DHT dht(DHTPIN, DHT11);", "const int LED = 2;", "int counter = 0;", ""];
  for (let f = 0; f < functions; f++) {
    parts.push(`// helper ${f}`, `int helper${f}(int a, int b) {`, "  int sum = 0;", "  for (int i = 0; i < a; i++) {", "    if (i % 2 == 0 && b > 3) {", "      sum += i * (b - 1);", "    } else if (i > 10) {", "      sum -= 1;", "    } else {", "      sum = sum << 1;", "    }", "  }", "  while (sum > 1000) {", "    sum /= 2;", "  }", "  switch (b) {", "    case 1:", "      sum++;", "      break;", "    default:", "      sum--;", "  }", "  Serial.println(sum);", "  return sum > 0 ? sum : -sum;", "}", "");
  }
  parts.push("void setup() {", "  Serial.begin(115200);", "  dht.begin();", "  pinMode(LED, OUTPUT);", "}", "", "void loop() {");
  for (let f = 0; f < functions; f++) parts.push(`  counter += helper${f}(counter, ${f});`);
  parts.push("  float t = dht.readTemperature();", "  if (isnan(t)) {", "    return;", "  }", "  delay(2000);", "}", "");
  return parts.join("\n");
}

beforeAll(async () => {
  await initParser();
});

it("parses and regenerates a ~1000-line sketch quickly", () => {
  const src = bigSketch();
  const lines = src.split("\n").length;
  expect(lines).toBeGreaterThanOrEqual(1000);
  for (let i = 0; i < 3; i++) generate(parseSketch(src).file); // warm-up (JIT)
  const parseTimes: number[] = [];
  const genTimes: number[] = [];
  const reparseTimes: number[] = [];
  let prev = parseSketch(src).file;
  for (let i = 0; i < 15; i++) {
    let t0 = performance.now();
    const r = parseSketch(src);
    parseTimes.push(performance.now() - t0);
    t0 = performance.now();
    generate(r.file);
    genTimes.push(performance.now() - t0);
    t0 = performance.now();
    prev = parseSketch(src.replace("delay(2000)", `delay(${1000 + i})`), "main.ino", prev).file;
    reparseTimes.push(performance.now() - t0);
    expect(r.coverage.ratio).toBe(1);
  }
  const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95) - 1]!;
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  console.log(`PERF lines=${lines} parse median=${med(parseTimes).toFixed(1)}ms p95=${p95(parseTimes).toFixed(1)}ms | generate median=${med(genTimes).toFixed(1)}ms p95=${p95(genTimes).toFixed(1)}ms | parse+stableIds(prev) median=${med(reparseTimes).toFixed(1)}ms p95=${p95(reparseTimes).toFixed(1)}ms`);
  expect(p95(parseTimes)).toBeLessThan(1500);
  expect(p95(genTimes)).toBeLessThan(500);
});
