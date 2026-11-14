import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BEFORE_FAILURE, createFixtureRepo, failingProjectFiles, removeFixture } from "./helpers/fixture.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = path.join(projectRoot, "src", "mcp-server.ts");
// Absolute file URL: the server runs with cwd set to a fixture, where a bare
// `--import tsx` could not be resolved. Works the same on Windows and Linux.
const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

// Repo B carries a package.json whose `test` script prints MARKER, so we can
// tell from the report whether anything was actually executed. The marker
// text never appears in any command string we send.
const MARKER = "FIXTURE-TEST-RAN";
const npmProjectFiles = {
  "package.json": JSON.stringify({ name: "fixture", version: "0.0.0", private: true, scripts: { test: "node print-marker.js" } }),
  "print-marker.js": `console.log(${JSON.stringify(MARKER)});\n`,
};

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return content.map((part) => part.text ?? "").join("\n");
}

describe("MCP review_repository", () => {
  let repoA: string; // server's working directory
  let repoB: string; // repository the caller asks about
  let repoC: string; // repository whose `test` check fails
  let client: Client;

  beforeAll(async () => {
    repoA = createFixtureRepo("only-in-a.txt");
    repoB = createFixtureRepo("only-in-b.txt", npmProjectFiles);
    repoC = createFixtureRepo("only-in-c.txt", failingProjectFiles);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", tsxLoader, serverEntry],
      cwd: repoA,
      stderr: "pipe",
    });
    client = new Client({ name: "mcp-server-test", version: "0.0.0" });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    if (repoA) removeFixture(repoA);
    if (repoB) removeFixture(repoB);
    if (repoC) removeFixture(repoC);
  });

  it("inspects the repository given in repo_path, not the server's working directory", async () => {
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: repoB },
    });
    const report = textOf(result);

    expect(result.isError).toBeFalsy();
    expect(report).toContain(`# Review Report: ${repoB}`);
    expect(report).toContain("only-in-b.txt");
    expect(report).not.toContain("only-in-a.txt");
  }, 30_000);

  it("rejects a raw command string in checks", async () => {
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: repoB, checks: ["node print-marker.js"] },
    });
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text).toMatch(/Invalid enum value/);
    expect(text).not.toContain(MARKER);
  }, 30_000);

  it("runs an allowlisted check and includes its output in the report", async () => {
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: repoB, checks: ["test"] },
    });
    const report = textOf(result);

    expect(result.isError).toBeFalsy();
    expect(report).toContain("check: test");
    expect(report).toContain("Status: passed (exit code 0)");
    expect(report).toContain(MARKER);
  }, 30_000);

  it("reports a failing check as a result, not an error", async () => {
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: repoC, checks: ["test"] },
    });
    const report = textOf(result);

    expect(result.isError).toBeFalsy();
    expect(report).toContain("Status: failed (exit code 3)");
    expect(report).toContain(BEFORE_FAILURE);
    expect(result.structuredContent).toEqual({
      allChecksPassed: false,
      checks: [{ name: "test", status: "failed", exitCode: 3, timedOut: false }],
    });
  }, 30_000);

  it("rejects the removed validationCommands field by name, and runs nothing", async () => {
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: repoB, validationCommands: ["node print-marker.js"] },
    });
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text).toContain("validationCommands");
    expect(text).not.toContain(MARKER);
  }, 30_000);
});
