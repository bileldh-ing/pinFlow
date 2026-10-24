export const BLANK_SKETCH = `void setup() {
  // put your setup code here, to run once:
}

void loop() {
  // put your main code here, to run repeatedly:
}
`;

export function sketchFileName(title: string): string {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "sketch";
  return `${/^[a-z_]/.test(base) ? base : `s_${base}`}.ino`;
}
