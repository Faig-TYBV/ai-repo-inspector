import { exec, execFile } from "node:child_process";
import type { ValidationResult } from "./types.js";

/** Runs a fixed program with fixed arguments via execFile, with no shell. */
export function runProgram(label: string, file: string, args: string[], cwd: string): Promise<ValidationResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ command: label, status: "passed", output: stdout || stderr });
    });
  });
}

export function runValidation(command: string, cwd: string): Promise<ValidationResult> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ command, status: "passed", output: stdout || stderr });
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