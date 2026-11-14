# Investigation

A read-only analysis of the starter, done before changing any code. Every
finding is marked with how it was confirmed:

- **V (verified):** reproduced by running it against a throwaway git fixture
  or the MCP server.
- **T (traced):** confirmed by reading the code exactly, not run.
- **I (inferred):** likely, but not demonstrated.

All `--validate` / `validationCommands` runs used only a fixture repo created
for this purpose.

## Baseline

| Command | Result |
|---|---|
| `npm ci` | OK. `npm audit` reports 15 issues (6 moderate, 8 high, 1 critical) |
| `npm run typecheck` | Pass |
| `npm test` | Pass: 1 file, 1 test |

Environment: Node 24.11 and git 2.47 on Windows. CI uses Node 20 on Ubuntu.

`npm install` rewrote `package-lock.json` because of a local npm version
difference. The change was reverted, and `npm ci` is used from then on.

## How a request flows

**CLI:** `src/cli.ts` `parseArgs` calls `reviewRepository()` in `src/core.ts`, which:

1. Calls `changedFiles()` in `src/git.ts`. This runs `execFileSync("git",
   ["diff","--name-status", base+"...HEAD"], {cwd: repo})` with no shell, then
   splits the output on newlines and tabs.
2. Calls `runValidations()` in `src/validation.ts`. This runs each command one
   after another with `exec()`, which uses a shell, in `cwd: repo`. It rejects
   on the first error.
3. Calls `markdownReport()` in `src/report.ts` to build the Markdown.

The CLI then writes the result to `./review-report.md` in the caller's
current directory.

**MCP:** `src/mcp-server.ts` registers the `review_repository` tool with the
zod schema `{repo_path, baseRef?, validationCommands?}`. The SDK validates the
input, rejecting unknown keys and wrong types. The handler then calls the same
`reviewRepository()` but passes `input.repoPath` (see F2), and returns one
text block. Errors thrown by the handler come back as `isError` text results.

The adapters already differ before any changes: the CLI writes a file and
accepts `--format`, while MCP returns text and has no format option.

## Findings

### F1: MCP runs any shell command an agent sends (safety, critical)

- **Where:** `src/mcp-server.ts:15`, `src/validation.ts:6`
- **Code:** `validationCommands: z.array(z.string())` is passed straight to
  `exec(command, { cwd })`.
- **Scenario:** An agent sent `["echo RAN-FROM-MCP && cd"]`. The command ran
  and its output appeared in the report. This contradicts the hybrid decision
  that MCP may only run allowlisted checks. **V**
- **Fix:** MCP accepts `checks: z.enum([...])[]`. Core maps each check name to
  a fixed program and argument list and runs it with `execFile`, with no
  shell.
- **Limitation:** Allowlisting stops callers from choosing commands. It does
  **not** stop code execution by the inspected repo's own scripts: an
  allowlisted `npm test` still runs whatever `package.json` defines. Inspecting
  untrusted repos safely would need a sandbox (container or VM, no network,
  minimal environment), which is out of scope.
- **Test:** An MCP client test checks that a free-form command string is
  rejected and that an allowlisted name runs the expected program.

### F2: MCP ignores `repo_path` and inspects the server's own directory (contract, high)

- **Where:** `src/mcp-server.ts:13,17-19`
- **Code:** The schema declares `repo_path`, but the handler reads
  `input.repoPath`. Because the handler is typed `input: any`, typecheck
  cannot catch the mismatch.
- **Scenario:** The server was started in repo A and asked about repo B. It
  returned A's changes under the title `# Review Report: undefined`, and
  validations also ran in A. **V**
- **Fix:** Read `input.repo_path` and drop the `any` type.
- **Test:** Start the server in A, call it with B, and assert the report lists
  B's files.

### F3: `baseRef` can inject git options and write arbitrary files (safety, high)

- **Where:** `src/git.ts:13`
- **Code:** `` `${base}...HEAD` `` is passed as a git argument.
- **Scenario:** `--base-ref "--output=<dir>/pwned"` made git create
  `<dir>/pwned...HEAD`, and the report's file list came back silently empty.
  An MCP caller controls `baseRef`. **V**
