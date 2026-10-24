"use client";
import { useEffect, useRef } from "react";
import { buildToolbox } from "@pinflow/block-definitions";
import { Blockly, defineGlassThemes, registerPinflowBlocks } from "@pinflow/block-definitions/blockly";
import type { WorkbenchEngine } from "./engine";

let shortcutsPatched = false;

function sansFamily(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return getComputedStyle(document.documentElement).getPropertyValue("--font-jakarta").trim() || undefined;
}
let activeEngine: WorkbenchEngine | null = null;

/** Route Blockly's Ctrl/Cmd+Z / Ctrl+Y / Ctrl+Shift+Z to the unified history instead of Blockly's own stack. */
function patchShortcuts() {
  if (shortcutsPatched) return;
  shortcutsPatched = true;
  const reg = Blockly.ShortcutRegistry.registry;
  const K = Blockly.utils.KeyCodes;
  const key = (k: number, mods: number[]) => reg.createSerializedKey(k, mods);
  for (const name of ["undo", "redo"]) { try { reg.unregister(name); } catch { /* not registered */ } }
  reg.register({ name: "undo", preconditionFn: () => !!activeEngine, callback: () => { activeEngine?.undo(); return true; }, keyCodes: [key(K.Z, [K.CTRL]), key(K.Z, [K.META])] });
  reg.register({ name: "redo", preconditionFn: () => !!activeEngine, callback: () => { activeEngine?.redo(); return true; }, keyCodes: [key(K.Z, [K.CTRL, K.SHIFT]), key(K.Z, [K.META, K.SHIFT]), key(K.Y, [K.CTRL])] });
}

export function BlocklyPane({ engine, theme, readOnly = false }: { engine: WorkbenchEngine; theme: "dark" | "light"; readOnly?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);

  useEffect(() => {
    if (!host.current) return;
    registerPinflowBlocks();
    patchShortcuts();
    const themes = defineGlassThemes(sansFamily());
    const ws = Blockly.inject(host.current, {
      media: "/blockly-media/",
      toolbox: readOnly ? undefined : (buildToolbox() as unknown as Blockly.utils.toolbox.ToolboxDefinition),
      theme: theme === "light" ? themes.light : themes.dark,
      renderer: "zelos",
      readOnly,
      sounds: false,
      // Built-in zoom/trash controls are SVG sprites that rendered as blurry patches in Chromium
      // screenshots; the workbench draws its own crisp zoom controls outside the SVG instead.
      trashcan: false,
      grid: { spacing: 24, length: 2, colour: theme === "light" ? "#e9dfd5" : "#2a231e", snap: true },
      zoom: { controls: false, wheel: false, startScale: 0.72, maxScale: 1.6, minScale: 0.35, scaleSpeed: 1.15, pinch: true },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    wsRef.current = ws;
    activeEngine = engine;
    engine.attachBlockly(ws);
    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(host.current);
    // Block text is measured when rendered: re-render once the self-hosted font has loaded
    // so labels never overflow their blocks.
    void document.fonts?.ready.then(() => { if (wsRef.current === ws) { ws.setTheme(ws.getTheme()); Blockly.svgResize(ws); } });
    return () => { ro.disconnect(); engine.detachBlockly(ws); if (activeEngine === engine) activeEngine = null; ws.dispose(); wsRef.current = null; };
    // theme handled below; engine identity is stable for the pane's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, readOnly]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const themes = defineGlassThemes(sansFamily());
    ws.setTheme(theme === "light" ? themes.light : themes.dark);
  }, [theme]);

  return <div ref={host} className="h-full w-full" data-testid="blockly-host" aria-label="Blocks workspace" role="application" onFocus={() => { activeEngine = engine; }} />;
}

/** Crisp HTML zoom controls (opaque, no backdrop-filter) rendered beside — not inside — the Blockly SVG. */
export function BlocklyZoomControls({ className = "" }: { className?: string }) {
  const zoom = (d: number | "fit" | "reset") => {
    const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg | null;
    if (!ws) return;
    if (d === "fit") ws.zoomToFit();
    else if (d === "reset") { ws.setScale(0.72); ws.scrollCenter(); }
    else ws.zoomCenter(d);
  };
  const btn = "pf-press grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-fg";
  return (
    <div className={`glass-solid flex items-center gap-0.5 rounded-full p-1 ${className}`} role="group" aria-label="Zoom blocks" data-testid="blockly-zoom">
      <button type="button" className={btn} aria-label="Zoom out" title="Zoom out" onClick={() => zoom(-1)}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 7h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
      <button type="button" className={btn} aria-label="Fit blocks" title="Fit all blocks" onClick={() => zoom("fit")}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9" /></svg></button>
      <button type="button" className={btn} aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1)}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 7h8M7 3v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
    </div>
  );
}
