import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    testTimeout: 60_000,
    globalSetup: ['src/test-setup/global-setup.ts'],
  },
});
