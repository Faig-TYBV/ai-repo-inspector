import type { ChangedFile, ValidationResult } from "./types.js";

type ReportInput = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
  /** At most this many changed files are listed; the rest are counted. */
  maxChangedFiles: number;
};

export function markdownReport(input: ReportInput): string {
  const lines = [`# Review Report: ${input.repositoryPath}`, "", "## Changed files"];
  for (const file of input.changedFiles.slice(0, input.maxChangedFiles)) {
    lines.push(`- ${file.path} (${file.status})`);
  }
  const notShown = input.changedFiles.length - input.maxChangedFiles;
  if (notShown > 0) {
    lines.push(`- … and ${notShown} more files not shown`);
  }
  lines.push("", "## Validation output");
  for (const result of input.validationResults) {
    const exit = result.timedOut
      ? "timed out"
      : result.exitCode === null
        ? "no exit code"
        : `exit code ${result.exitCode}`;
    lines.push(`### ${result.command}`, `Status: ${result.status} (${exit})`, "```", result.output, "```");
  }
  return lines.join("\n");
}