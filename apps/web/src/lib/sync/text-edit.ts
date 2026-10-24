/** Minimal single-range text edit between two strings (common prefix/suffix). */
export interface TextEdit { start: number; end: number; text: string; }

export function minimalEdit(oldText: string, newText: string): TextEdit | null {
  if (oldText === newText) return null;
  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText.charCodeAt(start) === newText.charCodeAt(start)) start++;
  // don't split a surrogate pair or a CRLF
  if (start > 0 && (oldText.charCodeAt(start - 1) === 13 || isHighSurrogate(oldText.charCodeAt(start - 1)))) start--;
  let endOld = oldText.length;
  let endNew = newText.length;
  while (endOld > start && endNew > start && oldText.charCodeAt(endOld - 1) === newText.charCodeAt(endNew - 1)) { endOld--; endNew--; }
  if (endOld < oldText.length && (isLowSurrogate(oldText.charCodeAt(endOld)) || (oldText.charCodeAt(endOld) === 10 && oldText.charCodeAt(endOld - 1) === 13))) { endOld++; endNew++; }
  return { start, end: endOld, text: newText.slice(start, endNew) };
}

function isHighSurrogate(c: number) { return c >= 0xd800 && c <= 0xdbff; }
function isLowSurrogate(c: number) { return c >= 0xdc00 && c <= 0xdfff; }

export function applyEdit(text: string, e: TextEdit | null): string {
  return e ? text.slice(0, e.start) + e.text + text.slice(e.end) : text;
}

/** Offset -> 1-based Monaco position. */
export function offsetToPosition(text: string, offset: number): { lineNumber: number; column: number } {
  let line = 1; let lastNl = -1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) { line++; lastNl = i; }
  return { lineNumber: line, column: offset - lastNl };
}
