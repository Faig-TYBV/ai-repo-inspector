import type { CheckName } from "./core.js";

export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
};

export type ValidationResult = {
  command: string;
  status: "passed" | "failed";
  /** Process exit code; null if the process was killed by a signal. */
  exitCode: number | null;
  /** True if the process was killed because it hit the time limit. */
  timedOut: boolean;
  output: string;
};

/** Machine-readable outcome of one validation or check (no output text). */
export type CheckSummary = {
  /** The check name (MCP) or the command (CLI --validate). */
  name: string;
  status: ValidationResult["status"];
  exitCode: number | null;
  timedOut: boolean;
};

export type ReviewResult = {
  report: string;
  /** False if any validation or check failed. Adapters use this for exit status. */
  allChecksPassed: boolean;
  checks: CheckSummary[];
};

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  /** Free-form shell commands. CLI only (trusted developer interface). */
  validationCommands?: string[];
  /** Named, allowlisted checks (see CHECKS in core.ts). */
  checks?: CheckName[];
  format?: "markdown" | "json";
};