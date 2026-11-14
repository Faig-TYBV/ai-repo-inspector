# Repository Inspector

This is a small TypeScript developer tool that inspects changes in a Git
repository, runs optional validation commands, and produces a Markdown report.
It can be used from a command line or exposed to AI clients through MCP.

## Your task

Investigate the repository and improve it as you judge best. The starter works
for a narrow happy path, but production use may expose correctness, safety,
reliability, contract, output, documentation, or testing weaknesses.

You are not expected to finish everything. We care about how you investigate,
prioritize, implement, verify, and explain a meaningful scope.

## Product decision

This tool may be used directly by developers and by AI coding agents. Decide
whether its production interface should be **CLI-first**, **MCP-first**, or
**hybrid**. Implement improvements consistent with your decision.

There is no preferred label. Explain:

- The primary user and execution environment you assumed.
- The trust boundary and allowed capabilities.
- Reliability, discoverability, latency/context, and output-size tradeoffs.
- How the interfaces you continue to advertise stay behaviorally consistent.
- What evidence would change your decision.

## Time and rules

- Maximum **90 focused minutes** within 48 hours of receiving the invitation.
- Use AI coding tools freely. Verify their work and document at least one
  suggestion you corrected or rejected.
- Work in your own repository created from this template.
- Commit as you work and complete `SUBMISSION.md` in your final commit.
- Completion is not required. Accurate scope and verification matter more than
  a large diff.

## Setup

```bash
npm install
npm run typecheck
npm test
```

## Interface: hybrid

The tool has two interfaces with different levels of trust, built on one
shared core (`src/core.ts`):

- The **CLI** is for developers, who are trusted. It accepts free-form
  `--validate` shell commands.
- **MCP** is for AI agents, which are not trusted. It accepts only named,
  allowlisted checks, which run with `execFile` and no shell.

Base-ref validation, output caps, timeouts and pass/fail handling live in core,
so both interfaces behave the same way. Allowlisting stops a caller from
choosing a command. It does **not** sandbox the inspected repo: the `test`
check runs `npm test`, which runs whatever that repo's `package.json` scripts
define. Only inspect repos you trust, or run the tool inside a sandbox.

## What both interfaces share

- **Changed files** are listed from `git diff <base>...HEAD`, so only
  committed changes appear. The default base is `main`.
- **Base refs are validated.** A ref starting with `-`, or one that doesn't
  resolve to a commit, is rejected with a clear error before anything runs.
- **Each check has a time limit of 120 s.** A check that runs over is reported
  as `failed (timed out)`. Only the direct child process is killed; anything it
  started can keep running.
- **Each check's output is capped at 32 KB.** The tail is kept, since failures
  usually appear at the end, behind an `[output truncated: N bytes omitted]`
  marker.
- **The changed-files list is capped at 500 entries.** Any beyond that are
  summarised as `… and N more files not shown`.
- **A failing check is a result, not a crash.** Each check shows
  `Status: passed|failed (exit code N | timed out)`. Errors that stop the
  review itself, such as an invalid ref or a program that can't be started,
  are still reported as errors.

## CLI

```bash
npm run inspector -- review --repo ./path/to/repo
npm run inspector -- review --repo ./path/to/repo --base-ref main --validate "npm test"
```

- `--validate` takes a free-form shell command and can be repeated.
- The report is written to `review-report.md` in the **current directory**,
  overwriting any existing file.
- Exit code: `0` if every validation passed, `1` if any failed (the report is
  still written) or if the review couldn't run.
- `--format` is accepted but currently ignored: output is always Markdown.

## MCP

Start the stdio server with:

```bash
npm run mcp-server
```

It exposes one tool, `review_repository`.

**Input:**

```ts
{
  repo_path: string;                        // repository to inspect
  baseRef?: string;                         // default "main"
  checks?: ("test" | "typecheck")[];        // npm test / npm run typecheck
}
```

Unknown keys, such as a free-form `validationCommands` field, are rejected
with an error that names the key, and nothing runs. Raw command strings in
`checks` are rejected by the schema.

**Output:** the Markdown report as text, plus `structuredContent`:

```ts
{
  allChecksPassed: boolean;
  totalChangedFiles: number;               // all changed files, including any not listed
  checks: { name: string; status: "passed" | "failed"; exitCode: number | null; timedOut: boolean }[];
}
```

A failing check is a normal, successful result (`isError` is not set).
`isError` is used only when the review itself can't run, for example because
of an invalid `baseRef`.

## Project layout

```text
src/core.ts         shared review orchestration
src/cli.ts          command-line adapter
src/mcp-server.ts   MCP adapter
src/git.ts          Git inspection
src/validation.ts   validation execution
src/report.ts       Markdown report generation
test/               public starter tests
```

When finished, submit via **Security → Report a vulnerability** on this
repo — see `SECURITY.md` for exactly what to include. Do not reply by email;
that submission channel is not monitored.