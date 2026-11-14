import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BEFORE_FAILURE, createFixtureRepo, failingProjectFiles, removeFixture } from "./helpers/fixture.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.join(projectRoot, "src", "cli.ts");
const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

describe("CLI review", () => {
  let repo: string;
  let outDir: string; // CLI cwd, so review-report.md lands here, not in the project

  beforeAll(() => {
    repo = createFixtureRepo("only-in-c.txt", failingProjectFiles);
    outDir = mkdtempSync(path.join(tmpdir(), "inspector-cli-out-"));
  });

  afterAll(() => {
    if (repo) removeFixture(repo);
    if (outDir) removeFixture(outDir);
  });

  it("writes the report and exits non-zero when a validation fails", () => {
    const run = spawnSync(
      process.execPath,
      ["--import", tsxLoader, cliEntry, "review", "--repo", repo, "--validate", "node fail.js"],
      { cwd: outDir, encoding: "utf8" },
    );
    const reportPath = path.join(outDir, "review-report.md");

    expect(run.status).toBe(1);
    expect(existsSync(reportPath)).toBe(true);
    const report = readFileSync(reportPath, "utf8");
    expect(report).toContain("Status: failed (exit code 3)");
    expect(report).toContain(BEFORE_FAILURE);
  }, 30_000);
});
