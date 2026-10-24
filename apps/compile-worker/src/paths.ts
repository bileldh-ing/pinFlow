/**
 * Sketch file validation. Every path from a client is untrusted.
 *
 * Rules (see docs/compile-worker.md):
 *  - relative POSIX paths only: no leading "/", no "\\", no drive letters, no NUL/control chars
 *  - no "." or ".." segments, no empty segments, no hidden (dot-leading) segments
 *  - each segment matches SEGMENT_RE; max depth / length limits
 *  - extension allowlist: .ino .cpp .c .h .hpp
 *  - .ino files only at the sketch root (arduino-cli ignores nested .ino)
 *  - exactly one main sketch file `<sketchName>.ino` at the root
 *  - no case-insensitive duplicates (prevents collisions on case-insensitive FS)
 *  - per-file size, file count and total size limits
 *
 * Symlinks cannot be expressed by the JSON API (files are {path, content} strings,
 * the schema is strict). The writer additionally opens files with O_NOFOLLOW|O_EXCL in a
 * freshly created mkdtemp directory and re-checks the resolved path stays inside it.
 */

export const ALLOWED_EXTENSIONS = [".ino", ".cpp", ".c", ".h", ".hpp"] as const;

export interface FileLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxPathLength: number;
  maxDepth: number;
}

export const DEFAULT_LIMITS: FileLimits = {
  maxFiles: 32,
  maxFileBytes: 256 * 1024,
  maxTotalBytes: 1024 * 1024,
  maxPathLength: 160,
  maxDepth: 4,
};

/** Arduino sketch name rules: start alnum, then alnum _ . -, max 63 chars. */
export const SKETCH_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
const SEGMENT_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
// Windows reserved device names – rejected so exported projects stay portable.
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

export class PathValidationError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message);
    this.name = "PathValidationError";
  }
}

export interface SketchFile {
  path: string;
  content: string;
}

export interface ValidatedSketch {
  sketchName: string;
  files: SketchFile[];
}

export function extensionOf(p: string): string {
  const base = p.split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i).toLowerCase();
}

export function validateRelativePath(p: string, limits: FileLimits = DEFAULT_LIMITS): string {
  if (typeof p !== "string" || p.length === 0) throw new PathValidationError("empty path", p);
  if (p.length > limits.maxPathLength) throw new PathValidationError("path too long", p);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) throw new PathValidationError("control character in path", p);
  if (p.includes("\\")) throw new PathValidationError("backslash not allowed", p);
  if (p.startsWith("/") || p.startsWith("~")) throw new PathValidationError("absolute path not allowed", p);
  if (/^[A-Za-z]:/.test(p)) throw new PathValidationError("drive letter not allowed", p);
  if (p.normalize("NFC") !== p) throw new PathValidationError("path must be NFC normalized", p);
  const segments = p.split("/");
  if (segments.length > limits.maxDepth) throw new PathValidationError("path too deep", p);
  for (const s of segments) {
    if (s === "") throw new PathValidationError("empty path segment", p);
    if (s === "." || s === "..") throw new PathValidationError("dot segment not allowed", p);
    if (!SEGMENT_RE.test(s)) throw new PathValidationError(`invalid path segment "${s}"`, p);
    if (RESERVED.test(s)) throw new PathValidationError(`reserved name "${s}"`, p);
    if (s.endsWith(".")) throw new PathValidationError("segment may not end with '.'", p);
  }
  const ext = extensionOf(p);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new PathValidationError(`extension "${ext || "(none)"}" not allowed`, p);
  }
  if (ext === ".ino" && segments.length !== 1) {
    throw new PathValidationError(".ino files must be at the sketch root", p);
  }
  return p;
}

export function validateSketch(
  files: SketchFile[],
  requestedSketchName?: string,
  limits: FileLimits = DEFAULT_LIMITS,
): ValidatedSketch {
  if (!Array.isArray(files) || files.length === 0) throw new PathValidationError("no files");
  if (files.length > limits.maxFiles) throw new PathValidationError(`too many files (max ${limits.maxFiles})`);
  const seen = new Set<string>();
  let total = 0;
  for (const f of files) {
    validateRelativePath(f.path, limits);
    const key = f.path.toLowerCase();
    if (seen.has(key)) throw new PathValidationError("duplicate path (case-insensitive)", f.path);
    seen.add(key);
    const bytes = Buffer.byteLength(f.content, "utf8");
    if (bytes > limits.maxFileBytes) throw new PathValidationError(`file too large (max ${limits.maxFileBytes} bytes)`, f.path);
    if (f.content.includes("\u0000")) throw new PathValidationError("NUL byte in file content", f.path);
    total += bytes;
  }
  // A file and a directory with the same name would collide when writing.
  for (const f of files) {
    const parts = f.path.toLowerCase().split("/");
    for (let i = 1; i < parts.length; i++) {
      if (seen.has(parts.slice(0, i).join("/"))) throw new PathValidationError("path collides with a file", f.path);
    }
  }
  if (total > limits.maxTotalBytes) throw new PathValidationError(`sketch too large (max ${limits.maxTotalBytes} bytes)`);

  const rootInos = files.filter((f) => extensionOf(f.path) === ".ino").map((f) => f.path.slice(0, -4));
  let sketchName: string;
  if (requestedSketchName !== undefined) {
    if (!SKETCH_NAME_RE.test(requestedSketchName)) throw new PathValidationError("invalid sketch name");
    if (!rootInos.includes(requestedSketchName)) {
      throw new PathValidationError(
        `main sketch file "${requestedSketchName}.ino" missing (sketch directory name must match main .ino)`,
      );
    }
    sketchName = requestedSketchName;
  } else {
    if (rootInos.length !== 1) {
      throw new PathValidationError(
        rootInos.length === 0 ? "no .ino file at sketch root" : "multiple .ino files: sketchName is required",
      );
    }
    sketchName = rootInos[0]!;
    if (!SKETCH_NAME_RE.test(sketchName)) throw new PathValidationError("invalid sketch name", `${sketchName}.ino`);
  }
  return { sketchName, files };
}
