/**
 * haunting.property.test.ts
 *
 * Property-based tests for the Haunting type and its pure transformations.
 * 200 runs each.
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { makeHaunting, banish, type Haunting } from '../haunting.js';

const NUM_RUNS = 200;

// ── arbitraries ───────────────────────────────────────────────────────────────

/** Arbitrary non-empty printable string (avoids surrogate pairs and control chars). */
const printableString = fc.string({ minLength: 1, maxLength: 80 }).filter(
  (s) => s.trim().length > 0,
);

/** Arbitrary ISO 8601 timestamp (a fixed epoch plus a random offset). */
const isoTimestamp = fc
  .integer({ min: 0, max: 1_000_000_000 })
  .map((n) => new Date(1_700_000_000_000 + n * 1000).toISOString());

/** Arbitrary hex SHA (40 chars). */
const hexSha = fc
  .hexaString({ minLength: 40, maxLength: 40 })
  .map((s) => s.toLowerCase());

/** Arbitrary CommitInfo. */
const commitInfoArb = fc.record({
  sha: hexSha,
  author: printableString,
  email: printableString,
  date: isoTimestamp,
  message: printableString,
});

/** Arbitrary active Haunting produced through makeHaunting(). */
const activeHauntingArb = fc
  .record({
    spec: printableString,
    propertyId: printableString,
    firstBadCommit: commitInfoArb,
    lastWords: fc.string({ maxLength: 200 }),
    now: isoTimestamp,
  })
  .map(({ spec, propertyId, firstBadCommit, lastWords, now }) =>
    makeHaunting(spec, propertyId, firstBadCommit, lastWords, now),
  );

/** Arbitrary Haunting (either active or banished). */
const hauntingArb: fc.Arbitrary<Haunting> = fc
  .record({ haunting: activeHauntingArb, banishNow: fc.option(isoTimestamp) })
  .map(({ haunting, banishNow }) =>
    banishNow !== null ? banish(haunting, banishNow) : haunting,
  );

// ── REQ-HS-02: JSON round-trip ────────────────────────────────────────────────

describe('Haunting JSON round-trip (REQ-HS-02)', () => {
  it(
    '[REQ-HS-02] serialising a Haunting to JSON and parsing it back produces a deep-equal value',
    () => {
      fc.assert(
        fc.property(hauntingArb, (h) => {
          const roundTripped = JSON.parse(JSON.stringify(h)) as Haunting;
          // Deep equality on every field.
          return (
            roundTripped.id          === h.id          &&
            roundTripped.spec        === h.spec        &&
            roundTripped.propertyId  === h.propertyId  &&
            roundTripped.status      === h.status      &&
            roundTripped.lastWords   === h.lastWords   &&
            roundTripped.detectedAt  === h.detectedAt  &&
            roundTripped.banishedAt  === h.banishedAt  &&
            roundTripped.firstBadCommit.sha     === h.firstBadCommit.sha     &&
            roundTripped.firstBadCommit.author  === h.firstBadCommit.author  &&
            roundTripped.firstBadCommit.email   === h.firstBadCommit.email   &&
            roundTripped.firstBadCommit.date    === h.firstBadCommit.date    &&
            roundTripped.firstBadCommit.message === h.firstBadCommit.message
          );
        }),
        { numRuns: NUM_RUNS },
      );
    },
  );
});

// ── REQ-HS-05: idempotent banishing ──────────────────────────────────────────

describe('Haunting idempotent banish (REQ-HS-05)', () => {
  it(
    '[REQ-HS-05] banishing a haunting twice returns the same value as banishing once',
    () => {
      fc.assert(
        fc.property(activeHauntingArb, isoTimestamp, (h, now) => {
          const once  = banish(h, now);
          const twice = banish(once, now);
          return JSON.stringify(once) === JSON.stringify(twice);
        }),
        { numRuns: NUM_RUNS },
      );
    },
  );

  it(
    '[REQ-HS-05] banishing an already-banished haunting does not change any field',
    () => {
      fc.assert(
        fc.property(activeHauntingArb, isoTimestamp, isoTimestamp, (h, t1, t2) => {
          const once  = banish(h, t1);
          const twice = banish(once, t2); // different timestamp
          return JSON.stringify(once) === JSON.stringify(twice);
        }),
        { numRuns: NUM_RUNS },
      );
    },
  );
});
