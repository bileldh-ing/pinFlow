/**
 * Public API types for the compile worker. No Node imports here: the web app may import this
 * file (and client.ts) in browser or server bundles.
 */
import type { Diagnostic } from "./diagnostics.js";
import type { SizeReport } from "./sizes.js";

export type { Diagnostic, SizeReport };

export type JobStatus = "queued" | "preparing" | "compiling" | "succeeded" | "failed" | "canceled" | "timeout";

export const TERMINAL_STATUSES: readonly JobStatus[] = ["succeeded", "failed", "canceled", "timeout"];

export interface SubmitJobRequest {
  /** Opaque id; integers are accepted and echoed back as strings. */
  projectId: string | number;
  revisionId: string | number;
  fqbn: string;
  /** Paths relative to the sketch root, e.g. "blink.ino", "src/util.cpp". */
  files: Array<{ path: string; content: string }>;
  /** Client-computed hash of the source revision; echoed back so the UI can mark results outdated. */
  sourceHash: string;
  /** Required only when several root-level .ino files are sent. */
  sketchName?: string;
}

export interface SubmitJobResponse {
  jobId: string;
  status: JobStatus;
}

export interface ToolchainInfo {
  arduinoCli: string;
  platform: { id: string; version: string } | null;
  libraries: Array<{ name: string; version: string }>;
  /** Platform arduino-cli actually used for this build (from its JSON result). */
  buildPlatform?: { id: string; version: string };
  /** Libraries arduino-cli reported as actually used by this build. */
  usedLibraries?: Array<{ name: string; version: string }>;
  /** true when arduino-cli, this board's core and the allowlisted libraries matched toolchain.lock.json at startup. */
  verified: boolean;
}

export interface JobView {
  jobId: string;
  projectId: string;
  revisionId: string;
  fqbn: string;
  sketchName: string;
  sourceHash: string;
  /** sha256 over sorted "path\0content\0" pairs, computed by the worker. */
  computedSourceHash: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  exitCode?: number | null;
  diagnostics: Diagnostic[];
  sizes?: SizeReport;
  toolchain: ToolchainInfo;
  log: { text: string; truncated: boolean; bytes: number };
  /** Human-readable reason for failed/timeout/canceled jobs. */
  error?: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
