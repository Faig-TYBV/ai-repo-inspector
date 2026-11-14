import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { npmInvocation } from "../src/core.js";
import { runProgram, runValidation } from "../src/validation.js";
import { createFixtureRepo, removeFixture } from "./helpers/fixture.js";

const limits = { capBytes: 32 * 1024, captureLimitBytes: 1024 * 1024 };
const noTimeout = 0; // Node's default: never time out

// Guards: a non-zero exit is a "failed" result, but a process that cannot be
// started at all is a real execution error and must still reject.
describe("execution errors still reject", () => {
  it("runProgram rejects when the program does not exist", async () => {
    await expect(
      runProgram("missing", "no-such-program-inspector-xyz", [], process.cwd(), limits, noTimeout),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("runValidation rejects when the working directory does not exist", async () => {
    const missingDir = mkdtempSync(path.join(tmpdir(), "inspector-missing-"));
    rmSync(missingDir, { recursive: true });
    await expect(runValidation("node -v", missingDir, limits, noTimeout)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("timeouts", () => {
  // hang.js prints STARTED, then stays alive for 15 s and exits by itself, so
  // if the timeout doesn't work the test fails on time instead of hanging.
  const hangFiles = {
    "package.json": JSON.stringify({ name: "fixture", version: "0.0.0", private: true, scripts: { test: "node hang.js" } }),
    "hang.js": 'console.log("STARTED");\nsetTimeout(() => {}, 15000);\n',
  };
  const timeoutMs = 500;
  // Must return well before hang.js exits on its own. If this fails on Linux
  // CI, the callback is waiting on an orphaned grandchild: see F5 option B.
  const mustReturnWithinMs = 5000;
  let repo: string;

  beforeAll(() => {
    repo = createFixtureRepo("only-in-hang.txt", hangFiles);
  });

  afterAll(() => {
    // Known limitation (F5): the timeout kills only the direct child (shell or
    // npm), so the orphaned hang.js can still hold the fixture dir as its cwd
    // for a few seconds. On Windows that blocks deletion; leave it in tmp.
    try {
      if (repo) removeFixture(repo);
    } catch {
      // ignore
    }
  });

  it("a shell validation that hangs times out as a failed result (CLI path)", async () => {
    const started = Date.now();
    const result = await runValidation("node hang.js", repo, limits, timeoutMs);

    expect(Date.now() - started).toBeLessThan(mustReturnWithinMs);
    expect(result).toMatchObject({ status: "failed", exitCode: null, timedOut: true });
    expect(result.output).toContain("STARTED");
  }, 30_000);

  it("an npm check that hangs times out as a failed result (MCP path)", async () => {
    const npm = npmInvocation();
    const started = Date.now();
    const result = await runProgram("check: test", npm.file, [...npm.prefixArgs, "test"], repo, limits, timeoutMs);

    expect(Date.now() - started).toBeLessThan(mustReturnWithinMs);
    expect(result).toMatchObject({ status: "failed", exitCode: null, timedOut: true });
    expect(result.output).toContain("STARTED");
  }, 30_000);
});
