# bisect-engine design

## Module location

`packages/core/src/bisect/`

## Public API

```typescript
// packages/core/src/bisect/index.ts

export interface BisectInput {
  repoPath: string;       // absolute path to the target repo
  propertyId: string;     // Vitest test name pattern selecting one property
  goodCommit: string;     // commit ref where the property passes
  badCommit: string;      // commit ref where the property fails
  seed?: number;          // override the fixed seed (default: BISECT_SEED)
}

export interface CommitInfo {
  sha: string;            // full 40-char SHA
  author: string;         // author name
  email: string;          // author email
  date: string;           // ISO 8601 author date
  message: string;        // full commit message
}

export interface BisectResult {
  firstBadCommit: CommitInfo;
}

export class PropertyNotFoundError extends Error {}
export class InvalidRangeError extends Error {}
export class GoodCommitFailsError extends Error {}
export class BadCommitPassesError extends Error {}

export async function bisect(input: BisectInput): Promise<BisectResult>;
```

`seed` is optional and exists only for testing. Production callers omit it and get `BISECT_SEED`.

## Internal modules

### `git.ts` — git shell wrapper

Thin wrapper around the `git` binary. Every function accepts a `cwd` argument.

```typescript
export async function resolveRef(cwd: string, ref: string): Promise<string>;
export async function commitsBetween(cwd: string, good: string, bad: string): Promise<string[]>;
export async function addWorktree(cwd: string, worktreePath: string, commit: string): Promise<void>;
export async function removeWorktree(cwd: string, worktreePath: string): Promise<void>;
export async function getCommitInfo(cwd: string, sha: string): Promise<CommitInfo>;
export async function firstParent(cwd: string, sha: string): Promise<string>;
```

All `git` calls are constructed with explicit argument arrays and never interpolated into a shell string, to prevent command injection from untrusted repo paths or commit messages.

### `runner.ts` — property runner

Runs a single property in a worktree and reports pass, fail, or not-found.

```typescript
export type RunResult =
  | { status: 'passed' }
  | { status: 'failed'; counterexample: string }
  | { status: 'not-found' };

export async function runProperty(
  worktreePath: string,
  propertyId: string,
  seed: number,
): Promise<RunResult>;
```

**Invoking Vitest on Windows (and everywhere else):**

`npx` and `npm` are not used. Vitest is invoked directly through Node using the worktree's own installation:

```typescript
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const vitestBin = path.join(worktreePath, 'node_modules', 'vitest', 'vitest.mjs');

const result = spawnSync(
  process.execPath,                   // the same node binary that is running this code
  [
    vitestBin,
    'run',
    '--reporter=json',
    '--testNamePattern', propertyId,  // separate argument; never interpolated into a string
  ],
  {
    cwd: worktreePath,
    env: { ...process.env, FAST_CHECK_SEED: String(seed) },
    encoding: 'utf8',
  },
);
```

`process.execPath` resolves to the Node binary in use; it is never constructed from user input.

**Dependency installation:**

Before running any test in a worktree, the runner checks whether `<worktreePath>/node_modules` exists. If it does not, `installDependencies(worktreePath)` is called. It locates `npm-cli.js` using the following priority:

1. **`process.env.npm_execpath`** — Node sets this variable when the current process was launched by npm (e.g. via an npm script). If it is set and points to a file that exists, use it directly as the script path.
2. **Relative to `process.execPath`** — resolve `path.resolve(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')`. On Windows (where npm is installed alongside node.exe in the same directory) and on most Unix layouts where the bundled npm lives next to the node binary, this path exists. If this file exists, use it.
3. **Error** — if neither path resolves to an existing file, throw a descriptive `Error` with the message: `Cannot locate npm-cli.js. Set npm_execpath or ensure npm is installed alongside Node at ${process.execPath}`.

The invocation always uses a fixed, non-user-controlled argument list:

```typescript
spawnSync(
  process.execPath,
  [
    npmCliPath,            // resolved above
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ],
  { cwd: worktreePath, encoding: 'utf8' },
);
```

