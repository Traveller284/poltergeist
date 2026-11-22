# haunting-store tasks

Tasks are ordered. Complete each before starting the next.

---

## Task HS-1 — Haunting type and pure functions (`haunting.ts`)

- [ ] Create `packages/core/src/haunting/haunting.ts` with the `Haunting` interface, `HauntingStatus` type, `makeHaunting()`, and `banish()` as specified in the design.
- [ ] `makeHaunting` generates a UUID v4 via `crypto.randomUUID()` and an ISO 8601 `detectedAt` timestamp. Both accept an optional `now` parameter for deterministic tests.
- [ ] `banish` returns the haunting unchanged when `status` is already `'banished'` (idempotent, REQ-HS-05).
- [ ] Export everything from `packages/core/src/haunting/index.ts`.
- [ ] Write `packages/core/src/haunting/__tests__/haunting.property.test.ts` with fast-check, ≥ 200 runs:
  - `[REQ-HS-02]` JSON round-trip property.
  - `[REQ-HS-05]` Idempotent banish property.

**Covers:** REQ-HS-01, REQ-HS-02, REQ-HS-05.

---

## Task HS-2 — Store (`store.ts`)

- [ ] Create `packages/core/src/haunting/store.ts` with `loadStore()`, `saveStore()`, and `mergeHauntings()` as specified in the design.
- [ ] `saveStore` writes atomically: `outPath + '.tmp'` then `fs.renameSync`. Creates parent directories with `fs.mkdirSync(..., { recursive: true })`.
- [ ] `loadStore` returns `[]` when the file is absent; throws on malformed JSON.
- [ ] `mergeHauntings` implements the merge rules from the design (REQ-HS-04, REQ-HS-06, REQ-HS-07).
- [ ] Write `packages/core/src/haunting/__tests__/store.test.ts`:
  - `[REQ-HS-03]` saveStore/loadStore round-trip in a temp directory.
  - `[REQ-HS-06]` mergeHauntings banishes entries in nowPassing.
  - `[REQ-HS-07]` mergeHauntings updates lastWords in-place without changing id.
  - `[REQ-HS-04]` fast-check: no duplicate IDs after repeated merges (≥ 200 runs).

**Covers:** REQ-HS-03, REQ-HS-04, REQ-HS-06, REQ-HS-07.

---

## Task HS-3 — Last-words capture (`last-words.ts`)

- [ ] Create `packages/core/src/haunting/last-words.ts` with `captureLastWords(repoPath, sha, propertyId, seed)` as specified in the design.
- [ ] Creates a throwaway worktree at `sha`, calls `installDependencies` and `runProperty`, cleans up in `finally`.
- [ ] Returns the counterexample string from `failureMessages[0]` if the run failed, or `""` otherwise.
- [ ] Write `packages/core/src/haunting/__tests__/last-words.test.ts`:
  - `[REQ-HS-08]` captureLastWords returns a non-empty string at SHA_ADD_BAD for `prop-add-commutative`.
  - `[REQ-HS-08]` captureLastWords returns `""` at SHA_GOOD for `prop-add-commutative` (property passes).

**Covers:** REQ-HS-08.

---

## Task HS-4 — CLI (`scan.ts`) and config file

- [ ] Add `fixtures/poltergeist.config.json` listing all three fixture properties.
- [ ] Create `packages/core/src/cli/scan.ts` implementing the CLI as described in the design.
- [ ] Add `"bin": { "poltergeist": "./dist/cli/scan.js" }` to `package.json`.
- [ ] Add `"build": "tsc"` script if not already present. Compile with `tsc` before running.
- [ ] The compiled CLI is invoked as `node dist/cli/scan.js` on Windows (no shebang required for direct node invocation).
- [ ] Write `packages/core/src/haunting/__tests__/cli.test.ts`:
  - `[REQ-HS-09]` Run the compiled CLI on the fixture repo. Assert hauntings.json contains 3 hauntings, one per regression, each with the correct `firstBadCommit.sha`.
  - `[REQ-HS-09, REQ-HS-07]` Run a second time; assert the output is identical (idempotent).
  - `[REQ-HS-10]` Assert the CLI exits 0.

**Covers:** REQ-HS-09, REQ-HS-10, REQ-HS-11.

---

## Definition of done

1. `tsc --noEmit` exits 0.
2. `vitest run` exits 0 with every test passing.
3. Every requirement REQ-HS-01 through REQ-HS-11 is referenced in at least one passing test name.
