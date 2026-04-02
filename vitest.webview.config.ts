import { defineConfig } from 'vitest/config';

export default defineConfig({
  assetsInclude: ['**/*.bin'],
  test: {
    environment: 'jsdom',
    include: ['tests/webview/**/*.test.ts'],
  },
});
