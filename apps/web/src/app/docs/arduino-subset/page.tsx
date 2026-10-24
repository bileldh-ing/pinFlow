import { DocShell } from "@/components/DocShell";
import { Markdown } from "@/components/Markdown";
import { getCurrentUser } from "@/server/auth";
import { PARSER_COVERAGE_MD } from "@/generated/parser-coverage";
import { FRIENDLY_CALLS, CATEGORY_LABELS } from "@pinflow/block-definitions";

export const metadata = { title: "Supported Arduino C++ subset" };
export const dynamic = "force-dynamic";

const FALLBACK = `# PinFlow Arduino Visual Subset v1

The detailed parser coverage document (\`docs/parser-coverage.md\`) is not present in this build. Summary of what becomes native blocks:

- Sketch structure: \`setup()\`, \`loop()\`, user functions with parameters, includes, simple \`#define\`, global/local variables, constants and arrays, library object construction.
- Control flow: \`if / else if / else\`, \`for\`, \`while\`, \`do … while\`, \`switch / case / default\`, \`break\`, \`continue\`, \`return\`.
- Expressions: literals, identifiers, arithmetic / comparison / logical / bitwise / unary operators, \`++/--\`, parentheses, ternary, indexing, calls and method calls.
- Everything else (templates, lambdas, classes, casts, conditional compilation, complex macros) is preserved verbatim as **Advanced C++** with an explanation.`;

export default async function SubsetPage() {
  const user = await getCurrentUser().catch(() => null);
  const table = `\n\n## Friendly API blocks\n\n| Block | C++ | Category |\n|---|---|---|\n${FRIENDLY_CALLS.map((f) => `| ${f.label.replace(/%OBJ/g, "dht").replace(/%([A-Z_]+)/g, (_m, n: string) => n.toLowerCase()).replace(/\|/g, "/")} | \`${f.callee ?? `${f.object ?? "dht"}.${f.method}`}(${f.args.map((a) => a.toLowerCase()).join(", ")})\` | ${CATEGORY_LABELS[f.category]} |`).join("\n")}\n\nAny other call is shown as a generic *call* / *object.method()* block, so it stays editable.`;
  return <DocShell signedIn={!!user}><Markdown source={(PARSER_COVERAGE_MD ?? FALLBACK) + table} /></DocShell>;
}
