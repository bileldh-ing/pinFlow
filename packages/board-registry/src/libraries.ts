/**
 * Library plugin model (spec 4.3) + core Arduino API knowledge.
 *
 * A LibraryPack declares metadata, dependencies, recognized classes/methods
 * (parser adapters use these to decide which calls are natively visualized)
 * and code patterns. Block schemas/generators for a pack are registered by the
 * block-definitions package against the same pack id.
 */
import type { SketchFile, TopLevel } from "@pinflow/arduino-ir";
import { walkIr } from "@pinflow/arduino-ir";

export interface LibraryDependency {
  /** Arduino Library Manager name, exactly as `arduino-cli lib install` expects. */
  name: string;
  version: string;
  license: string;
  url: string;
}

export interface LibraryMethod {
  name: string;
  /** Human signature for tooltips. */
  signature: string;
  returns: "void" | "bool" | "float" | "int" | "uint8_t" | "unknown";
  description: string;
}

export interface LibraryClass {
  name: string;
  /** Constructor parameters in order (for the object-construction block). */
  ctorParams: { name: string; kind: "pin" | "enum" | "number" | "other"; options?: string[]; optional?: boolean }[];
  methods: LibraryMethod[];
}

export interface LibraryPattern {
  id: string;
  description: string;
  /** Illustrative C++ shape; matching is done structurally on the IR by consumers. */
  example: string;
}

export interface LibraryPack {
  id: string;
  /** Arduino Library Manager name. */
  name: string;
  author: string;
  version: string;
  license: string;
  url: string;
  /** library.properties `architectures`. "*" = all. */
  architectures: string[];
  /** Headers that identify this library in #include lines. */
  headers: string[];
  dependencies: LibraryDependency[];
  installCommand: string;
  classes: LibraryClass[];
  /** Constants/macros the library defines (e.g. DHT11). */
  constants: string[];
  patterns: LibraryPattern[];
  compatibilityNotes: string[];
}

/**
 * Adafruit DHT sensor library. Metadata verified 2026-10-22 against
 * https://raw.githubusercontent.com/adafruit/DHT-sensor-library/master/library.properties
 * (version 1.4.7, architectures=*, depends=Adafruit Unified Sensor) and its license.txt (MIT);
 * Adafruit Unified Sensor 1.1.15 (library.properties; Apache-2.0 per LICENSE.txt in adafruit/Adafruit_Sensor).
 */
export const DHT_PACK: LibraryPack = {
  id: "adafruit-dht",
  name: "DHT sensor library",
  author: "Adafruit",
  version: "1.4.7",
  license: "MIT",
  url: "https://github.com/adafruit/DHT-sensor-library",
  architectures: ["*"],
  headers: ["DHT.h", "DHT_U.h"],
  dependencies: [
    { name: "Adafruit Unified Sensor", version: "1.1.15", license: "Apache-2.0", url: "https://github.com/adafruit/Adafruit_Sensor" },
  ],
  installCommand: 'arduino-cli lib install "DHT sensor library@1.4.7" "Adafruit Unified Sensor@1.1.15"',
  classes: [
    {
      name: "DHT",
      ctorParams: [
        { name: "pin", kind: "pin" },
        { name: "type", kind: "enum", options: ["DHT11", "DHT12", "DHT21", "DHT22", "AM2301"] },
        { name: "count", kind: "number", optional: true },
      ],
      methods: [
        { name: "begin", signature: "void begin(uint8_t usec = 55)", returns: "void", description: "Initialise the sensor pin. Call once in setup()." },
        { name: "readTemperature", signature: "float readTemperature(bool isFahrenheit = false, bool force = false)", returns: "float", description: "Temperature in °C (or °F). Returns NAN when the read fails." },
        { name: "readHumidity", signature: "float readHumidity(bool force = false)", returns: "float", description: "Relative humidity in %. Returns NAN when the read fails." },
        { name: "computeHeatIndex", signature: "float computeHeatIndex(float temperature, float percentHumidity, bool isFahrenheit = true)", returns: "float", description: "Heat index from temperature and humidity." },
        { name: "convertCtoF", signature: "float convertCtoF(float c)", returns: "float", description: "Celsius to Fahrenheit." },
        { name: "convertFtoC", signature: "float convertFtoC(float f)", returns: "float", description: "Fahrenheit to Celsius." },
        { name: "read", signature: "bool read(bool force = false)", returns: "bool", description: "Low-level read of the raw 40-bit frame." },
      ],
    },
  ],
  constants: ["DHT11", "DHT12", "DHT21", "DHT22", "AM2301"],
  patterns: [
    {
      id: "dht-failed-read-check",
      description: "readTemperature()/readHumidity() return NAN on failure; check with isnan() before using the value.",
      example: 'if (isnan(h) || isnan(t)) {\n  Serial.println("Failed to read from DHT sensor!");\n  return;\n}',
    },
  ],
  compatibilityNotes: [
    "DHT11 should not be read more often than about once per second (DHT22: every 2 s).",
    "The library drives the data line low to start a reading: the data pin must be output-capable (not ESP32 GPIO34-39).",
    "Use a 4.7k-10k pull-up on the data line unless the module already has one.",
  ],
};

export const LIBRARY_PACKS: LibraryPack[] = [DHT_PACK];

export function getLibraryPack(id: string): LibraryPack | undefined {
  return LIBRARY_PACKS.find((p) => p.id === id);
}

/** Find the library class (from any registered pack) by C++ class name. */
export function findLibraryClass(className: string): { pack: LibraryPack; cls: LibraryClass } | undefined {
  for (const pack of LIBRARY_PACKS) {
    const cls = pack.classes.find((c) => c.name === className);
    if (cls) return { pack, cls };
  }
  return undefined;
}

