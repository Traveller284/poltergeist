# bisect-engine tasks

Tasks are ordered. Complete each before starting the next. Mark a task done by checking its box.

---

## Task 1 — Scaffold the package

- [ ] Create `packages/core/` with `package.json` (name `@poltergeist/core`, type `module`, Node 20+), `tsconfig.json` (strict, ESM, `NodeNext` module resolution), and a Vitest config.
- [ ] Add `fast-check` and `vitest` as dev dependencies.
- [ ] Confirm `tsc --noEmit` and `vitest run` both exit 0 on an empty test suite.

**Covers:** no requirement directly; prerequisite for all other tasks.

---

## Task 2 — Fixture repo (`build-haunted-repo.mjs`)

- [ ] Create `fixtures/build-haunted-repo.mjs` as a Node ESM script (no bash; runs on Windows, macOS, and Linux).
- [ ] The script initialises a git repo under `fixtures/haunted-repo/` with at least 15 commits.
- [ ] Commits 6, 9, and 12 each introduce a regression that breaks a distinct fast-check property. Each regression must remain broken in all later commits (monotonicity, REQ-BE-10).
- [ ] Every commit uses a fixed `GIT_AUTHOR_DATE`, `GIT_COMMITTER_DATE`, and author identity so that SHAs are reproducible across machines.
- [ ] The repo's `package.json` does not change after commit 1. Commit a `package-lock.json` so that `npm install` inside a worktree is deterministic.
- [ ] The script is idempotent: delete and recreate `fixtures/haunted-repo/` if it already exists.
- [ ] At the top of the script, document the three property names and their known regression commit SHAs (computed after a first run and then kept constant).
- [ ] Write a fixture test in `packages/core/src/bisect/__tests__/fixture.test.ts`. For each of the three planted regressions, name the test `[REQ-BE-10] <propertyName> fails at its regression commit and all later commits`. The test must check out each commit from the regression commit through the tip, run the property with `runProperty`, and assert every result is `failed`. This confirms the fixture satisfies the monotonicity assumption the bisect algorithm depends on.

**Covers:** REQ-BE-07, REQ-BE-08, REQ-BE-09, REQ-BE-10 (via deterministic, monotonic fixture).

---

## Task 3 — Git wrapper (`git.ts`)

- [ ] Implement `packages/core/src/bisect/git.ts` with the functions listed in the design: `resolveRef`, `commitsBetween`, `addWorktree`, `removeWorktree`, `getCommitInfo`, `firstParent`.
- [ ] All functions take `cwd: string` as their first argument and shell out to the `git` binary using `spawnSync` or `execFile` with an argument array (no shell string interpolation).
- [ ] Write unit tests in `__tests__/git.test.ts` using the fixture repo built in Task 2. Each test name must include the requirement ID it covers.

**Covers:** REQ-BE-02, REQ-BE-03, REQ-BE-06, REQ-BE-08, REQ-BE-11.

---

## Task 4 — Property runner (`runner.ts`)

- [ ] Implement `packages/core/src/bisect/runner.ts` with `runProperty(worktreePath, propertyId, seed): Promise<RunResult>` where `RunResult` is `{ status: 'passed' } | { status: 'failed'; counterexample: string } | { status: 'not-found' }`.
- [ ] Invoke Vitest by spawning `process.execPath` (the current Node binary) with `[vitestBin, 'run', '--reporter=json', '--testNamePattern', propertyId]` where `vitestBin = path.join(worktreePath, 'node_modules', 'vitest', 'vitest.mjs')`. Never use `npx` or `npm` as the executable.
- [ ] Pass `FAST_CHECK_SEED=<seed>` in the child process environment.
- [ ] Parse the JSON output using this decision tree: `numTotalTests === 0` and `success === true` (no suites failed) → `not-found`; `numTotalTests === 0` and `success === false` (suite-level failure such as an import error) → `failed` with an empty counterexample; `numFailedTests > 0` → `failed` with `counterexample` from `failureMessages[0]`; otherwise → `passed`.
- [ ] Implement `installDependencies(worktreePath)` which locates `npm-cli.js` by checking `process.env.npm_execpath` first, then falling back to `path.resolve(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')`. Throw a descriptive error if neither path exists. Run `npm install --ignore-scripts --no-audit --no-fund` via `process.execPath` with a fixed argument list. This is called once per worktree before the first test run.
- [ ] Write unit tests with a stubbed spawn covering: pass result, fail result with counterexample, not-found case (zero tests, success true), suite-level failure case (zero tests, success false), dependency installation (npm_execpath present, npm_execpath absent fallback, neither found).

