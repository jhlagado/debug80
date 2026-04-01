/**
 * @file Regression test: package.json language/breakpoint contracts.
 *
 * Validates that:
 * 1. The ASM_LANGUAGE_ID used in extension.ts is contributed as a language.
 * 2. Every contributed language has a breakpoint entry.
 * 3. .asm files are associated with the contributed language.
 * 4. The debugger languages list includes every breakpoint language.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PKG_PATH = path.resolve(__dirname, '../../package.json');
const EXT_PATH = path.resolve(__dirname, '../../src/extension/extension.ts');

interface PackageJson {
  contributes: {
    configurationDefaults: {
      'files.associations': Record<string, string>;
    };
    languages: Array<{ id: string; extensions?: string[] }>;
    breakpoints: Array<{ language: string }>;
    debuggers: Array<{ type: string; languages: string[] }>;
  };
}

function loadPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')) as PackageJson;
}

function extractAsmLanguageId(): string {
  const src = fs.readFileSync(EXT_PATH, 'utf8');
  const match = src.match(/const ASM_LANGUAGE_ID\s*=\s*'([^']+)'/);
  if (match === null || match[1] === undefined) {
    throw new Error('Could not find ASM_LANGUAGE_ID in extension.ts');
  }
  return match[1];
}

function extractZaxLanguageId(): string {
  const src = fs.readFileSync(EXT_PATH, 'utf8');
  const match = src.match(/const ZAX_LANGUAGE_ID\s*=\s*'([^']+)'/);
  if (match === null || match[1] === undefined) {
    throw new Error('Could not find ZAX_LANGUAGE_ID in extension.ts');
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

  it('.asm files are associated with ASM_LANGUAGE_ID', () => {
    const assoc = contributes.configurationDefaults['files.associations'];
    expect(assoc['*.asm']).toBe(asmLanguageId);
  });

  it('contributed language claims .asm extension', () => {
    const lang = contributes.languages.find((l) => l.id === asmLanguageId);
    expect(lang).toBeDefined();
    expect(lang!.extensions).toContain('.asm');
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
