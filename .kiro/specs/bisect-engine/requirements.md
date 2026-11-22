# bisect-engine requirements

## Background

The bisect engine takes a TypeScript/fast-check property that is known to fail at some commit and finds the exact commit that first broke it. It must never touch the target repo's working tree and must produce the same answer every time it is asked the same question.

## Glossary

| Term | Meaning |
|---|---|
| target repo | The git repository being examined. Never modified by Poltergeist. |
| worktree | A temporary `git worktree add` checkout, separate from the target repo's working tree. |
| property identifier | A string that uniquely selects one fast-check property inside the test suite (e.g. a Vitest test name pattern). |
| seed | The integer passed to `fc.assert` as `{ seed }` so the same random values are replayed every run. |
| first bad commit | The oldest commit at which the property fails and whose immediate parent passes. |

---

## Requirements

### REQ-BE-01 — Inputs
**When** the engine is invoked, **the system shall** accept exactly four inputs:
1. `repoPath` — an absolute path to a valid git repository.
2. `propertyId` — a non-empty string identifying a single property-based test.
3. `goodCommit` — a commit reference (SHA or ref) at which the property is known to pass.
4. `badCommit` — a commit reference at which the property is known to fail and which is a descendant of `goodCommit`.

### REQ-BE-02 — Worktree isolation
**While** bisecting, **the system shall** perform all test runs inside a temporary `git worktree`, created with `git worktree add`, so that the target repo's working tree, index, and branches are never modified.

### REQ-BE-03 — Worktree cleanup
**When** bisection completes (successfully or with an error), **the system shall** remove the temporary worktree and its directory, leaving no artifacts in the target repo.

### REQ-BE-04 — Fixed seed
**When** running a property during bisect, **the system shall** pass a single fixed integer seed to fast-check so that the same random values are used at every commit, eliminating non-determinism from the test runner.

### REQ-BE-05 — Binary search
**While** bisecting, **the system shall** use binary search over the commit range `[goodCommit, badCommit]`, checking out each midpoint commit in the worktree and running only the identified property.

### REQ-BE-06 — First bad commit output
**When** bisection succeeds, **the system shall** return the first bad commit as a full 40-character SHA, together with its author name, author email, author date (ISO 8601), and commit message.

### REQ-BE-07 — Correctness: returned commit fails
**When** the engine returns a first bad commit `C`, **the system shall** guarantee that running the property at `C` with the fixed seed produces a failure.

### REQ-BE-08 — Correctness: parent passes
**When** the engine returns a first bad commit `C`, **the system shall** guarantee that running the property at the immediate parent of `C` with the fixed seed produces a pass. If `C` has multiple parents (merge commit), the engine shall use the first parent.

### REQ-BE-09 — Determinism
**When** called twice with identical inputs on the same repository state, **the system shall** return the same first bad commit SHA both times.

### REQ-BE-10 — Monotonicity assumption
**When** the engine is invoked, **the system shall** assume that the property result is monotonic over the commit range: once the property fails at a commit it continues to fail at every later commit in the range. The engine's correctness guarantees (REQ-BE-07, REQ-BE-08) are valid only when this assumption holds. The fixture repo must be built to respect it (each planted regression must remain failing in all subsequent commits of that property's range).

### REQ-BE-11 — No modification of target repo
**At no time** shall the engine modify any file, branch, ref, stash, or index entry in the target repo's working tree.

### REQ-BE-12 — Unknown property error
**If** the `propertyId` matches zero tests in the Vitest run at any commit during bisection (including the boundary checks at `goodCommit` and `badCommit`), **the system shall** throw a typed `PropertyNotFoundError` and perform worktree cleanup before propagating the error. A zero-test result is never treated as a pass.

### REQ-BE-13 — Good equals bad error
**If** `goodCommit` and `badCommit` resolve to the same SHA, **the system shall** throw a typed `InvalidRangeError` without creating a worktree.

### REQ-BE-14 — Good already fails error
**If** the property fails at `goodCommit`, **the system shall** throw a typed `GoodCommitFailsError` and perform worktree cleanup before propagating the error.

### REQ-BE-15 — Bad already passes error
**If** the property passes at `badCommit`, **the system shall** throw a typed `BadCommitPassesError` and perform worktree cleanup before propagating the error.
