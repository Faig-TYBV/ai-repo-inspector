import { existsSync } from "node:fs";
import path from "node:path";
import { changedFiles, verifyBaseRef } from "./git.js";
import { markdownReport } from "./report.js";
import type { ReviewRequest, ReviewResult, ValidationResult } from "./types.js";
import { runProgram, runValidations } from "./validation.js";

/**
 * Allowlisted checks for the untrusted (MCP) interface. Each name maps to a
 * fixed npm argument list, run via execFile with no shell, so a caller can
 * pick a check but never supply its own command.
 *
 * NOTE: allowlisting stops caller-chosen commands, NOT code execution by the
 * inspected repo itself: `npm test` runs whatever that repo's package.json
 * scripts define. Reviewing untrusted repos safely needs a sandbox
 * (container/VM, no network, minimal env), which is out of scope.
 */
export const CHECKS = {
  test: ["test"],
  typecheck: ["run", "typecheck"],
} as const satisfies Record<string, readonly string[]>;

export type CheckName = keyof typeof CHECKS;
export const CHECK_NAMES = Object.keys(CHECKS) as [CheckName, ...CheckName[]];

/**
 * How to invoke npm without a shell. On Windows npm is `npm.cmd`, which
 * execFile refuses to run without a shell (spawn EINVAL), so we run npm's JS
 * entry point with the current node binary instead. On other platforms plain
 * `npm` is a fallback, since execFile can run it directly.
 */
export function npmInvocation(): { file: string; prefixArgs: string[] } {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    process.env.npm_execpath,
    path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"), // Windows layout
    path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"), // Unix layout
  ];
  for (const candidate of candidates) {
    if (candidate && path.basename(candidate) === "npm-cli.js" && existsSync(candidate)) {
      return { file: process.execPath, prefixArgs: [candidate] };
    }
  }
  if (process.platform !== "win32") {
    return { file: "npm", prefixArgs: [] };
  }
  throw new Error("npm not found: could not locate npm-cli.js next to node, so the check cannot run");
}

async function runCheck(name: CheckName, cwd: string): Promise<ValidationResult> {
  // Defence in depth: core enforces the allowlist even if an adapter doesn't.
  if (!Object.hasOwn(CHECKS, name)) {
    throw new Error(`Unknown check: ${String(name)}`);
  }
  const args = CHECKS[name];
  const npm = npmInvocation();
  return runProgram(`check: ${name} (npm ${args.join(" ")})`, npm.file, [...npm.prefixArgs, ...args], cwd);
}

export async function reviewRepository(request: ReviewRequest): Promise<ReviewResult> {
  // Input error, not a failed check: thrown before anything runs.
  verifyBaseRef(request.repositoryPath, request.baseRef ?? "main");
  const files = changedFiles(request.repositoryPath, request.baseRef);
  const validations = await runValidations(
    request.validationCommands ?? [],
    request.repositoryPath,
  );
  for (const check of request.checks ?? []) {
    validations.push(await runCheck(check, request.repositoryPath));
  }
  return {
    report: markdownReport({
      repositoryPath: request.repositoryPath,
      changedFiles: files,
      validationResults: validations,
    }),
    allChecksPassed: validations.every((result) => result.status === "passed"),
  };
}
