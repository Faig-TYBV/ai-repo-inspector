import { exec, execFile } from "node:child_process";
import type { ValidationResult } from "./types.js";

type ChildError = (Error & { code?: unknown; signal?: NodeJS.Signals | null }) | null;

/**
 * Shared by both runners so CLI and MCP classify outcomes identically:
 * - exited 0                    -> "passed"
 * - exited non-zero (numeric)   -> "failed" with that exit code
 * - killed by a signal          -> "failed" with exitCode null
 * - anything else (e.g. ENOENT: program or cwd missing) -> reject; that is a
 *   real execution error, not a check result.
 * Output printed before a failure is kept.
 */
function settle(
  label: string,
  error: ChildError,
  stdout: string,
  stderr: string,
  resolve: (result: ValidationResult) => void,
  reject: (error: Error) => void,
): void {
  const output = stdout || stderr;
  if (!error) {
    resolve({ command: label, status: "passed", exitCode: 0, output });
  } else if (typeof error.code === "number") {
    resolve({ command: label, status: "failed", exitCode: error.code, output });
  } else if (error.signal) {
    resolve({ command: label, status: "failed", exitCode: null, output });
  } else {
    reject(error);
  }
}

/** Runs a fixed program with fixed arguments via execFile, with no shell. */
export function runProgram(label: string, file: string, args: string[], cwd: string): Promise<ValidationResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd }, (error, stdout, stderr) => {
      settle(label, error, stdout, stderr, resolve, reject);
    });
  });
}

export function runValidation(command: string, cwd: string): Promise<ValidationResult> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      settle(command, error, stdout, stderr, resolve, reject);
    });
  });
}

export async function runValidations(commands: string[], cwd: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd));
  }
  return results;
}