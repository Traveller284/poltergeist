---
inclusion: always
---

# Product: Poltergeist

## One-line pitch
Poltergeist is a Kiro Crew app that finds out which commit broke a spec's promise.

## Problem
Specs written with Kiro describe behavior as correctness properties. Code changed outside the spec workflow can silently stop satisfying them. Existing tools flag spec drift at commit time or by file mapping. Poltergeist adds history: it names the commit where a property first failed.

## Core loop (do not deviate without updating this file)
1. Read `.kiro/specs/*` in a target repo and locate its property-based tests.
2. Run the property suite on a schedule with a plain script (no model call).
3. On failure, bisect git history and re-run only the failing property at each step.
4. Record a **Haunting**: spec, property, first bad commit, author, date, shrunk counterexample.
5. Show hauntings in the dashboard. A haunting is banished when the property passes again.

## Vocabulary (use these names in code and UI)
- **Room**: one spec.
- **Ghost / Haunting**: one failing property.
- **Cause of death**: the first bad commit found by bisect.
- **Last words**: the shrunk counterexample.
- **Banished**: the property passes again.

## Non-goals
- No support for languages other than TypeScript with fast-check in the MVP.
- No automatic code fixing. Poltergeist reports, it does not repair.
- No hosted service. It runs locally or on the user's own Crew gateway.

## Scope guard
If a feature does not serve the core loop or the demo video, cut it.