`node_modules` is reused across commits within the same worktree: installation runs once when the worktree is first created, before the binary search loop begins. Subsequent checkouts inside the same worktree reuse the installed modules unless a `package.json` change is detected (out of scope for MVP; the fixture repo's `package.json` does not change between commits).

**Parsing the result:**

The runner parses Vitest's JSON output (`--reporter=json` writes to stdout). It inspects `numPassedTests`, `numFailedTests`, `numTotalTests`, and the top-level `success` field. The decision tree is:

1. If the JSON cannot be parsed, or the process exited with a signal, treat it as an infrastructure error and throw.
2. If `numTotalTests === 0` **and** `numFailedTests === 0` and `success === true` (or no test suites ran at all) → `{ status: 'not-found' }`. This is the "pattern matched nothing" case (REQ-BE-12).
3. If `numTotalTests > 0` **and** `numPendingTests === numTotalTests` and `numFailedTests === 0` → `{ status: 'not-found' }`. This is the Vitest 2.x behavior: when `--testNamePattern` matches nothing, all tests are marked as pending/skipped rather than zero total.
4. If `numTotalTests === 0` **and** (`numFailedTests > 0` or `success === false`) → `{ status: 'failed'; counterexample: '' }`. This is a suite-level failure (import error, syntax error, etc.) where no individual test ran. It is treated as a failed run, not as not-found, because something at that commit is broken.
5. If `numFailedTests > 0` (and `numTotalTests > 0`) → `{ status: 'failed'; counterexample: <message> }` where `counterexample` is extracted from the first failing test's `failureMessages[0]`.
6. Otherwise → `{ status: 'passed' }`.

### `bisect.ts` — binary search driver

Implements the binary search loop over the commit list.

```typescript
// Internal, not exported
async function bisectRange(
  repoPath: string,
  commits: string[],  // oldest-first, excluding goodCommit, including badCommit
  propertyId: string,
  seed: number,
  worktreePath: string,
): Promise<string>;   // SHA of first bad commit
```

**Algorithm:**

1. Resolve `goodCommit` and `badCommit` to full SHAs.
2. Assert they differ (`InvalidRangeError` otherwise; worktree not yet created).
3. Create a temporary worktree at `os.tmpdir()/poltergeist-<uuid>` using `git worktree add`.
4. Install dependencies in the worktree once (see `runner.ts` above).
5. Verify boundary conditions (REQ-BE-14, REQ-BE-15):
   - Check out `goodCommit` in the worktree and run the property.
     - `not-found` → `PropertyNotFoundError`.
     - `failed` → `GoodCommitFailsError`.
   - Check out `badCommit` and run the property.
     - `not-found` → `PropertyNotFoundError`.
     - `passed` → `BadCommitPassesError`.
6. Collect the commit list with `git log --first-parent --format=%H <goodCommit>..<badCommit>` and reverse it to oldest-first.
7. Binary-search the list:
   - Check out the midpoint commit in the worktree.
   - Run the property.
     - `not-found` → `PropertyNotFoundError` (stop immediately).
     - `failed` → narrow the right bound to the midpoint.
     - `passed` → narrow the left bound past the midpoint.
8. When the range collapses to one commit, that is the first bad commit.
9. Fetch its metadata with `git log -1`.
10. Remove the worktree unconditionally in the `finally` block.
11. Return `BisectResult`.

The binary search is correct only under the monotonicity assumption (REQ-BE-10): once the property fails at a commit, it fails at all later commits in the range.

## Fixed seed

```typescript
export const BISECT_SEED = 20241031;
```

The seed is passed to the child process as the `FAST_CHECK_SEED` environment variable. Property files in the target repo read it like this:

```typescript
// Convention for property files in the target repo (not enforced by the engine):
const seed = Number(process.env.FAST_CHECK_SEED) || Date.now();
fc.assert(fc.property(...), { seed });
```

`Number(process.env.FAST_CHECK_SEED)` is `NaN` when the variable is absent, and `NaN || Date.now()` falls back to a random seed for normal test runs. When `FAST_CHECK_SEED` is set to a non-zero integer string, `Number(...)` is that integer and the `||` short-circuits — the fixed seed is used. The engine always sets the variable, so bisect runs are always deterministic.

## Worktree lifecycle

```
bisect()
  └─ resolveRef() × 2
  └─ assertDifferent()          → InvalidRangeError if same
  └─ git worktree add           → os.tmpdir()/poltergeist-<uuid>
  └─ installDependencies()      → runs once, reused for all checkouts
  └─ [try]
      └─ verify boundaries      → GoodCommitFailsError / BadCommitPassesError / PropertyNotFoundError
      └─ commitsBetween()
      └─ binary search loop
         └─ git -C <worktree> checkout <sha>
         └─ runProperty(worktreePath, propertyId, seed)
  └─ [finally]
      └─ git worktree remove --force <worktreePath>
      └─ fs.rm(worktreePath, { recursive: true, force: true })
```

The target repo's `HEAD`, index, and working tree are never touched. All `git` commands that need a working tree operate with `-C <worktreePath>`.

## Error handling

| Condition | Error class | Worktree cleaned up? |
|---|---|---|
| `goodCommit === badCommit` (resolved SHAs) | `InvalidRangeError` | n/a — worktree not yet created |
| `propertyId` matches zero tests at any commit | `PropertyNotFoundError` | Yes (finally block) |
| Property fails at `goodCommit` | `GoodCommitFailsError` | Yes (finally block) |
| Property passes at `badCommit` | `BadCommitPassesError` | Yes (finally block) |
| Any unexpected git or spawn error | Re-thrown as-is | Yes (finally block) |

## Fixture script

The fixture is a Node ESM script at `fixtures/build-haunted-repo.mjs`, not a bash script, so it runs on Windows, macOS, and Linux without a POSIX shell. It uses only Node built-ins (`child_process`, `fs`, `path`).

It creates a small TypeScript repo with a `package-lock.json` committed so that `npm install` inside the worktree is deterministic and offline-capable. Every commit uses fixed `GIT_AUTHOR_DATE`, `GIT_COMMITTER_DATE`, and author identity so that SHAs are reproducible across machines. The three planted regressions each remain failing in all commits after the regression commit, satisfying the monotonicity assumption (REQ-BE-10).

## Testing strategy

Tests live in `packages/core/src/bisect/__tests__/`.

- **Unit tests** (`git.test.ts`, `runner.test.ts`) use a fixture repo built by `fixtures/build-haunted-repo.mjs`. They assert the returned SHA equals the known planted regression commit.
- **Property-based tests** (`bisect.property.test.ts`) use fast-check to generate random commit ranges within the fixture repo and verify: (a) the returned commit fails (REQ-BE-07), (b) its parent passes (REQ-BE-08), (c) calling bisect twice returns the same SHA (REQ-BE-09), (d) the target repo's working tree is unmodified after bisect (REQ-BE-11).

Test names reference requirement IDs, e.g.:

```
"[REQ-BE-07, REQ-BE-08] returned commit fails and its parent passes"
"[REQ-BE-09] bisect is deterministic across two calls"
"[REQ-BE-11] target repo working tree is unmodified after bisect"
```
