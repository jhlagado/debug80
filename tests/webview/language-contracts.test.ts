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
const Z80_LST_GRAMMAR_PATH = path.resolve(__dirname, '../../syntaxes/z80-lst.tmLanguage.json');

interface PackageJson {
  contributes: {
    configurationDefaults: {
      'files.associations': Record<string, string>;
      'editor.tokenColorCustomizations'?: {
        textMateRules?: Array<{
          scope?: string | string[];
          settings?: {
            foreground?: string;
          };
        }>;
      };
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

function loadZ80LstGrammar(): unknown {
  return JSON.parse(fs.readFileSync(Z80_LST_GRAMMAR_PATH, 'utf8'));
}

function getGrammarPattern(repositoryName: string, scopeName: string): { match: string } {
  const grammar = loadZ80AsmGrammar() as {
    repository?: Record<string, { patterns?: Array<{ name?: string; match?: string }> }>;
  };
  const pattern = grammar.repository?.[repositoryName]?.patterns?.find((candidate) => {
    return candidate.name === scopeName && candidate.match !== undefined;
  });
  if (pattern?.match === undefined) {
    throw new Error(`Could not find grammar pattern ${repositoryName}/${scopeName}`);
  }
  return { match: pattern.match };
}

function getGrammarPatternContaining(repositoryName: string, text: string): { match: string } {
  const grammar = loadZ80AsmGrammar() as {
    repository?: Record<string, { patterns?: Array<{ match?: string }> }>;
  };
  const pattern = grammar.repository?.[repositoryName]?.patterns?.find((candidate) => {
    return candidate.match?.includes(text) === true;
  });
  if (pattern?.match === undefined) {
    throw new Error(`Could not find grammar pattern ${repositoryName} containing ${text}`);
  }
  return { match: pattern.match };
}

function getFirstMatchingGrammarScope(repositoryName: string, source: string): string {
  const grammar = loadZ80AsmGrammar() as {
    repository?: Record<string, { patterns?: Array<{ name?: string; match?: string }> }>;
  };
  for (const pattern of grammar.repository?.[repositoryName]?.patterns ?? []) {
    if (pattern.name === undefined || pattern.match === undefined) {
      continue;
    }
    if (toJavaScriptRegex(pattern.match).test(source)) {
      return pattern.name;
    }
  }
  throw new Error(`No grammar pattern in ${repositoryName} matched ${source}`);
}

function getFirstGrammarCaptureScope(
  repositoryName: string,
  source: string,
  expectedText: string
): string {
  const grammar = loadZ80AsmGrammar() as {
    repository?: Record<
      string,
      {
        patterns?: Array<{
          captures?: Record<string, { name?: string }>;
          match?: string;
          name?: string;
        }>;
      }
    >;
  };
  for (const pattern of grammar.repository?.[repositoryName]?.patterns ?? []) {
    if (pattern.match === undefined) {
      continue;
    }
    const match = toJavaScriptRegex(pattern.match).exec(source);
    if (match === null) {
      continue;
    }
    for (const [captureIndex, capture] of Object.entries(pattern.captures ?? {})) {
      if (capture.name === undefined) {
        continue;
      }
      if (match[Number(captureIndex)] === expectedText) {
        return capture.name;
      }
    }
    if (pattern.name !== undefined && match[0] === expectedText) {
      return pattern.name;
    }
  }
  throw new Error(`No grammar capture matched ${expectedText} in ${source}`);
}

function getFirstMatchingListingScope(source: string): string {
  for (const pattern of getListingSourcePatterns()) {
    if (pattern.name === undefined || pattern.match === undefined) {
      continue;
    }
    if (toJavaScriptRegex(pattern.match).test(source)) {
      return pattern.name;
    }
  }
  throw new Error(`No listing grammar pattern matched ${source}`);
}

function getFirstListingCaptureScope(source: string, expectedText: string): string {
  const listingSource = extractListingSource(source);
  const sourceToCheck = (listingSource ?? source).split(';')[0] ?? '';
  for (const pattern of getListingSourcePatterns()) {
    if (pattern.match === undefined) {
      continue;
    }
    const match = toJavaScriptRegex(pattern.match).exec(sourceToCheck);
    if (match === null) {
      continue;
    }
    for (const [captureIndex, capture] of Object.entries(pattern.captures ?? {})) {
      if (capture.name === undefined) {
        continue;
      }
      if (match[Number(captureIndex)] === expectedText) {
        return capture.name;
      }
    }
    if (pattern.name !== undefined && match[0] === expectedText) {
      return pattern.name;
    }
  }
  throw new Error(`No listing grammar capture matched ${expectedText} in ${source}`);
}

function tryGetFirstListingCaptureScope(source: string, expectedText: string): string | null {
  try {
    return getFirstListingCaptureScope(source, expectedText);
  } catch {
    return null;
  }
}

function tryGetNamedListingCaptureText(source: string, expectedScope: string): string | null {
  const listingSource = extractListingSource(source);
  const sourceToCheck = (listingSource ?? source).split(';')[0] ?? '';
  for (const pattern of getListingSourcePatterns()) {
    if (pattern.match === undefined) {
      continue;
    }
    const match = toJavaScriptRegex(pattern.match).exec(sourceToCheck);
    if (match === null) {
      continue;
    }
    for (const [captureIndex, capture] of Object.entries(pattern.captures ?? {})) {
      if (capture.name === expectedScope && match[Number(captureIndex)] !== undefined) {
        return match[Number(captureIndex)] ?? null;
      }
    }
  }
  return null;
}

function extractListingSource(line: string): string | null {
  const grammar = loadZ80LstGrammar() as {
    repository?: Record<string, { begin?: string }>;
  };
  const begin = grammar.repository?.['listing-row']?.begin;
  if (begin === undefined) {
    throw new Error('Missing listing-row begin pattern');
  }
  const match = toJavaScriptRegex(begin).exec(line);
  if (match === null) {
    return null;
  }
  return line.slice(match[0].length);
}

function getListingPrefixCaptureScope(line: string, expectedText: string): string {
  const grammar = loadZ80LstGrammar() as {
    repository?: Record<
      string,
      {
        begin?: string;
        beginCaptures?: Record<
          string,
          {
            patterns?: Array<{
              match?: string;
              name?: string;
            }>;
          }
        >;
      }
    >;
  };
  const listingRow = grammar.repository?.['listing-row'];
  const begin = listingRow?.begin;
  if (begin === undefined) {
    throw new Error('Missing listing-row begin pattern');
  }
  const rowMatch = toJavaScriptRegex(begin).exec(line);
  if (rowMatch === null) {
    throw new Error(`No listing row matched ${line}`);
  }
  const prefix = rowMatch[0];
  for (const capture of Object.values(listingRow.beginCaptures ?? {})) {
    for (const pattern of capture.patterns ?? []) {
      if (pattern.name === undefined || pattern.match === undefined) {
        continue;
      }
      const regex = toJavaScriptRegex(pattern.match);
      const matches = prefix.matchAll(new RegExp(regex.source, `${regex.flags}g`));
      for (const match of matches) {
        if (match[0] === expectedText) {
          return pattern.name;
        }
      }
    }
  }
  throw new Error(`No listing prefix capture matched ${expectedText} in ${line}`);
}

function getListingSourcePatterns(): Array<{
  captures?: Record<string, { name?: string }>;
  match?: string;
  name?: string;
}> {
  const grammar = loadZ80LstGrammar() as {
    repository?: Record<
      string,
      {
        patterns?: Array<{
          include?: string;
          captures?: Record<string, { name?: string }>;
          match?: string;
          name?: string;
        }>;
      }
    >;
  };
  const patterns: Array<{
    captures?: Record<string, { name?: string }>;
    match?: string;
    name?: string;
  }> = [];
  for (const entry of grammar.repository?.['listing-row']?.patterns ?? []) {
    if (entry.include?.startsWith('#') === true) {
      patterns.push(...(grammar.repository?.[entry.include.slice(1)]?.patterns ?? []));
    } else {
      patterns.push(entry);
    }
  }
  return patterns;
}

function findTokenColorRule(scope: string): {
  scope?: string | string[];
  settings?: {
    foreground?: string;
  };
} {
  const rules =
    loadPackageJson().contributes.configurationDefaults['editor.tokenColorCustomizations']
      ?.textMateRules ?? [];
  const rule = rules.find((candidate) => {
    if (Array.isArray(candidate.scope)) {
      return candidate.scope.includes(scope);
    }
    return candidate.scope === scope;
  });
  if (rule === undefined) {
    throw new Error(`Could not find token color rule for ${scope}`);
  }
  return rule;
}

function findTokenColor(scope: string): string {
  const foreground = findTokenColorRule(scope).settings?.foreground;
  if (foreground === undefined) {
    throw new Error(`Could not find foreground for ${scope}`);
  }
  return foreground;
}

function toJavaScriptRegex(textMatePattern: string): RegExp {
  if (textMatePattern.startsWith('(?i)')) {
    return new RegExp(textMatePattern.slice(4), 'i');
  }
  return new RegExp(textMatePattern);
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

  it('Z80 assembly grammar treats bang comments as documentation comments', () => {
    const grammar = loadZ80AsmGrammar() as {
      repository?: Record<
        string,
        {
          patterns?: Array<{
            begin?: string;
            name?: string;
            patterns?: Array<{ include?: string }>;
          }>;
        }
      >;
    };
    const docComment = grammar.repository?.comments?.patterns?.find(
      (pattern) => pattern.begin === ';!'
    );

    expect(docComment?.name).toBe('comment.line.documentation.z80-asm');
    expect(docComment?.patterns).toContainEqual({ include: '#routine-comments' });
  });

  it('contributes green token colors for Debug80 assembly comments', () => {
    const commentRule = findTokenColorRule('comment.line.semicolon.z80-asm');

    expect(commentRule.scope).toContain('punctuation.definition.comment.z80-asm');
    expect(commentRule.scope).toContain('comment.line.semicolon.z80-lst');
    expect(commentRule.settings?.foreground).toBe('#6A9955');

    const nestedCommentScopes = [
      'comment.line.semicolon.z80-asm storage.type.annotation.z80-asm',
      'comment.line.semicolon.z80-asm storage.type.comment-header.z80-asm',
      'comment.line.semicolon.z80-asm entity.name.function.z80-asm',
      'comment.line.semicolon.z80-asm meta.annotation.parameters.z80-asm',
      'comment.line.semicolon.z80-asm variable.language.register.z80-asm',
      'comment.line.semicolon.z80-asm variable.language.flag.z80-asm',
      'comment.line.semicolon.z80-asm punctuation.separator.key-value.z80-asm',
      'comment.line.semicolon.z80-asm meta.comment.separator.z80-asm',
    ];
    for (const scope of nestedCommentScopes) {
      expect(findTokenColor(scope)).toBe('#6A9955');
    }

    const documentationCommentScopes = [
      'comment.line.documentation.z80-asm',
      'comment.line.documentation.z80-asm punctuation.definition.comment.z80-asm',
      'comment.line.documentation.z80-asm storage.type.annotation.z80-asm',
      'comment.line.documentation.z80-asm storage.type.comment-header.z80-asm',
      'comment.line.documentation.z80-asm entity.name.function.z80-asm',
      'comment.line.documentation.z80-asm meta.annotation.parameters.z80-asm',
      'comment.line.documentation.z80-asm variable.language.register.z80-asm',
      'comment.line.documentation.z80-asm variable.language.flag.z80-asm',
      'comment.line.documentation.z80-asm punctuation.separator.key-value.z80-asm',
      'comment.line.documentation.z80-asm meta.comment.separator.z80-asm',
    ];
    for (const scope of documentationCommentScopes) {
      expect(findTokenColor(scope)).toBe('#8ED97C');
    }
  });

  it('contributes a balanced token color palette for Z80 assembly scopes', () => {
    const labelRule = findTokenColorRule('entity.name.label.z80-asm');
    const symbolRule = findTokenColorRule('variable.other.symbol.z80-asm');
    const equConstantRule = findTokenColorRule('entity.name.constant.equ.z80-asm');
    const directiveRule = findTokenColorRule('keyword.control.directive.z80-asm');
    const annotationRule = findTokenColorRule('storage.type.annotation.z80-asm');
    const instructionRule = findTokenColorRule('keyword.instruction.z80-asm');
    const registerRule = findTokenColorRule('variable.language.register.z80-asm');
    const conditionRule = findTokenColorRule('variable.language.condition.z80-asm');
    const stringRule = findTokenColorRule('string.quoted.double.z80-asm');
    const functionRule = findTokenColorRule('entity.name.function.z80-asm');
    const operatorRule = findTokenColorRule('keyword.operator.z80-asm');
    const constantRule = findTokenColorRule('constant.numeric.hex.z80-asm');

    expect(labelRule.scope).toContain('entity.name.label.local.z80-asm');
    expect(labelRule.scope).toContain('entity.name.label.z80-lst');
    expect(labelRule.settings?.foreground).toBe('#B77DFF');
    expect(symbolRule.scope).toContain('variable.other.symbol.z80-lst');
    expect(symbolRule.settings?.foreground).toBe('#FF4D6D');
    expect(equConstantRule.scope).toContain('entity.name.constant.equ.z80-lst');
    expect(equConstantRule.settings?.foreground).toBe('#4DA3FF');
    expect(directiveRule.scope).toContain('keyword.control.directive.z80-lst');
    expect(directiveRule.settings?.foreground).toBe('#FF66C4');
    expect(annotationRule.scope).toContain('storage.type.comment-header.z80-asm');
    expect(annotationRule.settings?.foreground).toBe('#00D1A7');
    expect(instructionRule.scope).toContain('keyword.instruction.z80-lst');
    expect(instructionRule.settings?.foreground).toBe('#FF9D00');
    expect(registerRule.scope).toContain('variable.language.register.z80-lst');
    expect(registerRule.settings?.foreground).toBe('#00C2FF');
    expect(conditionRule.scope).toContain('variable.language.flag.z80-asm');
    expect(conditionRule.settings?.foreground).toBe('#3B82F6');
    expect(stringRule.scope).toContain('string.quoted.single.z80-asm');
    expect(stringRule.scope).toContain('string.quoted.double.z80-lst');
    expect(stringRule.settings?.foreground).toBe('#A3E635');
    expect(functionRule.settings?.foreground).toBe('#FDE047');
    expect(operatorRule.scope).toContain('punctuation.section.parens.z80-asm');
    expect(operatorRule.scope).toContain('punctuation.section.parens.z80-lst');
    expect(operatorRule.settings?.foreground).toBe('#A0AEC0');
    expect(constantRule.scope).toContain('constant.numeric.binary.z80-asm');
    expect(constantRule.scope).toContain('constant.numeric.decimal.z80-asm');
    expect(constantRule.scope).toContain('constant.language.current-location.z80-asm');
    expect(constantRule.scope).toContain('constant.numeric.address.z80-lst');
    expect(constantRule.scope).toContain('constant.numeric.hex.z80-lst');
    expect(constantRule.scope).toContain('constant.numeric.binary.z80-lst');
    expect(constantRule.scope).toContain('constant.numeric.decimal.z80-lst');
    expect(constantRule.scope).toContain('constant.language.current-location.z80-lst');
    expect(constantRule.scope).toContain('constant.numeric.hexbyte.z80-lst');
    expect(constantRule.settings?.foreground).toBe('#FFD166');
  });

  it('keeps primary token families on unique foreground colors', () => {
    const primaryScopes = [
      'comment.line.semicolon.z80-asm',
      'entity.name.label.z80-asm',
      'variable.other.symbol.z80-asm',
      'entity.name.constant.equ.z80-asm',
      'keyword.control.directive.z80-asm',
      'storage.type.annotation.z80-asm',
      'keyword.instruction.z80-asm',
      'variable.language.register.z80-asm',
      'variable.language.condition.z80-asm',
      'constant.numeric.hex.z80-asm',
    ];
    const colors = primaryScopes.map(findTokenColor);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('Z80 listing grammar classifies non-byte directives distinctly from opcodes', () => {
    expect(getFirstListingCaptureScope('C7DE   C0 08                  DW   DATA_FROM', 'DW')).toBe(
      'keyword.control.directive.z80-lst'
    );
    expect(
      getFirstListingCaptureScope('FFEC                          .ORG   BASE_ADDR', '.ORG')
    ).toBe('keyword.control.directive.z80-lst');
    expect(getFirstListingCaptureScope('10000                         .END', '.END')).toBe(
      'keyword.control.directive.z80-lst'
    );
    expect(getFirstMatchingListingScope('SET')).toBe('keyword.instruction.z80-lst');
  });

  it('Z80 listing grammar keeps branch conditions and register operands distinct', () => {
    expect(getFirstListingCaptureScope('1000   38 01        JR   C,DONE', 'C')).toBe(
      'variable.language.condition.z80-lst'
    );
    expect(getFirstMatchingListingScope('C')).toBe('variable.language.register.z80-lst');
    expect(getFirstMatchingListingScope('af')).toBe('variable.language.register.z80-lst');
    expect(getFirstMatchingListingScope('bc')).toBe('variable.language.register.z80-lst');
  });

  it('Z80 listing grammar gives punctuation neutral operator scopes', () => {
    expect(getFirstMatchingListingScope(',')).toBe('punctuation.separator.comma.z80-lst');
    expect(getFirstMatchingListingScope('(')).toBe('punctuation.section.parens.z80-lst');
    expect(getFirstMatchingListingScope(')')).toBe('punctuation.section.parens.z80-lst');
  });

  it('Z80 listing grammar keeps object-code byte columns as constants', () => {
    expect(
      tryGetNamedListingCaptureText(
        '0001   DB 02        IN   A,(TERM_STATUS)',
        'keyword.control.directive.z80-lst'
      )
    ).toBe(null);
    expect(extractListingSource('0001   DB 02        IN   A,(TERM_STATUS)')).toContain(
      'IN   A,(TERM_STATUS)'
    );
    expect(extractListingSource('C7B4   DM                     DM   2')).toBe('DM   2');
    expect(extractListingSource('C7B4   DS                     DS   2')).toBe('DS   2');
    expect(extractListingSource('C7B4   DW                     DW   DATA')).toBe('DW   DATA');
    expect(extractListingSource('0000   DB')).toBe('');
    expect(
      extractListingSource('FF48   A7 C7 C6 4B C6 C3 SEGDISP:   DB   0A7H,0C7H,0C6H,4BH,0C6H,0C3H')
    ).toContain('SEGDISP:   DB');
    expect(
      extractListingSource(
        'FF87   48 3A 4D 3A 53 20 50 4D 3A 30 2D 33 2C 20 50 52 41 4D 3A 38 00 HELPLIST:   DB   "H:M:S PM:0-3, PRAM:8",0'
      )
    ).toContain('HELPLIST:   DB');
    expect(extractListingSource('FF48                RTC_PORT:   EQU   0FCH')).toBe(
      'RTC_PORT:   EQU   0FCH'
    );
    expect(extractListingSource('10000               REL_TXT:   EQU   "2025.16"')).toBe(
      'REL_TXT:   EQU   "2025.16"'
    );
    expect(extractListingSource('FF55   54 75 65 73 64 61 79 00 DB   "Tuesday",0')).toBe(
      'DB   "Tuesday",0'
    );
    expect(getListingPrefixCaptureScope('C7B4   DM                     DM   2', 'DM')).toBe(
      'constant.numeric.hexbyte.z80-lst'
    );
    expect(getFirstListingCaptureScope('C7B4   02                     DB   2', 'DB')).toBe(
      'keyword.control.directive.z80-lst'
    );
    expect(getFirstListingCaptureScope('C7B4                          DB   2', 'DB')).toBe(
      'keyword.control.directive.z80-lst'
    );
    expect(getFirstListingCaptureScope('C7B4                          DB', 'DB')).toBe(
      'keyword.control.directive.z80-lst'
    );
    expect(getFirstListingCaptureScope('C7B4                          DW', 'DW')).toBe(
      'keyword.control.directive.z80-lst'
    );
    expect(
      getFirstListingCaptureScope(
        'F011   53 74 61 72 74 20 41 64 64 72 65 73 73 3A 00 DB   "Start Address:",0',
        'DB'
      )
    ).toBe('keyword.control.directive.z80-lst');
  });

  it('Z80 listing grammar classifies source operands as numeric constants', () => {
    expect(getFirstMatchingListingScope('$0000')).toBe('constant.numeric.hex.z80-lst');
    expect(getFirstMatchingListingScope('4000H')).toBe('constant.numeric.hex.z80-lst');
    expect(getFirstMatchingListingScope('%1010')).toBe('constant.numeric.binary.z80-lst');
    expect(getFirstMatchingListingScope('123')).toBe('constant.numeric.decimal.z80-lst');
  });

  it('Z80 assembly grammar includes AZM-derived punctuation and condition scopes', () => {
    const serializedGrammar = JSON.stringify(loadZ80AsmGrammar());
    const serializedListingGrammar = JSON.stringify(loadZ80LstGrammar());
    expect(serializedGrammar).toContain('#condition-instructions');
    expect(serializedGrammar).toContain('constant.language.current-location.z80-asm');
    expect(serializedGrammar).toContain('punctuation.section.parens.z80-asm');
    expect(serializedGrammar).toContain('punctuation.separator.comma.z80-asm');
    expect(serializedGrammar).toContain('SLI');
    expect(serializedGrammar).toContain('\\\\.[A-Za-z_.$?@]');
    expect(serializedListingGrammar).toContain('keyword.control.directive.z80-lst');
    expect(serializedListingGrammar).toContain('SLI');
  });

  it('Z80 assembly grammar condition instruction regex captures mnemonic and condition', () => {
    const conditionPattern = getGrammarPatternContaining(
      'condition-instructions',
      'CALL|JP|JR|RET'
    );
    const regex = toJavaScriptRegex(conditionPattern.match);
    const match = regex.exec('JR NZ,label');
    expect(match?.[1]).toBe('JR');
    expect(match?.[2]).toBe('NZ');
  });

  it('Z80 assembly grammar current-location regex does not match dollar labels', () => {
    const currentLocationPattern = getGrammarPattern(
      'numbers',
      'constant.language.current-location.z80-asm'
    );
    const regex = toJavaScriptRegex(currentLocationPattern.match);
    expect(regex.test('$ + 2')).toBe(true);
    expect(regex.test('$SCREEN')).toBe(false);
    expect(regex.test('$label')).toBe(false);
  });

  it('Z80 assembly grammar classifies dotted local labels before global labels', () => {
    expect(getFirstMatchingGrammarScope('labels', '.loop:')).toBe(
      'entity.name.label.local.z80-asm'
    );
  });

  it('Z80 assembly grammar classifies symbol references separately from constants', () => {
    expect(getFirstMatchingGrammarScope('symbols', 'PACMO_SPLASH_ACTIVE')).toBe(
      'variable.other.symbol.z80-asm'
    );
    expect(
      getFirstGrammarCaptureScope(
        'equ-constants',
        'PACMO_SPLASH_ACTIVE EQU 1',
        'PACMO_SPLASH_ACTIVE'
      )
    ).toBe('entity.name.constant.equ.z80-asm');
  });

  it('Z80 assembly examples keep definitions, references, and registers separate', () => {
    expect(getFirstMatchingGrammarScope('labels', 'POLL_INPUT_AND_UPDATE:')).toBe(
      'entity.name.label.z80-asm'
    );
    expect(getFirstMatchingGrammarScope('instructions', 'LD')).toBe('keyword.instruction.z80-asm');
    expect(getFirstMatchingGrammarScope('symbols', 'PACMO_SPLASH_ACTIVE')).toBe(
      'variable.other.symbol.z80-asm'
    );
    expect(getFirstMatchingGrammarScope('symbols', 'PACMO_PAUSED')).toBe(
      'variable.other.symbol.z80-asm'
    );
    expect(getFirstMatchingGrammarScope('registers', 'A')).toBe(
      'variable.language.register.z80-asm'
    );
  });

  it('Z80 assembly comment header annotations use annotation scopes', () => {
    expect(getFirstGrammarCaptureScope('routine-comments', '@clobbers AF, BC', '@clobbers')).toBe(
      'storage.type.annotation.z80-asm'
    );
  });

  it('Z80 listing grammar classifies symbol references separately from constants', () => {
    expect(getFirstListingCaptureScope('0003   C3 00 00     JP START', 'START')).toBe(
      'variable.other.symbol.z80-lst'
    );
    expect(
      getFirstListingCaptureScope('FF48                RTC_PORT:   EQU   0FCH', 'RTC_PORT')
    ).toBe('entity.name.constant.equ.z80-lst');
    expect(
      getFirstListingCaptureScope('0001   DB 02        IN   A,(TERM_STATUS)', 'TERM_STATUS')
    ).toBe('variable.other.symbol.z80-lst');
    expect(getFirstMatchingListingScope('A')).toBe('variable.language.register.z80-lst');
  });

  it('Z80 listing grammar does not color comment or footer prose as operands', () => {
    expect(
      tryGetFirstListingCaptureScope('0001   00           ; CALL SOMEWHERE', 'SOMEWHERE')
    ).toBe(null);
    expect(
      tryGetFirstListingCaptureScope(
        'Footer generated from source path /tmp/LD A,(TERM_STATUS)',
        'TERM_STATUS'
      )
    ).toBe(null);
    expect(
      tryGetFirstListingCaptureScope('START: 0000 DEFINED AT LINE 1 IN PACMO.ASM', 'PACMO.ASM')
    ).toBe(null);
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
