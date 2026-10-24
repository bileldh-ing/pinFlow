/**
 * Minimal typing of Blockly's JSON serialization format
 * (https://docs.blockly.com/guides/configure/serialization/), restricted to
 * what PinFlow emits/consumes. Kept DOM-free so the adapter runs in Node,
 * in Web Workers and on the server.
 */
export interface BlockState {
  type: string;
  id: string;
  x?: number;
  y?: number;
  collapsed?: boolean;
  disabledReasons?: string[];
  /** Legacy (pre-v11) flag, still accepted on input. */
  enabled?: boolean;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockState; shadow?: BlockState }>;
  next?: { block?: BlockState; shadow?: BlockState };
  extraState?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface WorkspaceState {
  blocks?: { languageVersion: number; blocks: BlockState[] };
  variables?: unknown[];
  [k: string]: unknown;
}

export const MANUALLY_DISABLED = "MANUALLY_DISABLED";
