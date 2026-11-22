# haunting-store requirements

## Background

The haunting store persists the result of every bisect run as a **Haunting** record and exposes a CLI that drives the scan-and-store loop. It is the layer between the bisect engine and the dashboard.

## Glossary

| Term | Meaning |
|---|---|
| Haunting | A record that describes one failing property: where it first broke, what the shrunk counterexample was, and whether it has been fixed yet. |
| Last words | The shrunk fast-check counterexample captured by running the property at the first bad commit. |
| Banished | Status set when the property passes again at the most-recently-scanned bad ref. |
| Config file | A JSON file listing `{ spec, property }` pairs to scan. |
| Scan | One invocation of `poltergeist scan` that runs bisect for every entry in the config file. |

---

## Requirements

### REQ-HS-01 — Haunting record shape
**When** a haunting is created, **the system shall** store exactly the following fields:
- `id` — a UUID v4 that is stable across re-scans.
- `spec` — the spec name string (e.g. `"bisect-engine"`).
- `propertyId` — the Vitest test-name pattern that identifies the property.
- `status` — one of the string literals `"haunting"` or `"banished"`.
- `firstBadCommit` — an object with `sha`, `author`, `email`, `date` (ISO 8601), and `message`.
- `lastWords` — the shrunk counterexample string captured by running the property at `firstBadCommit` in a throwaway worktree; empty string if the re-run produced no counterexample text.
- `detectedAt` — ISO 8601 timestamp of when the haunting was first created.
- `banishedAt` — ISO 8601 timestamp of when the haunting was banished, or `null` while still active.

### REQ-HS-02 — JSON serialisation round-trip
**When** a Haunting object is serialised to JSON and deserialised, **the system shall** produce a value that is deep-equal to the original.

### REQ-HS-03 — Persistent store file
**When** `poltergeist scan` completes, **the system shall** write all hauntings to the path given by `--out` as a JSON array. If the file already exists it is overwritten atomically (write to a `.tmp` file then rename).

### REQ-HS-04 — No duplicate IDs
**When** `poltergeist scan` is run more than once, **the system shall** not produce two hauntings with the same `id` in the output file. A re-scan that finds the same `(spec, propertyId, firstBadCommit.sha)` triple reuses the existing haunting's `id` and `detectedAt`.

### REQ-HS-05 — Idempotent banishing
**When** a haunting whose `status` is already `"banished"` is banished again, **the system shall** leave `status`, `banishedAt`, and all other fields unchanged.

### REQ-HS-06 — Re-scan banishes resolved hauntings
**When** `poltergeist scan` runs and a property that was previously `"haunting"` now passes at the `--bad` ref, **the system shall** set that haunting's `status` to `"banished"` and record the current time in `banishedAt`.

### REQ-HS-07 — Re-scan does not duplicate active hauntings
**When** `poltergeist scan` runs and a property is still failing at the same first bad commit as a previous scan, **the system shall** update the existing haunting record in place rather than appending a new one.

### REQ-HS-08 — Last-words capture
**When** bisect finds a first bad commit, **the system shall** run the property once more at that commit in a throwaway worktree (separate from the bisect worktree) to capture the shrunk counterexample, and store the result in `lastWords`.

### REQ-HS-09 — CLI scan command
**When** invoked as `poltergeist scan --repo <path> --good <ref> --bad <ref> --config <file> --out <file>`, **the system shall** read the config file, run bisect for each `{ spec, property }` entry, capture last words, merge with any existing hauntings in `--out`, and write the result.

### REQ-HS-10 — CLI Windows compatibility
**The system shall** invoke the CLI via `node packages/core/src/cli/scan.ts` (through `ts-node` or compiled) or via a `bin` entry in `package.json`. The CLI must not use shell syntax that is unavailable on Windows (no `#!/usr/bin/env`, no bash-isms in the invocation path). It must work with `node --experimental-strip-types` on Node 22, or be pre-compiled by `tsc`.

### REQ-HS-11 — Config file format
**When** reading the config file, **the system shall** expect a JSON object with a `checks` array where each element has a `spec` string and a `property` string. Unknown fields are ignored.
