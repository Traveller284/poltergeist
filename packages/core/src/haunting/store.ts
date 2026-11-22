/**
 * store.ts — persistence for Haunting records.
 *
 * loadStore / saveStore handle JSON serialisation to disk.
 * mergeHauntings implements the idempotent scan-and-merge logic.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

import { type Haunting, makeHaunting, banish } from './haunting.js';

// ── public types ──────────────────────────────────────────────────────────────

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

// ── load / save ───────────────────────────────────────────────────────────────

/**
 * Loads hauntings from a JSON file.
 * Returns [] if the file does not exist.
 * Throws if the file is not valid JSON or not an array.
 */
export function loadStore(outPath: string): Haunting[] {
  if (!existsSync(outPath)) return [];
  const raw = readFileSync(outPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${outPath} does not contain a JSON array`);
  }
  return parsed as Haunting[];
}

/**
 * Writes hauntings to outPath atomically.
 * Writes to outPath + '.tmp', then renames to outPath.
 * Creates parent directories if needed.
 */
export function saveStore(outPath: string, hauntings: Haunting[]): void {
  const dir = dirname(outPath);
  mkdirSync(dir, { recursive: true });
  const tmp = outPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(hauntings, null, 2), 'utf8');
  renameSync(tmp, outPath);
}

// ── merge logic ───────────────────────────────────────────────────────────────

/**
 * Merges fresh bisect results into the existing hauntings array.
 *
 * Rules (REQ-HS-04 through REQ-HS-07):
 *
 * For each entry in `newEntries`:
 *   - If an existing haunting matches on (spec, propertyId, sha) → update lastWords only.
 *   - Otherwise append a new haunting (new id, new detectedAt).
 *
 * For each entry in `nowPassing`:
 *   - Banish every haunting matching (spec, propertyId) that is still active.
 *
 * The same (spec, propertyId) can only appear once in the output because bisect
 * is deterministic and config entries are unique. Duplicates from repeated calls
 * are prevented by the sha-match rule (REQ-HS-04).
 */
export function mergeHauntings(
  existing: Haunting[],
  newEntries: ScanEntry[],
  nowPassing: PassingEntry[],
  now?: string,
): Haunting[] {
  // Work on a mutable copy indexed by id for O(1) updates.
  const byId = new Map<string, Haunting>(existing.map((h) => [h.id, { ...h }]));

  for (const entry of newEntries) {
    // Find an existing haunting for the same (spec, propertyId, sha).
    const match = [...byId.values()].find(
      (h) =>
        h.spec === entry.spec &&
        h.propertyId === entry.propertyId &&
        h.firstBadCommit.sha === entry.firstBadCommit.sha,
    );

    if (match !== undefined) {
      // Update lastWords in-place; leave id, detectedAt, status unchanged.
      byId.set(match.id, { ...match, lastWords: entry.lastWords });
    } else {
      // New haunting — generate a fresh id and detectedAt.
      const h = makeHaunting(
        entry.spec,
        entry.propertyId,
        entry.firstBadCommit,
        entry.lastWords,
        now,
      );
      byId.set(h.id, h);
    }
  }

  // Banish hauntings whose property now passes.
  for (const passing of nowPassing) {
    for (const [id, h] of byId) {
      if (h.spec === passing.spec && h.propertyId === passing.propertyId && h.status === 'haunting') {
        byId.set(id, banish(h, now));
      }
    }
  }

  return [...byId.values()];
}
