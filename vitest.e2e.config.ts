import { defineConfig } from 'vitest/config';
import path from 'path';

const cacheDir = path.resolve(
  process.env.TMPDIR ?? '/tmp',
  'debug80-vitest-e2e-cache'
);

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'tests/e2e/adapter/vscode-mock.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    cache: {
      dir: cacheDir,
    },
  },
});
