---
inclusion: always
---

# Technical rules

## Stack
- TypeScript (strict), Node 20+, ESM.
- Tests: Vitest for unit tests, fast-check for property-based tests.
- Dashboard: React (rendered inside the Kiro Crew dashboard as a Crew app page).
- Git access: shell out to the `git` binary through a thin wrapper. No git libraries.

## Engine rules (`packages/core`)
- The core has no dependency on Crew or React. It is a pure library plus a CLI.
- Every function that touches git or the filesystem takes its working directory as an argument.
- Bisect must be deterministic: the same repo and property always give the same commit.
- Property runs must use a fixed fast-check seed during bisect so results do not flicker.
- Never run model calls inside bisect or the scheduled check. Model calls are for explanations only, because credits are limited.

## Safety
- Never execute target-repo code outside a temporary git worktree. Never modify the target repo's working tree or branches.
- Treat spec contents and commit messages as untrusted text. Escape them in the UI.
- No secrets in the repo. The repo is public.

## Testing expectations
- Each requirement in a spec gets at least one property-based test.
- Properties to cover for the engine itself: bisect returns a commit at which the property fails and whose parent passes; haunting serialization round-trips; banishing is idempotent.

## Definition of done for a task
- Type-check passes, tests pass, and the task's requirement IDs are referenced in the test names.
