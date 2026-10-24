import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Minimal, safe Markdown renderer for our own docs (headings, paragraphs,
 * lists, fenced code, tables, blockquotes, inline code/bold/italic/links).
 * Everything is rendered as React text nodes — no raw HTML is ever injected.
 */
function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3].slice(1, -1)}</em>);
    else if (m[4]) {
      const href = m[6]!;
      const safe = /^(https?:|\/|#|mailto:)/.test(href) ? href : "#";
      out.push(safe.startsWith("/") ? <Link key={k} href={safe}>{m[5]}</Link> : <a key={k} href={safe} rel="noopener noreferrer">{m[5]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0; let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^```/.test(line)) {
      const buf: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) buf.push(lines[i++]!);
      i++;
      blocks.push(<pre key={k++}><code>{buf.join("\n")}</code></pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length; const text = h[2]!;
      const props = { key: k++, id: slug(text) };
      blocks.push(level === 1 ? <h1 {...props}>{inline(text)}</h1> : level === 2 ? <h2 {...props}>{inline(text)}</h2> : <h3 {...props}>{inline(text)}</h3>);
      i++; continue;
    }
    if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i]!)) { rows.push(lines[i]!.replace(/^\||\|$/g, "").split("|").map((c) => c.trim())); i++; }
      const [head, , ...body] = rows;
      blocks.push(<table key={k++}><thead><tr>{head?.map((c, j) => <th key={j}>{inline(c, j)}</th>)}</tr></thead><tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, j)}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]!) || /^\s*\d+\.\s+/.test(lines[i]!))) { items.push(lines[i]!.replace(/^\s*([-*]|\d+\.)\s+/, "")); i++; }
      const lis = items.map((it, j) => <li key={j}>{inline(it, j)}</li>);
      blocks.push(ordered ? <ol key={k++}>{lis}</ol> : <ul key={k++}>{lis}</ul>);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) buf.push(lines[i++]!.replace(/^>\s?/, ""));
      blocks.push(<blockquote key={k++}><p>{inline(buf.join(" "))}</p></blockquote>);
      continue;
    }
    if (!line.trim() || /^---+$/.test(line.trim())) { i++; continue; }
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,4}\s|```|\||>|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]!)) buf.push(lines[i++]!);
    blocks.push(<p key={k++}>{inline(buf.join(" "))}</p>);
  }
  return <div className="prose-pf">{blocks}</div>;
}
