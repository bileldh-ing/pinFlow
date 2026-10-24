/** Parse flash/RAM usage from arduino-cli compile output. */

export interface MemoryUsage {
  used: number;
  max?: number;
  percent?: number;
}

export interface SizeReport {
  flash?: MemoryUsage;
  ram?: MemoryUsage & { freeForLocals?: number };
}

const FLASH_RE = /Sketch uses (\d+) bytes(?: \((\d+)%\))? of program storage space\.(?: Maximum is (\d+) bytes\.)?/;
const RAM_RE =
  /Global variables use (\d+) bytes(?: \((\d+)%\))? of dynamic memory(?:, leaving (-?\d+) bytes for local variables)?\.(?: Maximum is (\d+) bytes\.)?/;

export function parseSizes(output: string): SizeReport | undefined {
  const r: SizeReport = {};
  const f = FLASH_RE.exec(output);
  if (f) r.flash = { used: Number(f[1]), percent: f[2] ? Number(f[2]) : undefined, max: f[3] ? Number(f[3]) : undefined };
  const m = RAM_RE.exec(output);
  if (m)
    r.ram = {
      used: Number(m[1]),
      percent: m[2] ? Number(m[2]) : undefined,
      freeForLocals: m[3] ? Number(m[3]) : undefined,
      max: m[4] ? Number(m[4]) : undefined,
    };
  return r.flash || r.ram ? r : undefined;
}
