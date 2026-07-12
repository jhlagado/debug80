/**
 * @file Glimmer 0.5 language registration and TextMate grammar contracts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

type GrammarPattern = {
  begin?: string;
  end?: string;
  include?: string;
  match?: string;
  name?: string;
  patterns?: GrammarPattern[];
};

type Grammar = {
  fileTypes?: string[];
  patterns?: GrammarPattern[];
  repository?: Record<string, GrammarPattern>;
  scopeName?: string;
};

const root = path.resolve(__dirname, '../..');
const grammar = JSON.parse(
  fs.readFileSync(path.join(root, 'syntaxes', 'glim.tmLanguage.json'), 'utf8')
) as Grammar;
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  activationEvents?: string[];
  contributes: {
    configurationDefaults: {
      'files.associations': Record<string, string>;
      'editor.tokenColorCustomizations'?: {
        textMateRules?: Array<{
          scope?: string | string[];
          settings?: { foreground?: string };
        }>;
      };
    };
    grammars: Array<{ language: string; path: string; scopeName: string }>;
    languages: Array<{ configuration: string; extensions: string[]; id: string }>;
  };
};

function tokenColor(scope: string): string | undefined {
  const rule = packageJson.contributes.configurationDefaults[
    'editor.tokenColorCustomizations'
  ]?.textMateRules?.find((candidate) =>
    Array.isArray(candidate.scope) ? candidate.scope.includes(scope) : candidate.scope === scope
  );
  return rule?.settings?.foreground;
}

function regex(pattern: string): RegExp {
  return pattern.startsWith('(?i)') ? new RegExp(pattern.slice(4), 'i') : new RegExp(pattern);
}

function patternMatches(pattern: GrammarPattern, source: string): boolean {
  if (pattern.match !== undefined && regex(pattern.match).test(source)) {
    return true;
  }
  if (pattern.begin !== undefined && regex(pattern.begin).test(source)) {
    return true;
  }
  return pattern.patterns?.some((child) => patternMatches(child, source)) === true;
}

function expectRepositoryMatch(name: string, ...sources: string[]): void {
  const pattern = grammar.repository?.[name];
  expect(pattern, `missing Glimmer grammar repository ${name}`).toBeDefined();
  for (const source of sources) {
    expect(patternMatches(pattern!, source), `${name} did not match: ${source}`).toBe(true);
  }
}

describe('Glimmer language contracts', () => {
  it('registers .glim with its grammar and language configuration', () => {
    const language = packageJson.contributes.languages.find((entry) => entry.id === 'glim');
    expect(language?.extensions).toContain('.glim');
    expect(language?.configuration).toBe('./language-configuration/glim.json');
    expect(packageJson.contributes.configurationDefaults['files.associations']['*.glim']).toBe(
      'glim'
    );
    expect(packageJson.contributes.grammars).toContainEqual({
      language: 'glim',
      scopeName: 'source.glim',
      path: './syntaxes/glim.tmLanguage.json',
    });
    expect(grammar.scopeName).toBe('source.glim');
    expect(grammar.fileTypes).toContain('glim');
    expect(packageJson.activationEvents).toContain('onLanguage:glim');
  });

  it('covers every implemented top-level Glimmer 0.5 declaration family', () => {
    expectRepositoryMatch(
      'program-declaration',
      'program Game',
      'platform tec1g-mon3',
      'display tms9918'
    );
    expectRepositoryMatch('file-declaration', 'part "rules.glim"', 'import "video.asm"');
    expectRepositoryMatch(
      'state-declaration',
      'state Score : word = 0 changed',
      'state Board : byte[8] changed',
      'pulse Move'
    );
    expectRepositoryMatch(
      'timing-declaration',
      'timer Blink : byte = 12 -> Tick',
      'timer Gate : word = 0 -> Open once',
      'ramp Travel : byte steps 64 -> Arrived'
    );
    expectRepositoryMatch(
      'bind-declaration',
      'bind key KEY_2 rising -> Up',
      'bind key KEY_6 held period 8 -> Right',
      'bind key any rising -> Start'
    );
    expectRepositoryMatch('card', 'card Playing');
    expectRepositoryMatch(
      'block-declaration',
      'compute Speed',
      'effect Move',
      'render Draw',
      'enter Setup',
      'routine ClampX'
    );
    expectRepositoryMatch('type-declaration', 'type Point', 'type Points = Point[8]');
    expectRepositoryMatch(
      'resource-declaration',
      'text Paused "PAUSED"',
      'sound Beep len 24 div 3',
      'curve Ease ease_out steps 64 from 0 to 7',
      'shape Piece color cyan',
      'sprite Player color white',
      'tile Wall color white on black',
      'rot3 = rot1'
    );
  });

  it('covers block headers, type fields, pixel rows, comments, and numeric forms', () => {
    expectRepositoryMatch(
      'header-clause',
      'on Score, Lives',
      'updates Score',
      'goto Playing',
      'position : Point[8]'
    );
    expectRepositoryMatch('shape-row', '"..XX...."');
    expectRepositoryMatch('comment', '; frame state');
    expectRepositoryMatch('end-keyword', 'end ; block');
    expectRepositoryMatch('number', '$40', '0x40', '%01000000', '64');
  });

  it('embeds the AZM grammar only inside parser-compatible begin/end bodies', () => {
    const body = grammar.repository?.body;
    expect(body?.begin).toBe('^\\s*(begin)\\s*(?=;|$)');
    expect(body?.end).toBe('^\\s*(end)\\s*$');
    expect(regex(body!.begin!).test('begin ; AZM body')).toBe(true);
    expect(regex(body!.end!).test('end')).toBe(true);
    expect(regex(body!.end!).test('end ; not accepted by the Glimmer parser')).toBe(false);
    expect(body?.patterns).toContainEqual({ include: 'source.z80.asm' });
  });

  it('assigns distinct colors to Glimmer structure, names, reactive cells, and operators', () => {
    const structure = tokenColor('storage.type.block.glim');
    const blockName = tokenColor('entity.name.function.block.glim');
    const cell = tokenColor('variable.other.cell.glim');
    const operator = tokenColor('keyword.operator.fires.glim');

    expect(structure).toBeDefined();
    expect(blockName).toBeDefined();
    expect(cell).toBeDefined();
    expect(operator).toBeDefined();
    expect(new Set([structure, blockName, cell, operator]).size).toBe(4);
  });
});
