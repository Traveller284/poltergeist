import { describe, it, expect } from 'vitest';
import { BISECT_SEED } from '../index.js';

describe('scaffold', () => {
  it('BISECT_SEED is defined', () => {
    expect(BISECT_SEED).toBe(20241031);
  });
});
