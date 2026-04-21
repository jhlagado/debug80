import { defineConfig } from 'vitest/config';

export default defineConfig({
  assetsInclude: ['**/*.bin'],
  test: {
    environment: 'happy-dom',
    include: ['tests/webview/**/*.test.ts'],
  },
});
