import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Pin identity and signing so fixtures don't depend on the machine's git config.
function git(cwd: string, args: string[]): void {
  execFileSync(
    "git",
    ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, stdio: "pipe" },
  );
}

/**
 * Creates a temporary repo with a `main` branch (named explicitly, not the
 * machine default) holding one commit, and a checked-out `feature` branch
 * that adds `addedFile`. So `main...HEAD` reports exactly that one file.
 * `baseFiles` (name -> content) are committed on `main`, so they don't show
 * up in the diff.
 */
export function createFixtureRepo(addedFile: string, baseFiles: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), "inspector-fixture-"));
  git(dir, ["init", "-q", "-b", "main"]);
  writeFileSync(path.join(dir, "base.txt"), "base\n");
  for (const [name, content] of Object.entries(baseFiles)) {
    writeFileSync(path.join(dir, name), content);
  }
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "base"]);
  git(dir, ["checkout", "-q", "-b", "feature"]);
  writeFileSync(path.join(dir, addedFile), "change\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "feature"]);
  return dir;
}

/**
 * Base files for a repo whose check fails: `fail.js` prints BEFORE_FAILURE
 * then exits 3, and the `test` script runs it. Uses process.exitCode rather
 * than process.exit() so stdout is flushed before exit on every platform.
 */
export const BEFORE_FAILURE = "BEFORE-FAILURE";
export const failingProjectFiles: Record<string, string> = {
  "package.json": JSON.stringify({ name: "fixture", version: "0.0.0", private: true, scripts: { test: "node fail.js" } }),
  "fail.js": `console.log(${JSON.stringify(BEFORE_FAILURE)});\nprocess.exitCode = 3;\n`,
};

export function removeFixture(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}
