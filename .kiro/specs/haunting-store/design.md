# haunting-store design

## Module locations

```
packages/core/src/haunting/
  haunting.ts       Haunting type, makeHaunting(), banish()
  store.ts          loadStore(), saveStore(), mergeHauntings()
  last-words.ts     captureLastWords()
  index.ts          public re-exports

packages/core/src/cli/
  scan.ts           CLI entry point (bin script)

fixtures/
  poltergeist.config.json   config file for haunted-repo
```

---

## Haunting type (`haunting.ts`)

```typescript
export type HauntingStatus = 'haunting' | 'banished';

export interface Haunting {
  id: string;               // UUID v4, stable across re-scans
  spec: string;             // spec name, e.g. "bisect-engine"
  propertyId: string;       // Vitest test-name pattern
  status: HauntingStatus;
  firstBadCommit: {
    sha: string;
    author: string;
    email: string;
    date: string;           // ISO 8601
    message: string;
  };
  lastWords: string;        // shrunk counterexample, or "" if none
  detectedAt: string;       // ISO 8601
  banishedAt: string | null;
}

/**
 * Creates a new active Haunting.  id and detectedAt are generated here.
 */
export function makeHaunting(
  spec: string,
  propertyId: string,
  firstBadCommit: Haunting['firstBadCommit'],
  lastWords: string,
  now?: string,            // injectable for tests
): Haunting;

/**
 * Returns a banished copy of `h`.  If h.status is already 'banished',
 * returns h unchanged (idempotent).
 */
export function banish(h: Haunting, now?: string): Haunting;
```

---

## Store (`store.ts`)

```typescript
/**
 * Loads hauntings from a JSON file.  Returns [] if the file does not exist.
 * Throws if the file exists but is not valid JSON or not an array.
 */
export function loadStore(outPath: string): Haunting[];

/**
 * Writes hauntings to outPath atomically: writes to outPath + '.tmp' then
 * renames.  Creates parent directories if needed.
 */
export function saveStore(outPath: string, hauntings: Haunting[]): void;

/**
 * Merges a fresh scan result into the existing hauntings array.
 *
 * Rules (REQ-HS-04 through REQ-HS-07):
 * - A "scan entry" is { spec, propertyId, firstBadCommit, lastWords } from a fresh bisect.
 * - If an existing haunting matches on (spec, propertyId, firstBadCommit.sha), update
 *   lastWords in place; do not change id, detectedAt, or status.
 * - If no existing haunting matches but the same (spec, propertyId) pair exists with a
 *   different sha, that haunting is kept as-is (it may later be banished).
 * - If no haunting exists for (spec, propertyId) at all, append a new one.
 *
 * Also accepts a list of "passing" (spec, propertyId) pairs to banish.
 */
export function mergeHauntings(
  existing: Haunting[],
  newEntries: ScanEntry[],
  nowPassing: PassingEntry[],
  now?: string,
): Haunting[];

export interface ScanEntry {
  spec: string;
  propertyId: string;
  firstBadCommit: Haunting['firstBadCommit'];
  lastWords: string;
}

export interface PassingEntry {
  spec: string;
  propertyId: string;
}
```

---

## Last-words capture (`last-words.ts`)

```typescript
/**
 * Runs propertyId at commit sha in a throwaway worktree branched from repoPath.
 * Returns the counterexample string from the first failed assertion, or "" if
 * the run passed or produced no message.
 *
 * Uses installDependencies + runProperty from the bisect runner.
 * Always cleans up the worktree.
 */
export async function captureLastWords(
  repoPath: string,
  sha: string,
  propertyId: string,
  seed: number,
): Promise<string>;
```

---

## Config file format

```json
{
  "checks": [
    { "spec": "math-props", "property": "prop-add-commutative" },
    { "spec": "math-props", "property": "prop-double-is-even" },
    { "spec": "math-props", "property": "prop-abs-nonneg" }
  ]
}
```

Stored at `fixtures/poltergeist.config.json` for the fixture repo.

---

## CLI (`scan.ts`)

Entry point registered in `package.json` as:

```json
"bin": { "poltergeist": "./dist/cli/scan.js" }
```

For development without a build step (Node 20 does not support `--experimental-strip-types`), compile with `tsc` first. The `npm run build` script produces `dist/`.

**Algorithm:**

1. Parse `--repo`, `--good`, `--bad`, `--config`, `--out` from `process.argv`.
2. Load existing hauntings from `--out` (empty array if file absent).
3. Read config file; validate it has a `checks` array.
4. For each check:
   a. Run `bisect({ repoPath, propertyId: check.property, goodCommit: good, badCommit: bad })`.
   b. On success: call `captureLastWords` to get the shrunk counterexample.
   c. On `BadCommitPassesError` or `GoodCommitFailsError`: treat as "passing" — add to `nowPassing`.
   d. On other errors: print a warning and continue.
5. Call `mergeHauntings(existing, newEntries, nowPassing)`.
6. Call `saveStore(out, merged)`.
7. Print a summary to stdout.

The CLI never calls `process.exit` with a non-zero code for expected bisect errors; it logs them as warnings. It exits non-zero only on configuration or I/O errors.

---

## Testing strategy

Tests live in `packages/core/src/haunting/__tests__/`.

**`haunting.property.test.ts`** — fast-check, 200 runs:
- `[REQ-HS-02]` JSON round-trip: serialise a generated Haunting to JSON, parse it back, assert deep-equal.
- `[REQ-HS-05]` Idempotent banish: banish a haunting twice, assert second result equals first.
- `[REQ-HS-04]` No duplicate IDs: generate a list of scan entries, merge twice, assert no two hauntings share an id.

**`store.test.ts`** — unit tests:
- `[REQ-HS-03]` saveStore / loadStore round-trip including atomic write.
- `[REQ-HS-06]` mergeHauntings sets status to banished for passing entries.
- `[REQ-HS-07]` mergeHauntings updates lastWords in place without changing id.

**`cli.test.ts`** — integration test using the fixture repo:
- `[REQ-HS-09]` poltergeist scan produces a hauntings.json containing the three known regression commits.
- `[REQ-HS-06, REQ-HS-07]` A second scan with the same inputs leaves hauntings unchanged (idempotent).