- **Fix:** Reject refs that start with `-`, check refs with
  `git rev-parse --verify --end-of-options`, and use `--end-of-options` in the
  diff command.
- **Test:** A ref starting with `-` is rejected and no file is created.

### F4: A failing validation aborts the whole review (reliability, high)

- **Where:** `src/validation.ts:7-9`, `src/report.ts:16`
- **Code:** `if (error) { reject(error) }`. The `"failed"` status is never
  produced, and the report never prints `status`.
- **Scenario:** `echo before-fail && exit 3` crashed the CLI with a stack
  trace, wrote no report, and lost the output. MCP returned only
  `Command failed: …`. **V**
- **Fix:** Resolve with `{status: "failed", exitCode, output}`, show the
  status in the report, and make the CLI exit non-zero when a check fails.
- **Test:** A command that exits 3 still produces a report showing `failed`,
  the exit code, and the partial output.

### F5: Validation commands have no timeout (reliability, high)

- **Where:** `src/validation.ts:6`
- **Code:** `exec(command, { cwd })` sets no `timeout`, and the default is no
  limit.
- **Scenario:** A hanging or watch-mode test blocks the CLI forever, and blocks
  every MCP call after it. **T**
- **Fix:** Add a timeout constant in core and report a `timed-out` status.
- **Test:** A process that never exits gets a `timed-out` status within the
  limit.

### F6: Output size is uncapped, and large output crashes the run (output/reliability, medium-high)

- **Where:** `src/validation.ts:6,11`, `src/report.ts:16`
- **Scenario:** 2 MB of output crashed the run with
  `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`. 900 KB of output produced a 900 KB
  report, which MCP would send straight into an agent's context. **V**
- **Fix:** Cap each check's output (keep the tail and add a `[truncated]`
  marker) and cap the total report size, both in core.
- **Test:** 2 MB of output produces a report under the cap that contains the
  marker.

### F7: Repo path is not validated or confined (safety/contract, medium)

- **Where:** `src/core.ts:7`, `src/git.ts:5-7`
- **Scenario:**
  - A path that does not exist fails with `spawnSync git ENOENT`, which looks
    like git is missing. **V**
  - A subfolder that is not itself a repo silently reports its parent repo's
    changes. **V**
  - Once F2 is fixed, an MCP caller can point the tool at any directory on the
    machine. **I**
- **Fix:** Resolve the path, check it exists and is a directory, and require
  it to equal `git rev-parse --show-toplevel`. For MCP, also require it to be
  under a workspace root.
- **Test:** A missing path, a non-repo subfolder, and a path outside the root
  each produce a clear error.

### F8: CLI `--repo` cuts the path at the first space (correctness, medium)

- **Where:** `src/cli.ts:18`
- **Code:** `argv[++index]?.split(" ")[0]`
- **Scenario:** `--repo ".../my repo"` inspected a *different* repo,
  `.../my`. **V**
- **Fix:** Remove the split.
- **Test:** A `parseArgs` test with a path containing a space.

### F9: git output is parsed incorrectly (correctness, medium)

- **Where:** `src/git.ts:13-21`
- **Scenario:**
  - A rename is reported as `old.txt<TAB>renamed.txt (modified)`.
  - `café.txt` is reported as `"caf\303\251.txt"`.
  - Copies (`C`) and type changes (`T`) are reported as `modified`.
  
  **V**
- **Fix:** Use `--name-status -z` and handle `R`, `C` and `T` explicitly.
- **Test:** Fixtures containing a rename and a non-ASCII filename.

### F10: Untrusted content can inject Markdown into the report (output/safety, medium)

