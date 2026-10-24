/**
 * Structured diagnostics from GCC / arduino-cli output.
 *
 * Recognised shapes:
 *   <file>:<line>:<col>: <severity>: <message>      (gcc, col optional)
 *   <file>:<line>:<col>: fatal error: X.h: No such file or directory
 *   <file>:<line>: undefined reference to `foo'      (ld with debug info)
 *   <obj>:(.text...): undefined reference to `foo'   (ld without line info)
 *   collect2: error: ld returned 1 exit status
 *   region `dram0_0_seg' overflowed by N bytes / section `.text' will not fit in region
 *   Error during build: ...  (arduino-cli itself)
 *
 * Absolute paths that point into the job's sketch directory (or arduino-cli's copy of it in the
 * build dir) are mapped back to the user's relative path. Other absolute paths (core, libraries)
 * are redacted to "<arduino-data>/..." style placeholders and marked external.
 */

export type Severity = "error" | "warning" | "note" | "info";

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** User-relative path (e.g. "blink.ino", "src/util.cpp") or redacted external path. */
  file?: string;
  line?: number;
  column?: number;
  /** true when the location is outside the user's sketch (core/library/linker). */
  external?: boolean;
  source: "compiler" | "linker" | "arduino-cli";
  /** The original raw line (after path redaction). */
  raw: string;
}

export interface PathMapping {
  /** Absolute dir where the user's sketch was written, e.g. /tmp/pinflow-job-abc/blink */
  sketchDir: string;
  /** Absolute build dir; arduino-cli copies the sketch to <buildDir>/sketch */
  buildDir?: string;
  /** Extra absolute prefixes to redact -> placeholder (e.g. arduino data dir). */
  redact?: Array<{ prefix: string; placeholder: string }>;
}

const GCC_RE = /^(.+?):(\d+):(?:(\d+):)?\s+(fatal error|error|warning|note):\s+(.*)$/;
const UNDEF_REF_RE = /undefined reference to [`'‘](.+?)['’]/;
const LD_FILE_RE = /^(.+?):(?:\(\.[^)]*\)|(\d+)):\s*(.*)$/;

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
}

export function mapPath(p: string, m: PathMapping): { file: string; external: boolean } {
  const norm = p.replace(/\\/g, "/");
  const candidates: string[] = [m.sketchDir.replace(/\/+$/, "") + "/"];
  if (m.buildDir) candidates.push(m.buildDir.replace(/\/+$/, "") + "/sketch/");
  for (const c of candidates) {
    if (norm.startsWith(c)) {
      let rel = norm.slice(c.length);
      // arduino-cli preprocesses <name>.ino into <name>.ino.cpp in the build dir.
      if (rel.endsWith(".ino.cpp")) rel = rel.slice(0, -4);
      return { file: rel, external: false };
    }
  }
  return { file: redactText(norm, m), external: true };
}

export function redactText(text: string, m: PathMapping): string {
  let out = text;
  const pairs: Array<{ prefix: string; placeholder: string }> = [];
  if (m.buildDir) pairs.push({ prefix: m.buildDir.replace(/\/+$/, "") + "/sketch/", placeholder: "" });
  pairs.push({ prefix: m.sketchDir.replace(/\/+$/, "") + "/", placeholder: "" });
  if (m.buildDir) pairs.push({ prefix: m.buildDir.replace(/\/+$/, ""), placeholder: "<build>" });
  // the job temp root (parent of sketch dir); also covers gcc temp files under TMPDIR=<job>/tmp
  const parent = m.sketchDir.replace(/\/+$/, "").split("/").slice(0, -1).join("/");
  if (parent) pairs.push({ prefix: parent, placeholder: "<job>" });
  for (const r of m.redact ?? []) pairs.push(r);
  for (const { prefix, placeholder } of pairs) {
    if (!prefix) continue;
    out = out.split(prefix).join(placeholder);
  }
  return out;
}

export function parseDiagnostics(output: string, mapping: PathMapping): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  const push = (d: Diagnostic) => {
    const k = `${d.severity}|${d.file ?? ""}|${d.line ?? ""}|${d.column ?? ""}|${d.message}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(d);
  };
  for (const rawLine of stripAnsi(output).split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const g = GCC_RE.exec(line);
    if (g && !/^\s/.test(line)) {
      const [, file, ln, col, sev, msg] = g;
      const mapped = mapPath(file!, mapping);
      push({
        severity: sev === "fatal error" ? "error" : (sev as Severity),
        message: redactText(msg!, mapping),
        file: mapped.file,
        line: Number(ln),
        column: col ? Number(col) : undefined,
        external: mapped.external || undefined,
        source: "compiler",
        raw: redactText(line, mapping),
      });
      continue;
    }
    const u = UNDEF_REF_RE.exec(line);
    if (u) {
      const lf = LD_FILE_RE.exec(line);
      let file: string | undefined;
      let lineNo: number | undefined;
      let external: boolean | undefined;
      // skip "…/bin/ld: …" prefixes and object files (gcc LTO temp objects carry no useful location)
      if (lf && !/(^|\/)[\w.-]*ld(\.exe)?$/.test(lf[1]!) && !/\.o$/.test(lf[1]!)) {
        const mapped = mapPath(lf[1]!, mapping);
        file = mapped.file;
        external = mapped.external || undefined;
        if (lf[2]) lineNo = Number(lf[2]);
      }
      push({
        severity: "error",
        message: `undefined reference to '${u[1]}'`,
        file,
        line: lineNo,
        external,
        source: "linker",
        raw: redactText(line, mapping),
      });
      continue;
    }
    if (/collect2: error: ld returned/.test(line)) {
      push({ severity: "error", message: "linking failed (ld returned non-zero exit status)", source: "linker", raw: line });
      continue;
    }
    if (/region [`'‘].+['’] overflowed by \d+ bytes|will not fit in region|Sketch too big|not enough memory/i.test(line)) {
      push({
        severity: "error",
        message: redactText(line.replace(/^.*?:\s*(?=region|section)/, ""), mapping),
        source: "linker",
        raw: redactText(line, mapping),
      });
      continue;
    }
    const e = /^Error during build:\s*(.*)$/.exec(line) ?? /^Error:\s*(.*)$/.exec(line);
    if (e) {
      push({ severity: "error", message: redactText(e[1]!, mapping), source: "arduino-cli", raw: redactText(line, mapping) });
      continue;
    }
    if (/^(Platform|Board|Library) .* not found/i.test(line) || /^Invalid FQBN/i.test(line)) {
      push({ severity: "error", message: redactText(line, mapping), source: "arduino-cli", raw: redactText(line, mapping) });
    }
  }
  return out;
}
