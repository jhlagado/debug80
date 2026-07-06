import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseGlimmer } from '../src/parse.js';

const counterToy = readFileSync(path.join(import.meta.dirname, '../examples/counter.glim'), 'utf8');

describe('parseGlimmer', () => {
  it('parses the CounterToy example', () => {
    const { program, diagnostics } = parseGlimmer(counterToy);
    expect(diagnostics).toEqual([]);
    expect(program).not.toBeNull();
    expect(program?.name).toBe('CounterToy');
    expect(program?.states).toEqual([
      expect.objectContaining({ name: 'Count', type: 'byte', initial: 0, dirtyOnStart: true }),
    ]);
    expect(program?.pulses.map((p) => p.name)).toEqual(['IncPressed', 'DecPressed']);
    expect(program?.bindings).toEqual([
      expect.objectContaining({ kind: 'key', key: 'KEY_1', target: 'IncPressed' }),
      expect.objectContaining({ kind: 'key', key: 'KEY_2', target: 'DecPressed' }),
    ]);
    expect(program?.effects.map((e) => e.name)).toEqual([
      'ApplyIncrement',
      'ApplyDecrement',
      'DrawCount',
    ]);
    const draw = program?.effects[2];
    expect(draw?.phase).toBe('render');
    expect(draw?.depends).toEqual(['Count']);
    expect(draw?.body.join('\n')).toContain('call API_DrawChar');
  });

  it('reports a missing program declaration', () => {
    const { program, diagnostics } = parseGlimmer('pulse Fire\n');
    expect(program).toBeNull();
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('Missing program') }),
    );
  });

  it('reports an unterminated body', () => {
    const source = [
      'program P',
      'pulse Go',
      'effect E',
      'phase logic',
      'on Go',
      'begin',
      'ret',
    ].join('\n');
    const { diagnostics } = parseGlimmer(source);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('missing end') }),
    );
  });

  it('reports an unknown phase', () => {
    const source = [
      'program P',
      'pulse Go',
      'effect E',
      'phase teleport',
      'on Go',
      'begin',
      'ret',
      'end',
    ].join('\n');
    const { diagnostics } = parseGlimmer(source);
    expect(diagnostics.map((d) => d.message).join('\n')).toContain(
      'Unknown effect phase "teleport"',
    );
  });

  it('reports an undeclared dependency', () => {
    const source = ['program P', 'effect E', 'phase logic', 'on Ghost', 'begin', 'ret', 'end'].join(
      '\n',
    );
    const { diagnostics } = parseGlimmer(source);
    expect(diagnostics.map((d) => d.message).join('\n')).toContain('undeclared cell "Ghost"');
  });

  it('rejects a binding onto an undeclared pulse', () => {
    const source = ['program P', 'bind key KEY_1 rising -> Nope'].join('\n');
    const { diagnostics } = parseGlimmer(source);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('not a declared pulse') }),
    );
  });

  it('rejects duplicate state/pulse names', () => {
    const source = ['program P', 'state X : byte', 'pulse X'].join('\n');
    const { diagnostics } = parseGlimmer(source);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('Duplicate state/pulse name') }),
    );
  });
});
