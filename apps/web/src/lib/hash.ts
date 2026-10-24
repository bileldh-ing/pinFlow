/** Browser/Node sha256 of a file set — byte-identical to @pinflow/database sourceHash(). */
export async function sourceHashBrowser(files: Array<{ path: string; content: string }>): Promise<string> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    parts.push(enc.encode(f.path), new Uint8Array([0]), enc.encode(f.content), new Uint8Array([0]));
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
