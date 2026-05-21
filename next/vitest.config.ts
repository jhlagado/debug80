import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['next/test/**/*.test.ts'],
  },
});
