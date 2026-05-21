import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('compileNext', () => {
  it('starts with an empty diagnostic result', () => {
    expect(compileNext('')).toEqual({ diagnostics: [] });
  });
});
