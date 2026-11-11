# Poltergeist build plan

Deadline: **Dec 4, 2026, 2:00 PM PT = Dec 5, 3:30 AM IST.** Aim to submit by Dec 3.

The hackathon requires that Kiro does the building, and judges read how you used it. So this repo contains steering and a plan, and the specs and code should be produced by Kiro, with you reviewing. Record what happens in `docs/KIRO_LOG.md` as you go.

## Day 0 checklist (do first)
- [ ] Create a Kiro account and request the 4,000 credits (deadline Dec 1, 12:00 PM PT; processing takes up to 48 business hours; expect an ID check).
- [ ] Create a **public GitHub repo** and push this folder. Confirm the MIT license shows in the About box and that `.kiro/` is committed.
- [ ] Check kiro.dev/docs/models/available-models for restrictions in India.
- [ ] Ask in Discord #kiroween-hackathon: can the Crew app live in the same repo, or does the Best Kiro Crew App bonus need a separate repo? (Rules say "separate repo".)
- [ ] Join tonight's Devpost Build Session: Wed Nov 11, 10:00 AM PT = 11:30 PM IST.

## Credit budget (4,000 is one-time)
- Run tests and bisect with scripts, not agent calls.
- Keep hooks few and cheap. Hooks launch agent tasks, so many hooks can burn credits.
- Use the agent only for specs, implementation tasks, and the explainer.

## Schedule
| Dates | Goal |
|---|---|
| Nov 11-13 | Repo, credits, specs for `bisect-engine` and `haunting-store` |
| Nov 14-20 | Engine works end to end on the fixture repo (CLI only) |
| Nov 21-23 | **Checkpoint:** if bisect is not reliable by Nov 23, cut features, not reliability |
| Nov 24-29 | Crew app, scheduled check, dashboard |
| Nov 30-Dec 2 | Polish, demo video (under 3 minutes), write-up, blog, social post |
| Dec 3 | Submit |

## Prompts to give Kiro (paste in order)

### 1. Spec: bisect-engine
> Create a spec called `bisect-engine` for the Poltergeist project. Follow the steering files in `.kiro/steering`. Requirement: given a git repo path, a property test identifier, and a known-good and known-bad commit, find the first commit at which the property fails, using a temporary git worktree and a fixed fast-check seed. Include correctness properties: the returned commit fails and its parent passes; the result is deterministic; the target repo's working tree is never modified. Use EARS requirements.

### 2. Spec: haunting-store
> Create a spec called `haunting-store`. A Haunting records spec, property, first bad commit, author, date, shrunk counterexample, and status (haunting or banished). Include properties for serialization round-trip and idempotent banishing.

### 3. Fixture
> Write `fixtures/build-haunted-repo.sh` that builds a small TypeScript repo with a Kiro spec and fast-check tests, with 15 commits, where commits 6, 9 and 12 each break a different property on purpose.

### 4. Specs: scheduled-check and dashboard
> Create specs `scheduled-check` and `dashboard`. The check runs as a Crew cron job calling a script, with no model call. The dashboard follows `.kiro/steering/haunted-ui.md`, including the list view and reduced-motion support.

### 5. Hooks (keep to two)
> Create a hook that runs the core test suite when files in `packages/core/src` are saved. Create a hook that checks UI changes against the accessibility rules in `haunted-ui.md`.

### 6. Custom agent: Explainer
> Create a custom agent called `explainer` for the Crew app that, given a Haunting, explains in two sentences what the counterexample means and which part of the commit diff likely caused it.

## Things I could not verify (check in the docs before relying on them)
- Exact steering front-matter keys (`inclusion: always` is what I used).
- The Crew app manifest fields and how cron jobs are declared by an app: see kiro.dev/docs/crew/apps/manifest/ and kiro.dev/docs/crew/features/cron/.
- Crew cron jobs only fire while the Crew gateway is running and missed runs are not replayed, so keep the gateway running during the demo.

## Bonus prizes to line up
- **Best Kiro Crew App ($1,000):** own repo link plus a write-up.
- **Bonus Blog (2,000 credits):** publish during the period and say it is part of Kiroween 2026.
- **Social Blitz:** post must **start** with #KiroweenHackathon26.
- **Best Demo ($1,000):** needs a strong video.
