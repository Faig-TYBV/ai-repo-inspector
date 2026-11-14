import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureRepo, removeFixture } from "./helpers/fixture.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = path.join(projectRoot, "src", "mcp-server.ts");
// Absolute file URL: the server runs with cwd set to a fixture, where a bare
// `--import tsx` could not be resolved. Works the same on Windows and Linux.
const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return content.map((part) => part.text ?? "").join("\n");
}

describe("MCP review_repository", () => {
  let repoA: string; // server's working directory
  let repoB: string; // repository the caller asks about
  let client: Client;

  beforeAll(async () => {
    repoA = createFixtureRepo("only-in-a.txt");
    repoB = createFixtureRepo("only-in-b.txt");
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
});
