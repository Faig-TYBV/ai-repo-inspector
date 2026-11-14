import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reviewRepository } from "../src/core.js";
import { changedFiles } from "../src/git.js";
import { createFixtureRepo, removeFixture } from "./helpers/fixture.js";

describe("reviewRepository baseRef validation", () => {
  let repo: string;
  let outDir: string; // empty dir an injected --output= would write into

  beforeAll(() => {
    repo = createFixtureRepo("only-in-core.txt");
    outDir = mkdtempSync(path.join(tmpdir(), "inspector-inject-"));
  });

  afterAll(() => {
    if (repo) removeFixture(repo);
    if (outDir) removeFixture(outDir);
  });

  it("rejects a baseRef that is a git option, and writes no file", async () => {
    await expect(
      reviewRepository({ repositoryPath: repo, baseRef: `--output=${path.join(outDir, "pwned")}` }),
    ).rejects.toThrow(/must not start with "-"/);
    expect(readdirSync(outDir)).toEqual([]);
  });

  // Guards the second layer on its own: even without verifyBaseRef, the
  // --end-of-options in the diff call makes git refuse an injected option.
  it("changedFiles makes git refuse an injected option, and writes no file", () => {
    expect(() => changedFiles(repo, `--output=${path.join(outDir, "pwned")}`)).toThrow();
    expect(readdirSync(outDir)).toEqual([]);
  });

  it("gives a clear error for a baseRef that does not exist", async () => {
    await expect(
      reviewRepository({ repositoryPath: repo, baseRef: "does-not-exist" }),
    ).rejects.toThrow(/Base ref "does-not-exist" does not resolve to a commit/);
  });

  it("still works with a valid baseRef", async () => {
    const result = await reviewRepository({ repositoryPath: repo, baseRef: "main" });
    expect(result.report).toContain("only-in-core.txt (added)");
  });
});

describe("reviewRepository output cap", () => {
  // big.js prints FIRST-LINE, ~2 MB of 100-byte lines, then FINAL-LINE: more
  // than Node's default 1 MiB maxBuffer, which used to crash the review.
  const bigOutputFiles = {
    "package.json": JSON.stringify({ name: "fixture", version: "0.0.0", private: true, scripts: { test: "node big.js" } }),
    "big.js": [
      'const line = "x".repeat(99) + "\\n";',
      'process.stdout.write("FIRST-LINE\\n" + line.repeat(20000));',
      'console.log("FINAL-LINE");',
      "",
    ].join("\n"),
  };
  const maxReportBytes = 32 * 1024 + 1024; // per-check cap + headings/markers
  let repo: string;

  beforeAll(() => {
    repo = createFixtureRepo("only-in-big.txt", bigOutputFiles);
  });

  afterAll(() => {
    if (repo) removeFixture(repo);
  });

  function expectTailOnly(report: string): void {
    expect(report).toContain("[output truncated:");
    expect(report).toContain("FINAL-LINE");
    expect(report).not.toContain("FIRST-LINE");
    expect(Buffer.byteLength(report)).toBeLessThan(maxReportBytes);
  }

  it("keeps the tail of ~2 MB output from a shell validation (CLI path)", async () => {
    const result = await reviewRepository({ repositoryPath: repo, validationCommands: ["node big.js"] });
    expectTailOnly(result.report);
  }, 30_000);

  it("keeps the tail of ~2 MB output from an allowlisted check (MCP path)", async () => {
    const result = await reviewRepository({ repositoryPath: repo, checks: ["test"] });
    expectTailOnly(result.report);
  }, 30_000);
});