**Covers:** REQ-BE-04, REQ-BE-12.

---

## Task 5 — Bisect driver (`bisect.ts`) and public API (`index.ts`)

- [ ] Implement the binary search loop as described in the design, including boundary verification at `goodCommit` and `badCommit`.
- [ ] Raise `InvalidRangeError` before creating a worktree when both refs resolve to the same SHA (REQ-BE-13).
- [ ] Raise `GoodCommitFailsError` and `BadCommitPassesError` from the boundary checks (REQ-BE-14, REQ-BE-15).
- [ ] When `runProperty` returns `not-found` at any point, throw `PropertyNotFoundError` immediately.
- [ ] Wrap the entire bisect body (after worktree creation) in `try/finally` to guarantee worktree removal.
- [ ] Export the public API and all four error classes from `packages/core/src/bisect/index.ts`.
- [ ] Export `BISECT_SEED = 20241031`.

**Covers:** REQ-BE-01, REQ-BE-02, REQ-BE-03, REQ-BE-04, REQ-BE-05, REQ-BE-06, REQ-BE-12, REQ-BE-13, REQ-BE-14, REQ-BE-15.

---

## Task 6 — Correctness properties

**`findFirstFailing.property.test.ts`** — fast-check property tests for the pure binary-search kernel, 200 runs each:

- [ ] **[REQ-BE-05]** For any history length `n` (1–200) and any break index `k`, assert `isFailing` is called at most `ceil(log2(n))` times.
- [ ] **[REQ-BE-07, REQ-BE-08]** Assert `findFirstFailing` returns exactly index `k` (the first failing commit), and that `isFailing(commits[k])` is true while `isFailing(commits[k-1])` is false (when `k > 0`).
- [ ] **[REQ-BE-09]** Assert two calls with identical `commits` and `isFailing` return the same index.

**`bisect.property.test.ts`** — integration tests for `bisect()` against the haunted-repo fixture. Each test name must include the REQ-BE-xx IDs it covers. Never issue `git checkout` against the fixture repo's working tree; use a throwaway worktree or verify via the existing worktree that `bisect()` already creates.

- [ ] **[REQ-BE-01]** Call `bisect` and assert the returned `BisectResult` has `firstBadCommit` with `sha`, `author`, `email`, `date`, and `message`.
- [ ] **[REQ-BE-06]** Assert `firstBadCommit.sha` is a 40-char hex string and `firstBadCommit.date` matches ISO 8601.
- [ ] **[REQ-BE-07, REQ-BE-08]** For each of the three planted regressions, call `bisect`. Spin up a throwaway worktree to run the property at the returned SHA (must fail) and at its first parent (must pass). Assert the returned SHA equals the known regression commit.
- [ ] **[REQ-BE-09]** Call `bisect` twice with identical inputs concurrently. Assert both returned SHAs are equal.
- [ ] **[REQ-BE-11]** Snapshot the target repo's `HEAD`, `git diff-index HEAD`, and all tracked blob SHAs before calling `bisect`. Assert the snapshot is identical after the call.
- [ ] **[REQ-BE-12]** Assert `PropertyNotFoundError` is thrown when `propertyId` matches no test, and that the worktree count is unchanged afterwards.
- [ ] **[REQ-BE-13]** Assert `InvalidRangeError` is thrown when `goodCommit === badCommit`.
- [ ] **[REQ-BE-14]** Assert `GoodCommitFailsError` is thrown when the property already fails at `goodCommit`.
- [ ] **[REQ-BE-15]** Assert `BadCommitPassesError` is thrown when the property still passes at `badCommit`.

**Covers:** REQ-BE-01, REQ-BE-05, REQ-BE-06, REQ-BE-07, REQ-BE-08, REQ-BE-09, REQ-BE-11, REQ-BE-12, REQ-BE-13, REQ-BE-14, REQ-BE-15.

---

## Definition of done

All tasks complete when:
1. `tsc --noEmit` exits 0.
2. `vitest run` exits 0 with every test in `bisect/__tests__/` passing.
3. Every requirement REQ-BE-01 through REQ-BE-15 is referenced in at least one passing test name.
