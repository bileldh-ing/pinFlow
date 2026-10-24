/**
 * Versioned board profiles. Target-specific pin rules live here, never in UI code.
 *
 * Sources (consulted 2026-10):
 *  - Espressif ESP32 datasheet / arduino-esp32 docs (GPIO34-39 input-only, no pull-ups;
 *    GPIO6-11 wired to SPI flash on ESP32-WROOM modules; strapping pins 0, 2, 5, 12, 15;
 *    ADC2 unavailable while Wi-Fi driver is running).
 *  - arduino-esp32 3.x migration notes (analogWrite implemented on top of LEDC).
 *  - Arduino Uno Rev3 docs (PWM on 3, 5, 6, 9, 10, 11; A0-A5 = D14-D19; D0/D1 = USB serial).
 * Rules are advisory unless marked certain for the exact profile.
 */

export type PinCapability =
  | "digital_in"
  | "digital_out"
  | "pullup"
  | "pulldown"
  | "adc1"
  | "adc2"
  | "adc"
  | "dac"
  | "pwm"
  | "touch"
  | "uart"
  | "i2c"
  | "spi";

export interface PinInfo {
  /** GPIO / digital pin number used in code. */
  gpio: number;
  /** Labels the user may see or write, e.g. "A0", "D13", "GPIO4". */
  labels: string[];
  capabilities: PinCapability[];
  inputOnly?: boolean;
  strapping?: boolean;
  /** Reserved for on-module SPI flash/PSRAM: using it usually crashes the board. */
  flash?: boolean;
  /** Used by the USB-serial bridge (Serial). */
  serial?: boolean;
  notes?: string[];
}

