import { exec, execFile } from "node:child_process";
import type { ValidationResult } from "./types.js";

type ChildError = (Error & { code?: unknown; signal?: NodeJS.Signals | null }) | null;

/** Output limits, owned by core (see OUTPUT_CAP_BYTES / CAPTURE_LIMIT_BYTES). */
export type OutputLimits = {
  /** Bytes of output kept per check: the tail, since failures are usually at the end. */
  capBytes: number;
  /** Hard memory ceiling per stream while the process runs (passed as maxBuffer). */
  captureLimitBytes: number;
};

/** Keeps the last `capBytes` bytes of `output` and reports how many were dropped. */
function keepTail(output: string, capBytes: number): { text: string; omitted: number } {
  const bytes = Buffer.from(output, "utf8");
  if (bytes.length <= capBytes) {
    return { text: output, omitted: 0 };
  }
  const omitted = bytes.length - capBytes;
  return { text: bytes.subarray(omitted).toString("utf8"), omitted };
}

/**
 * Shared by both runners so CLI and MCP classify outcomes identically:
 * - exited 0                    -> "passed"
 * - exited non-zero (numeric)   -> "failed" with that exit code
 * - output over captureLimit    -> "failed" with exitCode null (Node killed it)
 * - killed by a signal          -> "failed" with exitCode null
 * - anything else (e.g. ENOENT: program or cwd missing) -> reject; that is a
 *   real execution error, not a check result.
 * Output printed before a failure is kept, cut to the last capBytes.
 */
function settle(
  label: string,
  error: ChildError,
  stdout: string,
  stderr: string,
  limits: OutputLimits,
  resolve: (result: ValidationResult) => void,
  reject: (error: Error) => void,
): void {
  const { text, omitted } = keepTail(stdout || stderr, limits.capBytes);
  const output = omitted > 0 ? `[output truncated: ${omitted} bytes omitted]\n${text}` : text;
  if (!error) {
    resolve({ command: label, status: "passed", exitCode: 0, output });
  } else if (typeof error.code === "number") {
    resolve({ command: label, status: "failed", exitCode: error.code, output });
  } else if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    // Node keeps the *first* captureLimitBytes, so this is the end of what was
    // captured, not the true end of the output.
    const marker =
      `[output truncated: process killed after exceeding ${limits.captureLimitBytes} bytes of output; ` +
      "showing the end of what was captured]";
    resolve({ command: label, status: "failed", exitCode: null, output: `${marker}\n${text}` });
  } else if (error.signal) {
    resolve({ command: label, status: "failed", exitCode: null, output });
  } else {
    reject(error);
  }
}

/** Runs a fixed program with fixed arguments via execFile, with no shell. */
export function runProgram(
  label: string,
  file: string,
  args: string[],
  cwd: string,
  limits: OutputLimits,
): Promise<ValidationResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd, maxBuffer: limits.captureLimitBytes }, (error, stdout, stderr) => {
      settle(label, error, stdout, stderr, limits, resolve, reject);
    });
  });
}

export function runValidation(command: string, cwd: string, limits: OutputLimits): Promise<ValidationResult> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: limits.captureLimitBytes }, (error, stdout, stderr) => {
      settle(command, error, stdout, stderr, limits, resolve, reject);
    });
  });
}

export async function runValidations(
  commands: string[],
  cwd: string,
  limits: OutputLimits,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd, limits));
  }
  return results;
}
