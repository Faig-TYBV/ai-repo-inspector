import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runProgram, runValidation } from "../src/validation.js";

// Guards: a non-zero exit is a "failed" result, but a process that cannot be
// started at all is a real execution error and must still reject.
describe("execution errors still reject", () => {
  it("runProgram rejects when the program does not exist", async () => {
    await expect(
      runProgram("missing", "no-such-program-inspector-xyz", [], process.cwd()),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("runValidation rejects when the working directory does not exist", async () => {
    const missingDir = mkdtempSync(path.join(tmpdir(), "inspector-missing-"));
    rmSync(missingDir, { recursive: true });
    await expect(runValidation("node -v", missingDir)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
