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
  dependencies?: Record<string, string>;
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
    commands: Array<{ command: string; title: string }>;
    views: Record<
      string,
      Array<{
        id: string;
        name?: string;
        type?: string;
        visibility?: string;
      }>
    >;
    menus: Record<string, Array<{ command: string; when?: string }>>;
  };
}

function loadPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')) as PackageJson;
}

function loadZ80AsmGrammar(): unknown {
  return JSON.parse(fs.readFileSync(Z80_ASM_GRAMMAR_PATH, 'utf8'));
}

function getAsmGrammarFileTypes(): string[] {
  const grammar = loadZ80AsmGrammar() as { fileTypes?: string[] };
  return grammar.fileTypes ?? [];
}

function getAsmGrammarTopLevelIncludes(): string[] {
  const grammar = loadZ80AsmGrammar() as { patterns?: Array<{ include?: string }> };
  return (
    grammar.patterns
      ?.map((pattern) => pattern.include)
      .filter((include) => include !== undefined) ?? []
  );
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

function getGrammarBeginEndPattern(
  repositoryName: string,
  scopeName: string
): {
  begin?: string;
  beginCaptures?: Record<string, { name?: string }>;
  end?: string;
  endCaptures?: Record<string, { name?: string }>;
  name?: string;
  patterns?: Array<{ include?: string; match?: string; name?: string }>;
} {
  const grammar = loadZ80AsmGrammar() as {
    repository?: Record<
      string,
      {
        patterns?: Array<{
          begin?: string;
          beginCaptures?: Record<string, { name?: string }>;
          end?: string;
          endCaptures?: Record<string, { name?: string }>;
          match?: string;
          name?: string;
          patterns?: Array<{ include?: string; match?: string; name?: string }>;
        }>;
      }
    >;
  };
  const pattern = grammar.repository?.[repositoryName]?.patterns?.find((candidate) => {
    return candidate.name === scopeName && candidate.begin !== undefined;
  });
  if (pattern === undefined) {
    throw new Error(`Could not find begin/end grammar pattern ${repositoryName}/${scopeName}`);
  }
  return pattern;
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

describe('package.json language contracts', () => {
  const pkg = loadPackageJson();
  const contributes = pkg.contributes;
  const asmLanguageId = extractAsmLanguageId();

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
    for (const extension of ['asm', 'z80', 'asmi']) {
      expect(assoc[`*.${extension}`]).toBe(asmLanguageId);
    }
    expect(assoc['*.a80']).toBeUndefined();
    expect(assoc['*.s']).toBeUndefined();
  });

  it('contributed language claims ASM-family extensions', () => {
    const lang = contributes.languages.find((l) => l.id === asmLanguageId);
    expect(lang).toBeDefined();
    for (const extension of ['.asm', '.z80', '.asmi']) {
      expect(lang!.extensions).toContain(extension);
    }
    expect(lang!.extensions).not.toContain('.a80');
    expect(lang!.extensions).not.toContain('.s');
  });

  it('launch schema exposes AZM as the only assembler backend', () => {
    const debuggerContribution = contributes.debuggers.find((debuggerEntry) => {
      return debuggerEntry.type === 'z80';
    });
    const assembler = debuggerContribution?.configurationAttributes?.launch?.properties?.assembler;

    expect(assembler?.default).toBe('azm');
    expect(assembler?.enum).toEqual(['azm']);
  });

  it('set-entry-source context menus cover AZM entry source extensions', () => {
    for (const menuId of ['explorer/context', 'editor/context', 'editor/title/context']) {
      const row = contributes.menus[menuId].find((entry) => {
        return entry.command === 'debug80.setEntrySource';
      });
      expect(row).toBeDefined();
      for (const extension of ['.asm', '.z80']) {
        expect(row!.when).toContain(`resourceExtname == ${extension}`);
      }
      expect(row!.when).not.toContain('resourceExtname == .a80');
      expect(row!.when).not.toContain('resourceExtname == .s');
      expect(row!.when).not.toContain('resourceExtname == .asmi');
    }
  });

  it('classifies every Debug80 command as visible, context-only, or internal', () => {
    const hidden = new Set(
      (contributes.menus.commandPalette ?? [])
        .filter((entry) => entry.when === 'false')
        .map((entry) => entry.command)
    );
    const visible = new Set([
      'debug80.createProject',
      'debug80.startDebug',
      'debug80.restartDebug',
      'debug80.selectWorkspaceFolder',
      'debug80.selectTarget',
      'debug80.configureProject',
      'debug80.openSourceFile',
      'debug80.openRomSource',
      'debug80.showSourceMapStatus',
      'debug80.searchWorkspaceSymbols',
      'debug80.openDebug80View',
      'debug80.materializeBundledRom',
      'debug80.sendHexViaCoolTerm',
      'debug80.testCoolTermConnection',
    ]);
    const contextOnly = new Set([
      'debug80.runToSelectedStackFrame',
      'debug80.setEntrySource',
      'debug80.openProjectConfigPanel',
    ]);
    const internal = new Set([
      'debug80.terminalInput',
      'debug80.openTerminal',
      'debug80.openTec1',
      'debug80.openTec1Memory',
    ]);

    const classified = new Set([...visible, ...contextOnly, ...internal]);
    const contributed = (contributes.commands ?? []).map((entry) => entry.command);
    expect(new Set(contributed)).toEqual(classified);

    for (const command of [...contextOnly, ...internal]) {
      expect(hidden.has(command)).toBe(true);
    }

    for (const command of visible) {
      expect(hidden.has(command)).toBe(false);
    }
  });

  it('ASM_LANGUAGE_ID has a TextMate grammar contribution', () => {
    const grammar = contributes.grammars.find((g) => g.language === asmLanguageId);
    expect(grammar).toBeDefined();
    expect(grammar!.scopeName).toBe('source.z80.asm');
    expect(grammar!.path).toBe('./syntaxes/z80-asm.tmLanguage.json');
    expect(fs.existsSync(path.resolve(__dirname, '../..', grammar!.path))).toBe(true);
  });

  it('contributes the Debug80 platform view visibly in the Debug container', () => {
    const debugViews = contributes.views.debug ?? [];
    const platformView = debugViews.find((view) => view.id === 'debug80.platformView');

    expect(platformView).toEqual(
      expect.objectContaining({
        type: 'webview',
        name: 'Debug80',
        visibility: 'visible',
      })
    );
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
    expect(labelRule.settings?.foreground).toBe('#B77DFF');
    expect(symbolRule.settings?.foreground).toBe('#FF4D6D');
    expect(equConstantRule.settings?.foreground).toBe('#4DA3FF');
    expect(directiveRule.settings?.foreground).toBe('#FF66C4');
    expect(annotationRule.scope).toContain('storage.type.comment-header.z80-asm');
    expect(annotationRule.settings?.foreground).toBe('#00D1A7');
    expect(instructionRule.settings?.foreground).toBe('#FF9D00');
    expect(registerRule.settings?.foreground).toBe('#00C2FF');
    expect(conditionRule.scope).toContain('variable.language.flag.z80-asm');
    expect(conditionRule.settings?.foreground).toBe('#3B82F6');
    expect(stringRule.scope).toContain('string.quoted.single.z80-asm');
    expect(stringRule.settings?.foreground).toBe('#A3E635');
    expect(functionRule.settings?.foreground).toBe('#FDE047');
    expect(operatorRule.scope).toContain('punctuation.section.parens.z80-asm');
    expect(operatorRule.settings?.foreground).toBe('#A0AEC0');
    expect(constantRule.scope).toContain('constant.numeric.binary.z80-asm');
    expect(constantRule.scope).toContain('constant.numeric.decimal.z80-asm');
    expect(constantRule.scope).toContain('constant.language.current-location.z80-asm');
    expect(constantRule.settings?.foreground).toBe('#FFD166');
  });

  it('contributes token colors for AZM layout and interface scopes', () => {
    expect(findTokenColor('keyword.declaration.type.z80-asm')).toBe('#FF66C4');
    expect(findTokenColor('keyword.declaration.enum.z80-asm')).toBe('#FF66C4');
    expect(findTokenColor('keyword.control.contract.z80-asm')).toBe('#00D1A7');
    expect(findTokenColor('storage.type.field.z80-asm')).toBe('#FF66C4');
    expect(findTokenColor('entity.name.type.z80-asm')).toBe('#4DA3FF');
    expect(findTokenColor('entity.name.type.enum.z80-asm')).toBe('#4DA3FF');
    expect(findTokenColor('support.type.z80-asm')).toBe('#4DA3FF');
    expect(findTokenColor('support.type.primitive.z80-asm')).toBe('#4DA3FF');
    expect(findTokenColor('variable.other.field.z80-asm')).toBe('#FF4D6D');
    expect(findTokenColor('constant.language.enum.member.z80-asm')).toBe('#FF4D6D');
    expect(findTokenColor('support.function.builtin.z80-asm')).toBe('#FDE047');
    expect(findTokenColor('punctuation.definition.typecast.begin.z80-asm')).toBe('#A0AEC0');
    expect(findTokenColor('punctuation.section.brackets.z80-asm')).toBe('#A0AEC0');
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

  it('Z80 assembly grammar includes AZM-derived punctuation and condition scopes', () => {
    const serializedGrammar = JSON.stringify(loadZ80AsmGrammar());
    expect(serializedGrammar).toContain('#condition-instructions');
    expect(serializedGrammar).toContain('constant.language.current-location.z80-asm');
    expect(serializedGrammar).toContain('punctuation.section.parens.z80-asm');
    expect(serializedGrammar).toContain('punctuation.separator.comma.z80-asm');
    expect(serializedGrammar).toContain('SLI');
    expect(serializedGrammar).toContain('\\\\.[A-Za-z_.$?@]');
  });

  it('Z80 assembly grammar claims AZM interface files', () => {
    expect(getAsmGrammarFileTypes()).toContain('asmi');
    expect(getAsmGrammarFileTypes()).not.toContain('a80');
    expect(getAsmGrammarFileTypes()).not.toContain('s');
  });

  it('Z80 assembly grammar checks AZM-specific syntax before generic symbols', () => {
    const includes = getAsmGrammarTopLevelIncludes();

    expect(includes.indexOf('#azm-layout-expressions')).toBeLessThan(
      includes.indexOf('#directives')
    );
    expect(includes.indexOf('#azm-layout-types')).toBeLessThan(includes.indexOf('#directives'));
    expect(includes.indexOf('#azm-enums')).toBeLessThan(includes.indexOf('#symbols'));
    expect(includes.indexOf('#azm-type-fields')).toBeLessThan(includes.indexOf('#symbols'));
    expect(includes.indexOf('#azm-ops')).toBeLessThan(includes.indexOf('#symbols'));
    expect(includes.indexOf('#azm-interface-contracts')).toBeLessThan(includes.indexOf('#symbols'));
  });

  it('Z80 assembly grammar captures AZM directive aliases', () => {
    for (const directive of ['.cstr', '.pstr', '.istr', '.binfrom', '.binto']) {
      expect(getFirstMatchingGrammarScope('directives', directive)).toBe(
        'keyword.control.directive.z80-asm'
      );
    }
    for (const directive of ['CSTR', 'PSTR', 'ISTR']) {
      expect(getFirstMatchingGrammarScope('directives', directive)).toBe(
        'keyword.control.directive.z80-asm'
      );
    }
  });

  it('Z80 assembly grammar captures AZM type, union, and field declarations', () => {
    expect(getFirstGrammarCaptureScope('azm-layout-types', '.type Sprite', '.type')).toBe(
      'keyword.declaration.type.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-layout-types', '.type Sprite', 'Sprite')).toBe(
      'entity.name.type.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-layout-types', '.union WordView', 'WordView')).toBe(
      'entity.name.type.z80-asm'
    );
    expect(getFirstMatchingGrammarScope('azm-layout-types', '.endunion')).toBe(
      'keyword.control.directive.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-type-fields', 'x       .byte', 'x')).toBe(
      'variable.other.field.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-type-fields', 'ptr     .addr', '.addr')).toBe(
      'storage.type.field.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-type-fields', 'data    .field byte[16]', 'byte')).toBe(
      'support.type.primitive.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-type-fields', 'pos     .field Pos', 'Pos')).toBe(
      'support.type.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-type-fields', 'blob    .field 3', 'blob')).toBe(
      'variable.other.field.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-type-fields', 'blob    .field 3', '3')).toBe(
      'constant.numeric.decimal.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-type-fields', 'cells   .field Tri[4]', 'Tri')).toBe(
      'support.type.z80-asm'
    );
  });

  it('Z80 assembly grammar captures AZM enum declarations and qualified members', () => {
    expect(getFirstGrammarCaptureScope('azm-enums', 'enum GameMode Title, Playing', 'enum')).toBe(
      'keyword.declaration.enum.z80-asm'
    );
    expect(
      getFirstGrammarCaptureScope('azm-enums', 'enum GameMode Title, Playing', 'GameMode')
    ).toBe('entity.name.type.enum.z80-asm');
    expect(getFirstGrammarCaptureScope('azm-enums', ', Playing', 'Playing')).toBe(
      'constant.language.enum.member.z80-asm'
    );
    expect(getFirstMatchingGrammarScope('azm-enums', 'GameMode.Playing')).toBe(
      'constant.language.enum.member.z80-asm'
    );
  });

  it('Z80 assembly grammar captures AZM layout builtins and casts', () => {
    expect(
      getFirstGrammarCaptureScope(
        'azm-layout-expressions',
        'SPRITE_SIZE .equ sizeof(Sprite)',
        'sizeof'
      )
    ).toBe('support.function.builtin.z80-asm');
    expect(
      getFirstGrammarCaptureScope(
        'azm-layout-expressions',
        'SPRITE_SIZE .equ sizeof(Sprite)',
        'Sprite'
      )
    ).toBe('support.type.z80-asm');
    expect(
      getFirstGrammarCaptureScope(
        'azm-layout-expressions',
        'SPRITES_SIZE .equ sizeof(Sprite[16])',
        'Sprite'
      )
    ).toBe('support.type.z80-asm');
    expect(
      getFirstGrammarCaptureScope('azm-layout-expressions', 'SPRITE_X .equ offset(Sprite, x)', 'x')
    ).toBe('variable.other.field.z80-asm');
    expect(
      getFirstGrammarCaptureScope(
        'azm-layout-expressions',
        'THIRD_C .equ offset(Tri[4], [2].c)',
        '[2].c'
      )
    ).toBe('variable.other.field.z80-asm');
    expect(
      getFirstGrammarCaptureScope('azm-layout-expressions', '  .ds Sprite[2],$33', 'Sprite')
    ).toBe('support.type.z80-asm');
    expect(getFirstMatchingGrammarScope('operators', '[')).toBe(
      'punctuation.section.brackets.z80-asm'
    );
    expect(getFirstMatchingGrammarScope('azm-layout-expressions', '.color')).toBe(
      'variable.other.field.z80-asm'
    );

    const castPattern = getGrammarBeginEndPattern(
      'azm-layout-expressions',
      'meta.layout-cast.z80-asm'
    );
    expect(castPattern.begin).toBe('<');
    expect(castPattern.end).toBe('>');
    expect(castPattern.beginCaptures?.['0']?.name).toBe(
      'punctuation.definition.typecast.begin.z80-asm'
    );
    expect(castPattern.endCaptures?.['0']?.name).toBe(
      'punctuation.definition.typecast.end.z80-asm'
    );
    expect(castPattern.patterns).toContainEqual({ include: '#azm-layout-type-names' });
  });

  it('Z80 assembly grammar captures AZMDoc plain contract keys', () => {
    expect(getFirstGrammarCaptureScope('routine-comments', 'in        A, IX', 'in')).toBe(
      'storage.type.annotation.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('routine-comments', 'out       A, carry', 'A, carry')).toBe(
      'meta.annotation.parameters.z80-asm'
    );
    expect(
      getFirstGrammarCaptureScope('routine-comments', 'clobbers  BC, DE, HL', 'clobbers')
    ).toBe('storage.type.annotation.z80-asm');
    expect(getFirstGrammarCaptureScope('routine-comments', 'maybe-out A', 'maybe-out')).toBe(
      'storage.type.annotation.z80-asm'
    );
  });

  it('Z80 assembly grammar captures AZM op declarations', () => {
    expect(getFirstGrammarCaptureScope('azm-ops', 'op load8(dst reg8, value imm8)', 'op')).toBe(
      'keyword.declaration.op.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-ops', 'op load8(dst reg8, value imm8)', 'load8')).toBe(
      'entity.name.function.z80-asm'
    );
  });

  it('Z80 assembly grammar captures AZM interface contracts outside comments', () => {
    expect(
      getFirstGrammarCaptureScope('azm-interface-contracts', 'extern MON_PRINT_CHAR', 'extern')
    ).toBe('keyword.control.contract.z80-asm');
    expect(getFirstGrammarCaptureScope('azm-interface-contracts', 'out zero', 'out')).toBe(
      'keyword.control.contract.z80-asm'
    );
    expect(getFirstGrammarCaptureScope('azm-interface-contracts', 'end', 'end')).toBe(
      'keyword.control.contract.z80-asm'
    );
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

  it('does not expose ZAX as a language, extension, breakpoint language, or dependency', () => {
    const ids = contributes.languages.map((l) => l.id);
    const assoc = contributes.configurationDefaults['files.associations'];
    const breakpointLanguages = contributes.breakpoints.map((b) => b.language);
    const debuggerLanguages = contributes.debuggers.flatMap((d) => d.languages);

    expect(ids).not.toContain('zax');
    expect(assoc['*.zax']).toBeUndefined();
    expect(contributes.languages.flatMap((l) => l.extensions ?? [])).not.toContain('.zax');
    expect(breakpointLanguages).not.toContain('zax');
    expect(debuggerLanguages).not.toContain('zax');
    expect(pkg.dependencies?.['@jhlagado/zax']).toBeUndefined();
  });

  it('depends on AZM for bundled assembly', () => {
    expect(pkg.dependencies?.['@jhlagado/azm']).toBeDefined();
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
