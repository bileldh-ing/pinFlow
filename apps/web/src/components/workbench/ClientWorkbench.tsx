"use client";
import dynamic from "next/dynamic";
import type { WorkbenchProps } from "./Workbench";

/** Blockly + Monaco are browser-only: load the workbench without SSR. */
const Inner = dynamic(() => import("./Workbench").then((m) => m.Workbench), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-[320px] place-items-center text-sm text-muted" data-testid="workbench-loading">Loading workbench…</div>,
});

export function ClientWorkbench(props: WorkbenchProps) { return <Inner {...props} />; }
