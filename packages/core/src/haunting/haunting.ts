/**
 * haunting.ts — the Haunting record type and its pure transformations.
 */

import { randomUUID } from 'node:crypto';

// ── types ─────────────────────────────────────────────────────────────────────

export type HauntingStatus = 'haunting' | 'banished';

export interface Haunting {
  /** UUID v4, stable across re-scans of the same (spec, propertyId, sha) triple. */
  id: string;
  /** Spec name, e.g. "bisect-engine". */
  spec: string;
  /** Vitest test-name pattern that identifies the property. */
  propertyId: string;
  status: HauntingStatus;
  firstBadCommit: {
    sha: string;
    author: string;
    email: string;
    /** ISO 8601 author date. */
    date: string;
    message: string;
  };
  /** Shrunk fast-check counterexample, or "" if none was captured. */
  lastWords: string;
  /** ISO 8601 timestamp when this haunting was first detected. */
  detectedAt: string;
  /** ISO 8601 timestamp when banished, or null while still active. */
  banishedAt: string | null;
}

// ── constructors and transformations ─────────────────────────────────────────

/**
 * Creates a new active Haunting.
 *
 * @param spec            Spec name.
 * @param propertyId      Vitest test-name pattern.
 * @param firstBadCommit  Commit info from the bisect result.
 * @param lastWords       Shrunk counterexample string (may be "").
 * @param now             Override for detectedAt (ISO 8601). Defaults to Date.now().
 */
export function makeHaunting(
  spec: string,
  propertyId: string,
  firstBadCommit: Haunting['firstBadCommit'],
  lastWords: string,
  now?: string,
): Haunting {
  return {
    id: randomUUID(),
    spec,
    propertyId,
    status: 'haunting',
    firstBadCommit,
    lastWords,
    detectedAt: now ?? new Date().toISOString(),
    banishedAt: null,
  };
}

/**
 * Returns a banished copy of `h`.
 * If `h.status` is already `'banished'`, returns `h` unchanged (idempotent, REQ-HS-05).
 *
 * @param h    The haunting to banish.
 * @param now  Override for banishedAt (ISO 8601). Defaults to Date.now().
 */
export function banish(h: Haunting, now?: string): Haunting {
  if (h.status === 'banished') return h;
  return {
    ...h,
    status: 'banished',
    banishedAt: now ?? new Date().toISOString(),
  };
}
