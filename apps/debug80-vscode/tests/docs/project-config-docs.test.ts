import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const PROJECT_CONFIG_DOC = path.resolve(
  __dirname,
  '../../docs/codebase/part1/02-project-configuration.md'
);

describe('project configuration documentation', () => {
  it('describes debug80.json as project configuration rather than a source manifest', () => {
    const text = fs.readFileSync(PROJECT_CONFIG_DOC, 'utf8');

    expect(text).toContain('versioned project configuration');
    expect(text).toContain('Version 2 project files');
    expect(text).not.toMatch(/\bversioned manifest\b/i);
    expect(text).not.toMatch(/\bv2 manifest\b/i);
    expect(text).not.toMatch(/\bversion 2 manifest\b/i);
    expect(text).not.toMatch(/\bproject manifest\b/i);
  });
});
