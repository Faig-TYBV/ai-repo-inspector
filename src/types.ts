import type { CheckName } from "./core.js";

export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
};

export type ValidationResult = {
  command: string;
  status: "passed" | "failed";
  output: string;
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