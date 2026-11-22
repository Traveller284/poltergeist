/**
 * findFirstFailing.property.test.ts
 *
 * Property-based tests for the pure findFirstFailing() kernel using fast-check.
 * 200 runs each, generated inputs cover all relevant shapes.
 *
 * findFirstFailing(commits, isFailing) finds the first index k such that
 * isFailing(commits[k]) is true, given a monotonic predicate (false…false,
 * true…true).
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { findFirstFailing } from '../index.js';

const NUM_RUNS = 200;

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Arbitrary that produces { n, k } where n is history length (1..200) and
 * k is the break index (0..n-1).  k is the first index where isFailing is true.
 */
const historyArb = fc
  .integer({ min: 1, max: 200 })
  .chain((n) =>
    fc.integer({ min: 0, max: n - 1 }).map((k) => ({ n, k })),
  );

// ── REQ-BE-05: binary search is used (call count bounded by ceil(log2(n))) ───

describe('findFirstFailing — call count (REQ-BE-05)', () => {
  it(
    '[REQ-BE-05] evaluates isFailing at most ceil(log2(n)) times for n > 1',
    () => {
      fc.assert(
        fc.property(historyArb, ({ n, k }) => {
          const commits = Array.from({ length: n }, (_, i) => i);
          let callCount = 0;

          findFirstFailing(commits, (idx) => {
            callCount += 1;
            return idx >= k;
          });

          // For n === 1 the loop body never runs (lo === hi from the start).
          const maxCalls = n === 1 ? 0 : Math.ceil(Math.log2(n));
          return callCount <= maxCalls;
        }),
        { numRuns: NUM_RUNS },
      );
    },
  );
});

// ── REQ-BE-07 + REQ-BE-08: returned index is exactly k ───────────────────────

describe('findFirstFailing — correctness (REQ-BE-07, REQ-BE-08)', () => {
  it(
    '[REQ-BE-07, REQ-BE-08] returns commit[k]: the first index where isFailing is true',
    () => {
      fc.assert(
        fc.property(historyArb, ({ n, k }) => {
          const commits = Array.from({ length: n }, (_, i) => i);
          const { index } = findFirstFailing(commits, (idx) => idx >= k);

          // The returned index must be exactly k.
          return index === k;
        }),
        { numRuns: NUM_RUNS },
      );
    },
  );

  it(
    '[REQ-BE-08] commit at returned index satisfies isFailing; commit at index - 1 does not',
    () => {
      fc.assert(
        fc.property(historyArb, ({ n, k }) => {
          const commits = Array.from({ length: n }, (_, i) => i);
          const isFailing = (idx: number) => idx >= k;
          const { index } = findFirstFailing(commits, isFailing);

          const foundCommit = commits[index]!;
          // The found commit must fail.
          if (!isFailing(foundCommit)) return false;
          // If there is a predecessor, it must pass.
          if (index > 0) {
            const parentCommit = commits[index - 1]!;
            if (isFailing(parentCommit)) return false;
          }
          return true;
        }),
        { numRuns: NUM_RUNS },
      );
    },
  );
});

// ── REQ-BE-09: determinism ────────────────────────────────────────────────────

describe('findFirstFailing — determinism (REQ-BE-09)', () => {
  it(
    '[REQ-BE-09] two calls with identical inputs return the same index',
    () => {
      fc.assert(
        fc.property(historyArb, ({ n, k }) => {
          const commits = Array.from({ length: n }, (_, i) => i);
          const isFailing = (idx: number) => idx >= k;

          const r1 = findFirstFailing(commits, isFailing);
          const r2 = findFirstFailing(commits, isFailing);

          return r1.index === r2.index;
        }),
        { numRuns: NUM_RUNS },
      );
    },
  );
});
