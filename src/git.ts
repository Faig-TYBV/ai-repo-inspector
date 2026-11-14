import { execFileSync } from "node:child_process";
import type { ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  }).trim();
}

/**
 * Throws unless `ref` names a commit. Rejects anything starting with "-" so a
 * caller-supplied ref can never be parsed as a git option (e.g. --output=).
 */
export function verifyBaseRef(repositoryPath: string, ref: string): void {
  if (ref.startsWith("-")) {
    throw new Error(`Invalid base ref ${JSON.stringify(ref)}: must not start with "-"`);
  }
  try {
    git(repositoryPath, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`]);
  } catch {
    throw new Error(`Base ref ${JSON.stringify(ref)} does not resolve to a commit in ${repositoryPath}`);
  }
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  // --end-of-options: defence in depth, so the range is never read as an option.
  const output = git(repositoryPath, ["diff", "--name-status", "--end-of-options", `${base}...HEAD`]);

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, ...pathParts] = line.split("\t");
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      return { path: pathParts.join("\t"), status };
    });
}