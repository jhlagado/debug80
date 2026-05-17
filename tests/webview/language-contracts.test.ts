/**
 * @file Regression test: package.json language/breakpoint contracts.
 *
 * Validates that:
 * 1. The language IDs used in the extension language-association module are contributed.
 * 2. Every contributed language has a breakpoint entry.
 * 3. ASM-family files are associated with the contributed language.
 * 4. The debugger languages list includes every breakpoint language.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PKG_PATH = path.resolve(__dirname, '../../package.json');
const LANGUAGE_ASSOCIATION_PATH = path.resolve(
  __dirname,
  '../../src/extension/language-association.ts'
);
const Z80_ASM_GRAMMAR_PATH = path.resolve(__dirname, '../../syntaxes/z80-asm.tmLanguage.json');

interface PackageJson {
  contributes: {
    configurationDefaults: {
      'files.associations': Record<string, string>;
    };
    languages: Array<{ id: string; extensions?: string[] }>;
    grammars: Array<{ language: string; scopeName: string; path: string }>;
    breakpoints: Array<{ language: string }>;
    debuggers: Array<{ type: string; languages: string[] }>;
  };
}

function loadPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')) as PackageJson;
}

function loadZ80AsmGrammar(): unknown {
  return JSON.parse(fs.readFileSync(Z80_ASM_GRAMMAR_PATH, 'utf8'));
}

function extractAsmLanguageId(): string {
  const src = fs.readFileSync(LANGUAGE_ASSOCIATION_PATH, 'utf8');
  const match = src.match(/const ASM_LANGUAGE_ID\s*=\s*'([^']+)'/);
  if (match === null || match[1] === undefined) {
    throw new Error('Could not find ASM_LANGUAGE_ID in language-association.ts');
  }
  return match[1];
}

function extractZaxLanguageId(): string {
  const src = fs.readFileSync(LANGUAGE_ASSOCIATION_PATH, 'utf8');
  const match = src.match(/const ZAX_LANGUAGE_ID\s*=\s*'([^']+)'/);
  if (match === null || match[1] === undefined) {
    throw new Error('Could not find ZAX_LANGUAGE_ID in language-association.ts');
  }
  return match[1];
}

describe('package.json language contracts', () => {
  const pkg = loadPackageJson();
  const contributes = pkg.contributes;
  const asmLanguageId = extractAsmLanguageId();
  const zaxLanguageId = extractZaxLanguageId();

  it('ASM_LANGUAGE_ID is a contributed language', () => {
    const ids = contributes.languages.map((l) => l.id);
    expect(ids).toContain(asmLanguageId);
  });

  it('ASM_LANGUAGE_ID has a breakpoint entry', () => {
    const bpLangs = contributes.breakpoints.map((b) => b.language);
    expect(bpLangs).toContain(asmLanguageId);
  });

  it('ASM-family files are associated with ASM_LANGUAGE_ID', () => {
    const assoc = contributes.configurationDefaults['files.associations'];
    for (const extension of ['asm', 'z80', 'a80', 's']) {
      expect(assoc[`*.${extension}`]).toBe(asmLanguageId);
    }
  });

  it('contributed language claims ASM-family extensions', () => {
    const lang = contributes.languages.find((l) => l.id === asmLanguageId);
    expect(lang).toBeDefined();
    for (const extension of ['.asm', '.z80', '.a80', '.s']) {
      expect(lang!.extensions).toContain(extension);
    }
  });

  it('ASM_LANGUAGE_ID has a TextMate grammar contribution', () => {
    const grammar = contributes.grammars.find((g) => g.language === asmLanguageId);
    expect(grammar).toBeDefined();
    expect(grammar!.scopeName).toBe('source.z80.asm');
    expect(grammar!.path).toBe('./syntaxes/z80-asm.tmLanguage.json');
    expect(fs.existsSync(path.resolve(__dirname, '../..', grammar!.path))).toBe(true);
  });

  it('Z80 assembly grammar highlights routine comment headers', () => {
    const serializedGrammar = JSON.stringify(loadZ80AsmGrammar());
    expect(serializedGrammar).toContain('#routine-comments');
    expect(serializedGrammar).toContain('@(?:routine|proc|extern)');
    expect(serializedGrammar).toContain('Inputs?|Outputs?');
    expect(serializedGrammar).toContain('storage.type.comment-header.z80-asm');
  });

  it('Z80 assembly grammar includes AZM-derived punctuation and condition scopes', () => {
    const serializedGrammar = JSON.stringify(loadZ80AsmGrammar());
    expect(serializedGrammar).toContain('#condition-instructions');
    expect(serializedGrammar).toContain('constant.language.current-location.z80-asm');
    expect(serializedGrammar).toContain('punctuation.section.parens.z80-asm');
    expect(serializedGrammar).toContain('punctuation.separator.comma.z80-asm');
    expect(serializedGrammar).toContain('SLI');
    expect(serializedGrammar).toContain('\\\\.[A-Za-z_.$?@]');
  });

  it('ZAX_LANGUAGE_ID is a contributed language', () => {
    const ids = contributes.languages.map((l) => l.id);
    expect(ids).toContain(zaxLanguageId);
  });

  it('.zax files are associated with ZAX_LANGUAGE_ID', () => {
    const assoc = contributes.configurationDefaults['files.associations'];
    expect(assoc['*.zax']).toBe(zaxLanguageId);
  });

  it('contributed language claims .zax extension', () => {
    const lang = contributes.languages.find((l) => l.id === zaxLanguageId);
    expect(lang).toBeDefined();
    expect(lang!.extensions).toContain('.zax');
  });

  it('every contributed language has a breakpoint entry', () => {
    const bpLangs = new Set(contributes.breakpoints.map((b) => b.language));
    for (const lang of contributes.languages) {
      expect(bpLangs.has(lang.id), `missing breakpoint for language "${lang.id}"`).toBe(true);
    }
  });

  it('z80 debugger languages include all breakpoint languages', () => {
    const z80Debugger = contributes.debuggers.find((d) => d.type === 'z80');
    expect(z80Debugger).toBeDefined();
    const debuggerLangs = new Set(z80Debugger!.languages);
    for (const bp of contributes.breakpoints) {
      expect(
        debuggerLangs.has(bp.language),
        `breakpoint language "${bp.language}" not in debugger languages`
      ).toBe(true);
    }
  });
});
