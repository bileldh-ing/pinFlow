import { DocShell } from "@/components/DocShell";
import { Markdown } from "@/components/Markdown";
import { getCurrentUser } from "@/server/auth";

export const metadata = { title: "Documentation" };
export const dynamic = "force-dynamic";

const DOC = `# PinFlow Studio documentation

PinFlow Studio edits Arduino and ESP32 sketches as **real C++** and as **blocks** at the same time. This page covers the essentials; the exact language coverage lives in [Supported C++ subset](/docs/arduino-subset).

## Getting started

1. [Create an account](/signup) — projects are private by default.
2. Pick your skill level, board and layout during onboarding, or skip it.
3. Create a project from a template (the DHT11 + ESP32 example is a good start), a blank sketch, or import an \`.ino\`, \`.cpp\`, \`.h\` or sketch \`.zip\`.

## The workbench

- **Blocks** (left) and **code** (right) show the same program. Drag the divider to resize; choose *side by side*, *blocks first*, *code first* or *focus* in the top bar. Pane sizes are remembered.
- **Editing blocks** regenerates the code for that change and applies a minimal edit to the code editor, so your cursor stays put.
- **Editing code** is parsed in a background worker about 300 ms after you stop typing. If it parses, the blocks update in place; your block layout is kept.
- **Syntax errors** never clear your blocks: they keep showing the last valid parse, with a banner and the error in the gutter. Use *Retry* after fixing.
- **Advanced C++ (preserved)** blocks hold code the visual subset cannot express. Their text is kept byte-for-byte; edit it in the inspector or in the code editor. Deleting one asks for confirmation.
- **Undo / redo** (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) restore code and blocks together from one shared history.
- **Click in the code** to select the block that produced it; **select a block** to highlight its code.
- The **left rail** has block search (by name, keyword or alias), variables, libraries, board pins, diagnostics and the coverage report. The **inspector** shows details, source mapping and pin warnings for the selected block.

## Saving

Changes autosave about 1.5 s after you pause. The status chip never says *Saved* before the server confirms. If you go offline, changes are kept in your browser (IndexedDB) and saved when you reconnect; after a crash or reload you are offered to recover them. If another tab saved first you get a conflict dialog — reload the latest, or keep yours as a duplicate. Nothing is silently overwritten.

## Compiling {#compile}

**Compile** saves first, then sends that exact saved revision to the PinFlow compile worker, which runs the real Arduino CLI toolchain in an isolated job. Diagnostics are clickable and jump to the code (and the owning block). If you keep editing, the result is marked **outdated** because its source hash no longer matches. If no compile worker is configured or reachable, PinFlow says so — it never fakes a success.

**Upload** needs the optional local *PinFlow Bridge* and is disabled until it exists.

## Changelog {#changelog}

- **0.1.0** — first public build: synchronized Blockly + Monaco workbench, tree-sitter parser in a Web Worker, DHT library blocks, raw-code preservation, autosave with revisions and conflict detection, compile-worker integration, templates.
`;

export default async function DocsPage() {
  const user = await getCurrentUser().catch(() => null);
  return <DocShell signedIn={!!user}><Markdown source={DOC.replace(/ \{#\w+\}/g, "")} /></DocShell>;
}
