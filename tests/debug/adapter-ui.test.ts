/**
 * @file Adapter UI helpers tests.
 */

import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { emitConsoleOutput, emitMainSource } from '../../src/debug/adapter-ui';

describe('adapter-ui', () => {
  it('emits console output with newline by default', () => {
    const events: { body?: { output?: string } }[] = [];
    emitConsoleOutput((event) => events.push(event as { body?: { output?: string } }), 'hello');
    expect(events[0]?.body?.output).toBe('hello\n');
  });

  it('emits main source event payload', () => {
    const events: { body?: { path?: string } }[] = [];
    const mainPath = path.join(os.tmpdir(), 'main.asm');
    emitMainSource((event) => events.push(event as { body?: { path?: string } }), mainPath);
    expect(events[0]?.body?.path).toBe(mainPath);
  });
});
