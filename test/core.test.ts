import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reviewRepository } from "../src/core.js";
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
