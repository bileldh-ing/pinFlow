import { createHash, randomBytes, randomUUID } from "node:crypto";

export const newId = (): string => randomUUID();
export const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

/** Hash of a set of files (path-sorted), used to tie compile results to exact sources. */
export function sourceHash(files: Array<{ path: string; content: string }>): string {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(f.path, "utf8"); h.update("\0"); h.update(f.content, "utf8"); h.update("\0");
  }
  return h.digest("hex");
}

export function fileType(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return (m?.[1] ?? "txt").toLowerCase();
}
