---
inclusion: always
---

# Repository structure

```
.kiro/
  specs/<feature>/{requirements,design,tasks}.md
  steering/            (this folder)
  hooks/
  agents/
packages/
  core/                engine and CLI
    src/spec/          read specs and map properties to tests
    src/run/           run the property suite, capture failures
    src/bisect/        git bisect driver
    src/haunting/      Haunting model, store, banish logic
  crew-app/            Kiro Crew app
    app.json           manifest
    agents/            explainer agent
    skills/            skills used by the agent
    ui/                React dashboard
fixtures/
  haunted-repo/        small repo whose history contains planted regressions
docs/
  KIRO_PLAN.md
  KIRO_LOG.md
```

## Conventions
- One spec per feature under `.kiro/specs/`. Use these names: `bisect-engine`, `haunting-store`, `scheduled-check`, `dashboard`.
- Keep modules small and named for what they do. No `utils.ts` dumping ground.
- The fixture repo must be built by a script (`fixtures/build-haunted-repo.sh`) so history is reproducible, with commits that break specific properties on purpose.