/* ------------------------------- Core APIs -------------------------------- */

/** Free functions provided by the Arduino core / avr-libc / newlib that PinFlow visualizes natively. */
export const CORE_FUNCTIONS: readonly string[] = [
  "pinMode", "digitalWrite", "digitalRead", "analogRead", "analogWrite", "analogReference", "analogReadResolution",
  "analogWriteResolution", "delay", "delayMicroseconds", "millis", "micros", "map", "constrain", "min", "max", "abs",
  "sq", "sqrt", "pow", "sin", "cos", "tan", "floor", "ceil", "round", "fabs", "isnan", "isinf", "random", "randomSeed",
  "tone", "noTone", "pulseIn", "pulseInLong", "shiftIn", "shiftOut", "attachInterrupt", "detachInterrupt",
  "digitalPinToInterrupt", "interrupts", "noInterrupts", "bitRead", "bitWrite", "bitSet", "bitClear", "bit",
  "lowByte", "highByte", "yield",
  // Core macros / constructors that read like calls.
  "F", "String",
];

/** Objects always present in the Arduino core and their natively visualized methods. */
export const CORE_OBJECTS: Readonly<Record<string, readonly string[]>> = (() => {
  const serial = ["begin", "end", "print", "println", "printf", "write", "available", "read", "peek", "flush",
    "readString", "readStringUntil", "parseInt", "parseFloat", "setTimeout", "availableForWrite"];
  return { Serial: serial, Serial1: serial, Serial2: serial };
})();

/** Headers that ship with the board core (no Library Manager install needed), by architecture. */
export const CORE_HEADERS: Readonly<Record<string, readonly string[]>> = {
  "*": ["Arduino.h"],
  avr: ["Wire.h", "SPI.h", "EEPROM.h", "SoftwareSerial.h", "avr/pgmspace.h", "avr/interrupt.h"],
  esp32: ["Wire.h", "SPI.h", "EEPROM.h", "WiFi.h", "WiFiClient.h", "WiFiClientSecure.h", "WebServer.h", "HTTPClient.h",
    "Preferences.h", "BluetoothSerial.h", "ESPmDNS.h", "Update.h", "FS.h", "SPIFFS.h", "LittleFS.h", "SD.h", "esp_sleep.h"],
};

/* --------------------------- Dependency detection -------------------------- */

export interface DetectedLibrary {
  pack: LibraryPack;
  /** Header that triggered detection. */
  header: string;
  /** "include" = native Include node; "raw" = found in a raw-preserved region (e.g. inside #ifdef). */
  via: "include" | "raw";
  nodeId: string;
}

export interface DependencyReport {
  libraries: DetectedLibrary[];
  /** Headers provided by the selected core (when an architecture is given) or by Arduino itself. */
  coreHeaders: string[];
  /** Headers PinFlow has no metadata for: the user must make sure the library is installed. */
  unknownHeaders: string[];
  /** Full set of Library Manager names (name@version) to install: packs + their dependencies, de-duplicated. */
  installNames: string[];
  installCommand?: string;
}

const RAW_INCLUDE_LINE = /^[ \t]*#[ \t]*include[ \t]*([<"])([^>"]+)[>"]/gm;

/**
 * Detect library dependencies from #include lines. Native Include nodes are read
 * structurally; raw regions (e.g. #ifdef blocks) are scanned line-by-line for
 * #include directives only, and reported with via:"raw" because they may be conditional.
 */
export function detectDependencies(file: SketchFile, architecture?: string): DependencyReport {
  const found: { header: string; via: "include" | "raw"; nodeId: string }[] = [];
  walkIr(file, (n) => {
    const item = n as unknown as TopLevel | { kind: string; id: string; text?: string };
    if (item.kind === "Include") found.push({ header: (item as { path: string }).path, via: "include", nodeId: item.id });
    else if ((item.kind === "RawTopLevel" || item.kind === "RawStatement") && typeof (item as { text?: unknown }).text === "string") {
      for (const m of (item as { text: string }).text.matchAll(RAW_INCLUDE_LINE)) found.push({ header: m[2]!.trim(), via: "raw", nodeId: item.id });
    }
  });

  const libraries: DetectedLibrary[] = [];
  const coreHeaders: string[] = [];
  const unknownHeaders: string[] = [];
  const core = new Set([...(CORE_HEADERS["*"] ?? []), ...(architecture ? CORE_HEADERS[architecture] ?? [] : [])]);
  for (const f of found) {
    const pack = LIBRARY_PACKS.find((p) => p.headers.includes(f.header));
    if (pack) {
      if (!libraries.some((l) => l.pack.id === pack.id)) libraries.push({ pack, header: f.header, via: f.via, nodeId: f.nodeId });
    } else if (core.has(f.header)) {
      if (!coreHeaders.includes(f.header)) coreHeaders.push(f.header);
    } else if (!unknownHeaders.includes(f.header)) unknownHeaders.push(f.header);
  }
  const installNames: string[] = [];
  for (const l of libraries) {
    for (const n of [`${l.pack.name}@${l.pack.version}`, ...l.pack.dependencies.map((d) => `${d.name}@${d.version}`)])
      if (!installNames.includes(n)) installNames.push(n);
  }
  return {
    libraries,
    coreHeaders,
    unknownHeaders,
    installNames,
    installCommand: installNames.length ? `arduino-cli lib install ${installNames.map((n) => JSON.stringify(n)).join(" ")}` : undefined,
  };
}
