/**
 * last-words.test.ts
 *
 * Integration tests for captureLastWords against the haunted-repo fixture.
 */

import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureLastWords } from '../last-words.js';
import { BISECT_SEED } from '../../bisect/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const REPO = join(WORKSPACE_ROOT, 'fixtures', 'haunted-repo');

// Known SHAs (inlined to avoid Vite outside-root import restriction)
const SHA_GOOD    = 'c5f949188dc7b3491b95e0b33f646b60249a84e9'; // commit 1 — all pass
const SHA_ADD_BAD = '5268e5d25475f0968682244ac011f8bbcc77865d'; // commit 6 — add broken

describe('captureLastWords (REQ-HS-08)', () => {
  it(
    '[REQ-HS-08] returns a non-empty counterexample string at the first bad commit',
    async () => {
      const result = await captureLastWords(REPO, SHA_ADD_BAD, 'prop-add-commutative', BISECT_SEED);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    },
    120_000,
  );

  it(
    '[REQ-HS-08] returns empty string when the property passes at that commit',
    async () => {
      const result = await captureLastWords(REPO, SHA_GOOD, 'prop-add-commutative', BISECT_SEED);
      expect(result).toBe('');
    },
    120_000,
  );
});