export interface BoardProfile {
  /** Profile schema/content version. Bump when rules change. */
  profileVersion: string;
  id: string;
  name: string;
  fqbn: string;
  architecture: "esp32" | "avr";
  /** Arduino core package the rules were written against. */
  core: { packageId: string; testedVersions: string; boardManagerUrl?: string };
  mcu: string;
  /** Constant names (A0, LED_BUILTIN...) -> gpio, only where the value is certain for this profile. */
  constants: Record<string, number>;
  pins: PinInfo[];
  defaultBaud: number;
  /** analogWrite support note for this target/core. */
  analogWrite: { supported: boolean; note: string };
  adcResolutionBits: number;
  notes: string[];
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/* ------------------------------ ESP32 Dev Module ------------------------------ */

const ESP32_ADC1 = [32, 33, 34, 35, 36, 39];
const ESP32_ADC2 = [0, 2, 4, 12, 13, 14, 15, 25, 26, 27];
const ESP32_TOUCH = [0, 2, 4, 12, 13, 14, 15, 27, 32, 33];
const ESP32_VALID = [...range(0, 19), 21, 22, 23, 25, 26, 27, ...range(32, 39)];

function esp32Pin(g: number): PinInfo {
  const caps: PinCapability[] = ["digital_in"];
  const inputOnly = g >= 34 && g <= 39;
  if (!inputOnly) caps.push("digital_out", "pullup", "pulldown", "pwm");
  if (ESP32_ADC1.includes(g)) caps.push("adc1", "adc");
  if (ESP32_ADC2.includes(g)) caps.push("adc2", "adc");
  if (g === 25 || g === 26) caps.push("dac");
  if (ESP32_TOUCH.includes(g)) caps.push("touch");
  if (g === 1 || g === 3) caps.push("uart");
  if (g === 21 || g === 22) caps.push("i2c");
  if ([18, 19, 23, 5].includes(g)) caps.push("spi");
  const info: PinInfo = { gpio: g, labels: [`GPIO${g}`, `${g}`], capabilities: caps };
  const notes: string[] = [];
  if (inputOnly) {
    info.inputOnly = true;
    notes.push("Input-only pin: cannot drive outputs and has no internal pull-up/pull-down resistors.");
  }
  if ([0, 2, 5, 12, 15].includes(g)) {
    info.strapping = true;
    notes.push("Strapping pin: its level at reset selects boot mode / flash voltage. External pull-ups/downs or loads can stop the board from booting or flashing.");
  }
  if (g >= 6 && g <= 11) {
    info.flash = true;
    notes.push("Connected to the on-module SPI flash on ESP32-WROOM/WROVER modules. Do not use.");
  }
  if (g === 1 || g === 3) {
    info.serial = true;
    notes.push(g === 1 ? "UART0 TX (USB serial / Serial)." : "UART0 RX (USB serial / Serial).");
  }
  if (ESP32_ADC2.includes(g)) notes.push("ADC2 channel: analogRead() fails while Wi-Fi is active.");
  if (notes.length) info.notes = notes;
  return info;
}

export const ESP32_DEV_MODULE: BoardProfile = {
  profileVersion: "1.0.0",
  id: "esp32-dev-module",
  name: "ESP32 Dev Module",
  fqbn: "esp32:esp32:esp32",
  architecture: "esp32",
  core: {
    packageId: "esp32:esp32",
    testedVersions: "3.x (rules also hold for 2.0.x except analogWrite notes)",
    boardManagerUrl: "https://espressif.github.io/arduino-esp32/package_esp32_index.json",
  },
  mcu: "ESP32-D0WD (Xtensa dual-core, ESP32-WROOM-32 module)",
  // Values from the arduino-esp32 "esp32" variant pins_arduino.h.
  constants: {
    A0: 36, A3: 39, A4: 32, A5: 33, A6: 34, A7: 35, A10: 4, A11: 0, A12: 2, A13: 15, A14: 13, A15: 12,
    A16: 14, A17: 27, A18: 25, A19: 26, TX: 1, RX: 3, SDA: 21, SCL: 22, SS: 5, MOSI: 23, MISO: 19, SCK: 18,
    DAC1: 25, DAC2: 26,
  },
  pins: ESP32_VALID.map(esp32Pin),
  defaultBaud: 115200,
  analogWrite: {
    supported: true,
    note: "analogWrite() is provided by arduino-esp32 core 3.x (and 2.0.x) on top of the LEDC peripheral; default 8-bit, ~1 kHz. Core 1.x has no analogWrite(): use ledcSetup/ledcAttachPin/ledcWrite there.",
  },
  adcResolutionBits: 12,
  notes: [
    "LED_BUILTIN is board-specific on ESP32 boards (many DevKit clones use GPIO2); PinFlow does not assume its value.",
    "ESP32 GPIO is 3.3 V only; 5 V signals can damage the chip.",
  ],
};

/* -------------------------------- Arduino Uno -------------------------------- */

const UNO_PWM = [3, 5, 6, 9, 10, 11];

function unoPin(g: number): PinInfo {
  const caps: PinCapability[] = ["digital_in", "digital_out", "pullup"];
  const labels = [`${g}`, `D${g}`];
  if (UNO_PWM.includes(g)) caps.push("pwm");
  if (g >= 14) {
    caps.push("adc");
    labels.unshift(`A${g - 14}`);
  }
  if (g === 0 || g === 1) caps.push("uart");
  if (g === 18 || g === 19) caps.push("i2c");
  if (g >= 10 && g <= 13) caps.push("spi");
  const info: PinInfo = { gpio: g, labels, capabilities: caps };
  const notes: string[] = [];
  if (g === 0 || g === 1) {
    info.serial = true;
    notes.push(`Digital ${g} is the hardware serial ${g === 0 ? "RX" : "TX"} shared with the USB connection (Serial / uploads).`);
  }
  if (g === 13) notes.push("Drives the on-board LED (LED_BUILTIN).");
  if (notes.length) info.notes = notes;
  return info;
}

export const ARDUINO_UNO: BoardProfile = {
  profileVersion: "1.0.0",
  id: "arduino-uno",
  name: "Arduino Uno",
  fqbn: "arduino:avr:uno",
  architecture: "avr",
  core: { packageId: "arduino:avr", testedVersions: "1.8.x" },
  mcu: "ATmega328P @ 16 MHz",
  constants: { A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, LED_BUILTIN: 13, SDA: 18, SCL: 19, SS: 10, MOSI: 11, MISO: 12, SCK: 13 },
  pins: range(0, 19).map(unoPin),
  defaultBaud: 9600,
  analogWrite: { supported: true, note: "analogWrite() produces PWM only on pins 3, 5, 6, 9, 10, 11 (~490 Hz; 5 and 6 at ~980 Hz). On other pins it writes LOW for values < 128 and HIGH otherwise." },
  adcResolutionBits: 10,
  notes: ["5 V logic.", "analogRead(n) with a bare number 0-5 reads channel An (e.g. analogRead(0) reads A0)."],
};

/** Arduino Nano (ATmega328P): same pin rules as Uno plus A6/A7 analog-input-only. */
export const ARDUINO_NANO: BoardProfile = {
  ...ARDUINO_UNO,
  id: "arduino-nano",
  name: "Arduino Nano (ATmega328P)",
  fqbn: "arduino:avr:nano",
  constants: { ...ARDUINO_UNO.constants, A6: 20, A7: 21 },
  pins: [
    ...ARDUINO_UNO.pins,
    { gpio: 20, labels: ["A6"], capabilities: ["adc"], inputOnly: true, notes: ["A6 is analog-input only (no digital I/O)."] },
    { gpio: 21, labels: ["A7"], capabilities: ["adc"], inputOnly: true, notes: ["A7 is analog-input only (no digital I/O)."] },
  ],
  notes: [...ARDUINO_UNO.notes, "A6/A7 can only be used with analogRead()."],
};

const BOARDS: BoardProfile[] = [ESP32_DEV_MODULE, ARDUINO_UNO, ARDUINO_NANO];

/** Board profile for an FQBN. Board options after the third segment (e.g. ":UploadSpeed=921600") are ignored. */
export function getBoard(fqbn: string): BoardProfile | undefined {
  const base = fqbn.split(":").slice(0, 3).join(":");
  return BOARDS.find((b) => b.fqbn === base);
}

export function listBoards(): BoardProfile[] {
  return [...BOARDS];
}

export function getPin(board: BoardProfile, gpio: number): PinInfo | undefined {
  return board.pins.find((p) => p.gpio === gpio);
}
