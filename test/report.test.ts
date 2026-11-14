import { describe, expect, it } from "vitest";
import { markdownReport } from "../src/report.js";

describe("markdownReport", () => {
  it("lists changed files and validation output", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [{ path: "src/index.ts", status: "modified" }],
      validationResults: [{ command: "npm test", status: "passed", exitCode: 0, timedOut: false, output: "ok" }],
      maxChangedFiles: 500,
    });

    expect(report).toContain("src/index.ts (modified)");
    expect(report).toContain("npm test");
    expect(report).toContain("ok");
  });

  it("lists only the first maxChangedFiles files and says how many were left out", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"].map((path) => ({ path, status: "added" as const })),
      validationResults: [],
      maxChangedFiles: 3,
    });

    expect(report).toContain("- c.ts (added)");
    expect(report).not.toContain("d.ts");
    expect(report).not.toContain("e.ts");
    expect(report).toContain("… and 2 more files not shown");
  });

  it("shows a timed-out check as failed (timed out)", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [],
      validationResults: [{ command: "npm test", status: "failed", exitCode: null, timedOut: true, output: "STARTED" }],
      maxChangedFiles: 500,
    });

    expect(report).toContain("Status: failed (timed out)");
  });
});