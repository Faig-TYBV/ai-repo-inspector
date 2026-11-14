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
 */
export function createFixtureRepo(addedFile: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "inspector-fixture-"));
  git(dir, ["init", "-q", "-b", "main"]);
  writeFileSync(path.join(dir, "base.txt"), "base\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "base"]);
  git(dir, ["checkout", "-q", "-b", "feature"]);
  writeFileSync(path.join(dir, addedFile), "change\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "feature"]);
  return dir;
}

export function removeFixture(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}
