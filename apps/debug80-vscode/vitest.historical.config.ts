import { defineConfig } from 'vitest/config';

// Explicit compatibility qualification; ordinary tests do not execute AZM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/debug/azm-contract.test.ts'],
    testTimeout: 30_000,
  },
});
