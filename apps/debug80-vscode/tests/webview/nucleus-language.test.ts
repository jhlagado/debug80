import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const grammar = JSON.parse(
  fs.readFileSync(path.join(root, 'syntaxes', 'nucleus.tmLanguage.json'), 'utf8')
) as {
  fileTypes?: string[];
  repository?: Record<string, { patterns?: Array<{ match?: string }> }>;
  scopeName?: string;
};
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  activationEvents?: string[];
  contributes: {
    configurationDefaults: { 'files.associations': Record<string, string> };
    grammars: Array<{ language: string; path: string; scopeName: string }>;
    languages: Array<{ configuration: string; extensions: string[]; id: string }>;
  };
};

describe('Nucleus language contracts', () => {
  it('registers .nu with its grammar and language configuration', () => {
    const language = packageJson.contributes.languages.find((entry) => entry.id === 'nucleus');
    expect(language).toMatchObject({
      extensions: ['.nu'],
      configuration: './language-configuration/nucleus.json',
    });
    expect(packageJson.contributes.configurationDefaults['files.associations']['*.nu']).toBe(
      'nucleus'
    );
    expect(packageJson.contributes.grammars).toContainEqual({
      language: 'nucleus',
      scopeName: 'source.nucleus',
      path: './syntaxes/nucleus.tmLanguage.json',
    });
    expect(grammar.scopeName).toBe('source.nucleus');
    expect(grammar.fileTypes).toEqual(['nu']);
    expect(packageJson.activationEvents).toContain('onLanguage:nucleus');
  });

  it('highlights the established failure model and predefined services', () => {
    const keyword = grammar.repository?.keywords?.patterns?.[0]?.match ?? '';
    const service = grammar.repository?.services?.patterns?.[0]?.match ?? '';
    expect(new RegExp(keyword).test('handle')).toBe(true);
    expect(new RegExp(keyword).test('fails')).toBe(true);
    expect(new RegExp(service).test('writeOutputByte')).toBe(true);
  });
});
