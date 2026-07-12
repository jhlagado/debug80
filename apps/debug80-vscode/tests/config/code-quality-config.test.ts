import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import vitestConfig from '../../vitest.config';

const rootDir = path.resolve(__dirname, '../..');

function loadPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
}

function isConcreteSourcePath(pattern: string): boolean {
  return pattern.startsWith('src/') && !/[*{}[\]]/.test(pattern);
}

describe('code-quality configuration', () => {
  it('keeps concrete coverage exclusions pointed at existing source files', () => {
    const coverageExclude = vitestConfig.test?.coverage?.exclude ?? [];
    const staleExclusions = coverageExclude
      .filter(isConcreteSourcePath)
      .filter((pattern) => !fs.existsSync(path.join(rootDir, pattern)));

    expect(staleExclusions).toEqual([]);
  });

  it('formats maintained TypeScript in source, tests, and webview code', () => {
    const scripts = loadPackageJson().scripts ?? {};
    const expectedGlobs = ['src/**/*.ts', 'tests/**/*.ts', 'webview/**/*.ts'];

    for (const scriptName of ['format', 'format:check']) {
      const script = scripts[scriptName] ?? '';

      for (const glob of expectedGlobs) {
        expect(script, `${scriptName} should include ${glob}`).toContain(`"${glob}"`);
      }
    }
  });
});
