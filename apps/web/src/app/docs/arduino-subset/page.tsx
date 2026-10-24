import { DocShell } from "@/components/DocShell";
import { Markdown } from "@/components/Markdown";
import { getCurrentUser } from "@/server/auth";
import { getI18n } from "@/i18n/server";
import { PARSER_COVERAGE_MD } from "@/generated/parser-coverage";
import { FRIENDLY_CALLS, categoryLabel, friendlyText } from "@pinflow/block-definitions";

export async function generateMetadata() { return { title: (await getI18n()).t("meta.subset") }; }
export const dynamic = "force-dynamic";

const FALLBACK = `# PinFlow Arduino Visual Subset v1

The detailed parser coverage document (\`docs/parser-coverage.md\`) is not present in this build. Summary of what becomes native blocks:

- Sketch structure: \`setup()\`, \`loop()\`, user functions with parameters, includes, simple \`#define\`, global/local variables, constants and arrays, library object construction.
- Control flow: \`if / else if / else\`, \`for\`, \`while\`, \`do … while\`, \`switch / case / default\`, \`break\`, \`continue\`, \`return\`.
- Expressions: literals, identifiers, arithmetic / comparison / logical / bitwise / unary operators, \`++/--\`, parentheses, ternary, indexing, calls and method calls.
- Everything else (templates, lambdas, classes, casts, conditional compilation, complex macros) is preserved verbatim as **Advanced C++** with an explanation.`;

export default async function SubsetPage() {
  const user = await getCurrentUser().catch(() => null);
  const { locale, t } = await getI18n();
  // The friendly-block table follows the UI language (block captions + categories); the parser reference stays English.
  const table = `\n\n## ${t("docs.friendlyTitle")}\n\n| ${t("docs.colBlock")} | C++ | ${t("docs.colCategory")} |\n|---|---|---|\n${FRIENDLY_CALLS.map((f) => `| ${friendlyText(f, locale).label.replace(/%OBJ/g, "dht").replace(/%([A-Z_]+)/g, (_m, n: string) => n.toLowerCase()).replace(/\|/g, "/")} | \`${f.callee ?? `${f.object ?? "dht"}.${f.method}`}(${f.args.map((a) => a.toLowerCase()).join(", ")})\` | ${categoryLabel(f.category, locale)} |`).join("\n")}\n\n${t("docs.friendlyNote")}`;
  const note = locale === "en" ? "" : `> ${t("docs.englishOnly")}\n\n`;
  return <DocShell signedIn={!!user}><div lang={locale === "en" ? undefined : "en"} dir="ltr"><Markdown source={note + (PARSER_COVERAGE_MD ?? FALLBACK)} /></div><div><Markdown source={table} /></div></DocShell>;
}
