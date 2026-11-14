#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CHECK_NAMES, reviewRepository } from "./core.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

server.registerTool(
  "review_repository",
  {
    description: "Inspects a Git repository and returns a review report.",
    // .strict(): unknown keys (e.g. the removed validationCommands) are an
    // error, not silently dropped, so a caller never believes they ran.
    inputSchema: z
      .object({
        repo_path: z.string().describe("Repository path to inspect."),
        baseRef: z.string().optional(),
        // MCP is the untrusted (agent) interface: it accepts only named,
        // allowlisted checks, never free-form shell commands. The CLI's free-form
        // --validate is the one intentional difference between the adapters.
        checks: z
          .array(z.enum(CHECK_NAMES))
          .optional()
          .describe(`Named checks to run in the repository: ${CHECK_NAMES.join(", ")}.`),
      })
      .strict(),
    // Machine-readable summary alongside the Markdown report. The SDK skips
    // output validation for isError results, so errors are unchanged.
    outputSchema: {
      allChecksPassed: z.boolean(),
      checks: z.array(
        z.object({
          name: z.string(),
          status: z.enum(["passed", "failed"]),
          exitCode: z.number().nullable(),
          timedOut: z.boolean(),
        }),
      ),
    },
  },
  async (input) => {
    const result = await reviewRepository({
      repositoryPath: input.repo_path,
      baseRef: input.baseRef,
      checks: input.checks,
    });
    // A failing check is a successful review, so this is not isError; the
    // pass/fail detail is in the report. Execution errors still throw.
    return {
      content: [{ type: "text", text: result.report }],
      structuredContent: { allChecksPassed: result.allChecksPassed, checks: result.checks },
    };
  },
);

await server.connect(new StdioServerTransport());