# Poltergeist

> Your specs promised. Your code broke the promise. Poltergeist finds out **which commit did it**.

Poltergeist is a Kiro Crew app for Kiroween 2026 (Costume Contest). It watches a repository built with Kiro specs, re-runs the correctness properties from each spec on a schedule, and when behavior has drifted it runs a git bisect to find the exact commit that first broke the property. Each failure appears in a haunted-house dashboard as a ghost: its **cause of death** is the commit, and its **last words** are the shrunk counterexample.

**Status:** day 1 scaffold. Nothing below is built yet. See `docs/KIRO_PLAN.md`.

## How it is meant to work

1. Point Poltergeist at a repo that has `.kiro/specs/*` and property-based tests.
2. A scheduled Crew job runs the property suite (no model call, to save credits).
3. If a property fails, Poltergeist bisects history to find the first bad commit.
4. The dashboard shows each spec as a room and each failing property as a ghost.
5. The Crew agent is only called to explain a haunting in plain English.

## Repo layout (planned)

```
.kiro/                  Kiro specs, steering, hooks, agents (required by the rules)
packages/core/          Engine: spec reader, property runner, bisect, haunting model
packages/crew-app/      Kiro Crew app: app.json, agents, skills, React dashboard
fixtures/haunted-repo/  Demo repo with planted regressions
docs/                   Build plan and Kiro usage log
```

## License

MIT, see `LICENSE`.
