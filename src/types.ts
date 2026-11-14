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
  output: string;
};

export type ReviewResult = {
  report: string;
  /** False if any validation or check failed. Adapters use this for exit status. */
  allChecksPassed: boolean;
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