- **Where:** `src/report.ts:10,12,16`
- **Scenario:** Validation output containing ```` ``` ```` closed the code
  fence and added a heading. A file named `[click](http--evil).md` rendered as
  a link. Both are ways to inject text that an agent reading the report might
  follow. **V**
- **Fix:** Use a fence longer than any run of backticks in the content, and
  escape paths or wrap them in code.
- **Test:** Output containing a fence stays inside one block, and the
  link-shaped filename does not render as a link.

### F11: Default base branch is hardcoded to `main` (correctness, medium)

- **Where:** `src/git.ts:12`
- **Scenario:** On a repo that only has `master`, the run fails with
  `fatal: ambiguous argument 'main...HEAD'` and a stack trace. **V**
- **Fix:** Detect the default branch, or fail with a clear message to pass
  `--base-ref`.
- **Test:** A fixture repo on `master`.

### F12: Only committed changes are reported (correctness, medium; out of scope)

- **Where:** `src/git.ts:13`, `src/types.ts:3`
- **Scenario:** Untracked files and uncommitted edits are missing from the
  report, and the `"untracked"` status is defined but never produced. **V**
- **Decision:** The `base...HEAD` behaviour is kept and will be documented as
  a known limitation.

### F13: stderr is dropped when stdout has output (output, medium)

- **Where:** `src/validation.ts:11`
- **Code:** `stdout || stderr`
- **Scenario:** A command that printed `OUT` to stdout and `ERR` to stderr
  showed only `OUT`. **V**
- **Fix:** Capture both streams and label them.
- **Test:** The report contains both.

### F14: Validation commands inherit the full environment (safety, medium)

- **Where:** `src/validation.ts:6`
- **Scenario:** `SECRET_TOKEN` was readable from inside a validation command
  (**V**). Repo scripts such as `npm test` could therefore read the user's
  tokens (**I**).
- **Fix:** Give MCP checks a minimal allowlisted environment, and document the
  risk for the CLI.
- **Test:** A check that prints `SECRET_TOKEN` gets an empty value.

### F15: The CLI always overwrites `./review-report.md` (output/safety, medium-low)

- **Where:** `src/cli.ts:44`
- **Scenario:**
  - The report is written to the caller's current directory, not the
    inspected repo, and silently overwrites any existing file. **T**
  - Run from inside the inspected repo, it writes into that repo. **T**
  - The write follows a symlink at that path. **I**
- **Fix:** Add an `--out` option, and refuse to write through symlinks or over
  existing files unless asked.
- **Test:** The report goes to the `--out` path, and a symlink at the target
  is refused.

### F16: `--format` is accepted but ignored (contract/consistency, medium; skipped)

- **Where:** `src/cli.ts:22`, `src/core.ts:12`
- **Scenario:** `--format json` still produced Markdown, `--format bogus`
  exited 0, and MCP has no format option. **V**
- **Decision:** Skipped for now.

### F17: The CLI argument parser is loose (contract, low)

- **Where:** `src/cli.ts:13-27`
- **Scenario:**
  - `--validate` with no value crashed with a `TypeError`. **V**
  - The typo `--valdiate` was silently ignored and the run exited 0. **V**
  - `--repo --validate` would treat `--validate` as the repo path. **T**
- **Fix:** Use `node:util` `parseArgs` with `strict: true`.

### F18: Errors are raw and differ between CLI and MCP (reliability/consistency, low)

- **Where:** `src/cli.ts:48-51`
- **Scenario:** The CLI dumps the whole error object and stack trace, while
  MCP returns bare text. Neither says which step failed. **V**
- **Fix:** Throw typed errors from core and format them the same way in both
  adapters.

### F19: The MCP schema is weak (contract, low-medium)

- **Where:** `src/mcp-server.ts:12-16`
- **Scenario:**
  - Naming is mixed (`repo_path` beside `baseRef`).
  - Only `repo_path` has a description.
  - There are no length or count limits.
  - Results are text only, with no structured output.
  
  **V**
- **Fix:** Use consistent names, add `.describe()` and `.max()` to every
  field, and consider structured output.

### F20: `bin` points to a file the build doesn't produce (build/docs, low)

- **Where:** `package.json` `bin`, `tsconfig.json` `rootDir: "."`
- **Scenario:** The build emits `dist/src/cli.js` and also compiles the tests
  into `dist/`, but `bin` is `./dist/cli.js`. **V**
- **Fix:** Point `bin` at `./dist/src/cli.js`, or split the build config.

### F21: Test coverage is minimal and CI is thin (testing, medium)

- **Where:** `test/report.test.ts`, `.github/workflows/public-checks.yml`
- **Scenario:**
  - There is one happy-path test for the report. git, validation, the CLI and
    MCP have no tests, which is how F2 went unnoticed. **T**
  - CI runs only on `push` (not on pull requests), only on Linux, and only on
    Node 20.
- **Fix:** Add tests against fixture repos, plus MCP client tests.

### F22: README is out of date (docs, low)

- **Where:** `README.md`
- **Scenario:** It advertises `--format`, which does nothing. It does not say
  where the report is written, that `--validate` runs a shell, or what the MCP
  input contract is. **T**

### F23: Dependency audit findings (safety, low; no bump)

- **Where:** `package.json`
- **Scenario:** `npm audit` flags `hono`, `@hono/node-server`, `body-parser`,
  `fast-uri`, `ip-address` and others. These are pulled in by the MCP SDK's
  HTTP transport, and this tool only uses stdio. That they are listed is
  **V**; that they are unreachable here is **I**. The critical item was not
  identified because the audit output was truncated.
- **Decision:** Dependencies will not be bumped.

### F24: The git call blocks, has no timeout, and uses the repo's own config (reliability/safety, low)

- **Where:** `src/git.ts:5`
- **Scenario:** `execFileSync` blocks the MCP event loop, has no timeout, and
  uses the inspected repo's `.git/config`. A `--name-status` diff between two
  trees probably does not trigger fsmonitor or textconv, but this was not
  tested. **I**
- **Fix:** Use async `execFile` with a timeout and pass
  `-c core.fsmonitor=false`.

## Findings by severity

| ID | Severity | Category | Summary | Evidence |
|---|---|---|---|---|
| F1 | critical | safety | MCP runs any shell command an agent sends | V |
| F2 | high | contract | MCP ignores `repo_path`, inspects the server's own directory | V |
| F3 | high | safety | `baseRef` option injection writes arbitrary files | V |
| F4 | high | reliability | A failing check aborts the review | V |
| F5 | high | reliability | No timeout on validation commands | T |
| F6 | medium-high | output | Output uncapped; over 1 MB crashes | V |
| F7 | medium | safety | Repo path not validated or confined | V/I |
| F8 | medium | correctness | `--repo` path cut at the first space | V |
| F9 | medium | correctness | Renames and non-ASCII names parsed incorrectly | V |
| F10 | medium | output | Markdown injection through output and file names | V |
| F11 | medium | correctness | Default base branch hardcoded to `main` | V |
| F12 | medium | correctness | Uncommitted changes ignored (out of scope) | V |
| F13 | medium | output | stderr dropped when stdout has output | V |
| F14 | medium | safety | Full environment passed to checks | V/I |
| F21 | medium | testing | Minimal tests; thin CI | T |
| F16 | medium | consistency | `--format` ignored (skipped) | V |
| F15 | medium-low | output | Report overwrites `./review-report.md` | T/I |
| F19 | low-medium | contract | Weak MCP schema | V |
| F17 | low | contract | Loose CLI argument parsing | V |
| F18 | low | consistency | Raw, inconsistent errors | V |
| F20 | low | build | `bin` path is wrong | V |
| F22 | low | docs | README out of date | T |
| F23 | low | safety | Audit findings in an unused transport (no bump) | V/I |
| F24 | low | reliability | Blocking git call, no timeout, repo-controlled config | I |

## Plan

The fixes below are applied in this order, one at a time. Each starts with a
test that fails before the fix and passes after it.

1. **F2:** an MCP correctness fix that later MCP tests depend on.
2. **F1:** the critical issue. It also puts the hybrid interface decision into
   code.
3. **F4:** failures become results instead of crashes, fixed once in core for
   both adapters.
4. **F3:** a small fix for an arbitrary file write.
5. **F5:** only if time allows.

Explicitly out of scope: F12 (documented as a limitation), F16, and F23.
