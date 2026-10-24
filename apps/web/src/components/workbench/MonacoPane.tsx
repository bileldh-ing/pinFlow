"use client";
import Editor, { loader } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import type * as Monaco from "monaco-editor";
import { installMonaco, setSymbolSource } from "./monaco-setup";
import type { WorkbenchEngine } from "./engine";

function monoFamily(): string {
  const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--font-jbmono").trim() : "";
  return `${v ? `${v}, ` : ""}"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
}

// Monaco is served from our own origin (copied by scripts/prepare-assets.mjs), never a CDN.
loader.config({ paths: { vs: "/monaco/vs" } });

export function MonacoPane({ engine, initialSource, theme, fontSize = 13, readOnly = false, wordWrap = false, minimap = false }: {
  engine: WorkbenchEngine; initialSource: string; theme: "dark" | "light"; fontSize?: number; readOnly?: boolean; wordWrap?: boolean; minimap?: boolean;
}) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  useEffect(() => { monacoRef.current?.editor.setTheme(theme === "light" ? "pinflow-light" : "pinflow-dark"); }, [theme]);
  useEffect(() => { editorRef.current?.updateOptions({ fontSize, wordWrap: wordWrap ? "on" : "off", minimap: { enabled: minimap } }); }, [fontSize, wordWrap, minimap]);

  return (
    <div className="h-full w-full" data-testid="monaco-host">
      <Editor
        defaultLanguage="cpp"
        defaultValue={initialSource}
        theme={theme === "light" ? "pinflow-light" : "pinflow-dark"}
        beforeMount={(monaco) => installMonaco(monaco as unknown as typeof Monaco)}
        onMount={(editor, monaco) => {
          editorRef.current = editor as unknown as Monaco.editor.IStandaloneCodeEditor;
          monacoRef.current = monaco as unknown as typeof Monaco;
          setSymbolSource(() => engine.getIr());
          engine.attachMonaco(editorRef.current, monacoRef.current);
          // Re-measure once the self-hosted mono font is ready so the cursor and selections line up.
          void document.fonts?.ready.then(() => monacoRef.current?.editor.remeasureFonts());
        }}
        loading={<div className="grid h-full place-items-center text-sm text-muted">Loading code editor…</div>}
        options={{
          readOnly, fontSize, fontFamily: monoFamily(), fontLigatures: true,
          minimap: { enabled: minimap }, wordWrap: wordWrap ? "on" : "off", scrollBeyondLastLine: false, smoothScrolling: true,
          renderLineHighlight: "line", tabSize: 2, insertSpaces: true, automaticLayout: true, padding: { top: 14, bottom: 14 }, cursorBlinking: "smooth", cursorSmoothCaretAnimation: "on", cursorWidth: 2, lineNumbersMinChars: 3, roundedSelection: true,
          bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true }, folding: true,
          formatOnPaste: false, formatOnType: false, "semanticHighlighting.enabled": false, ariaLabel: "Arduino C++ source",
        }}
      />
    </div>
  );
}
