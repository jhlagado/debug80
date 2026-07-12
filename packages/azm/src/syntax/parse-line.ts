import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type { LogicalLine } from '../source/logical-lines.js';
import type { SourceSpan } from '../source/source-span.js';
import { extractLineComment, stripLineComment } from '../source/strip-line-comment.js';
import { normalizeDirectiveAlias, type DirectiveAliasPolicy } from './directive-aliases.js';
import { LABEL_NAME_PATTERN, parseDeclaredName } from './names.js';
import { firstNonWhitespaceColumn, parseLineError } from './parse-diagnostics.js';
import { parseColonDeclaration, parseDirectiveStatement } from './parse-directive-statement.js';
import { parseZ80Instruction } from '../z80/parse-instruction.js';

export interface ParseLineResult {
  readonly items: readonly SourceItem[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ParseLogicalLineOptions {
  readonly directiveAliasPolicy?: DirectiveAliasPolicy;
}

export function parseLogicalLine(
  line: LogicalLine,
  options: ParseLogicalLineOptions = {},
): ParseLineResult {
  const text = normalizeDirectiveAlias(
    stripLineComment(line.text),
    options.directiveAliasPolicy,
  ).trim();
  if (text.length === 0) {
    return commentOnlyLine(line);
  }

  const span = spanForLine(line);
  const labelWithStatement = new RegExp(`^(@?${LABEL_NAME_PATTERN}):\\s*(.+)$`).exec(text);
  if (labelWithStatement) {
    const rawLabel = labelWithStatement[1] ?? '';
    const label = parseDeclaredName(rawLabel);
    if (!label) return withLineComment(line, parseCanonicalStatement(line, text, span));
    const statementText = labelWithStatement[2] ?? '';
    const declaration = parseColonDeclaration(
      line,
      label.name,
      label.isExported,
      statementText,
      span,
    );
    if (declaration) {
      return withLineComment(line, declaration);
    }
    const parsedStatement = parseCanonicalStatement(line, statementText, span);
    return withLineComment(line, {
      items: [
        {
          kind: 'label',
          name: label.name,
          ...(label.isExported ? { isExported: true } : {}),
          span,
        },
        ...parsedStatement.items,
      ],
      diagnostics: parsedStatement.diagnostics,
    });
  }

  const labelOnly = new RegExp(`^(@?${LABEL_NAME_PATTERN}):$`).exec(text);
  if (labelOnly) {
    const rawLabel = labelOnly[1] ?? '';
    const label = parseDeclaredName(rawLabel);
    if (!label) return withLineComment(line, parseCanonicalStatement(line, text, span));
    return withLineComment(line, {
      items: [
        {
          kind: 'label',
          name: label.name,
          ...(label.isExported ? { isExported: true } : {}),
          span,
        },
      ],
      diagnostics: [],
    });
  }

  return withLineComment(line, parseCanonicalStatement(line, text, span));
}

function commentOnlyLine(line: LogicalLine): ParseLineResult {
  const comment = extractLineComment(line.text);
  if (!comment) {
    return { items: [], diagnostics: [] };
  }
  return {
    items: [
      {
        kind: 'comment',
        text: comment,
        origin: 'user',
        span: {
          sourceName: line.sourceName,
          line: line.line,
          column: firstNonWhitespaceColumn(line.text),
          ...(line.sourceUnit !== undefined ? { sourceUnit: line.sourceUnit } : {}),
          ...(line.sourceRelation !== undefined ? { sourceRelation: line.sourceRelation } : {}),
          ...(line.sourceUnitRelation !== undefined
            ? { sourceUnitRelation: line.sourceUnitRelation }
            : {}),
        },
      },
    ],
    diagnostics: legacyContractCommentDiagnostics(line, comment),
  };
}

function withLineComment(line: LogicalLine, result: ParseLineResult): ParseLineResult {
  const comment = extractLineComment(line.text);
  if (!comment) {
    return result;
  }
  return {
    items: [
      ...result.items,
      {
        kind: 'comment',
        text: comment,
        origin: 'user',
        span: {
          sourceName: line.sourceName,
          line: line.line,
          column: firstNonWhitespaceColumn(line.text),
          ...(line.sourceUnit !== undefined ? { sourceUnit: line.sourceUnit } : {}),
          ...(line.sourceRelation !== undefined ? { sourceRelation: line.sourceRelation } : {}),
        },
      },
    ],
    diagnostics: [...result.diagnostics, ...legacyContractCommentDiagnostics(line, comment)],
  };
}

function legacyContractCommentDiagnostics(
  line: LogicalLine,
  comment: string,
): readonly Diagnostic[] {
  const trimmed = comment.trim();
  if (
    /^!\s*(?:in|out|maybe-out|clobbers|preserves|contracts|rc-ignore-next|extern|end)\b/iu.test(
      trimmed,
    )
  ) {
    return [
      parseLineError(
        line,
        'legacy ;! register-contract comments are not supported; use .routine, .rcignore, or an .asmi interface',
      ),
    ];
  }
  if (/^expects\s+out\b/iu.test(trimmed)) {
    return [
      parseLineError(
        line,
        'legacy ; expects out comments are not supported; use .expectout before the call',
      ),
    ];
  }
  return [];
}

function parseCanonicalStatement(
  line: LogicalLine,
  text: string,
  span: SourceSpan,
): ParseLineResult {
  const directive = parseDirectiveStatement(line, text, span);
  if (directive) {
    return directive;
  }

  const instruction = parseZ80Instruction(text);
  if (instruction?.instruction) {
    return {
      items: [{ kind: 'instruction', instruction: instruction.instruction, span }],
      diagnostics: [],
    };
  }

  if (instruction?.diagnostics && instruction.diagnostics.length > 0) {
    return {
      items: [],
      diagnostics: instruction.diagnostics.map((message) => parseLineError(line, message)),
    };
  }

  if (instruction?.error) {
    return { items: [], diagnostics: [parseLineError(line, instruction.error)] };
  }

  return { items: [], diagnostics: [parseLineError(line, `unsupported source line: ${text}`)] };
}

function spanForLine(line: LogicalLine): SourceSpan {
  return {
    sourceName: line.sourceName,
    line: line.line,
    column: firstNonWhitespaceColumn(line.text),
    ...(line.sourceUnit !== undefined ? { sourceUnit: line.sourceUnit } : {}),
    ...(line.sourceRelation !== undefined ? { sourceRelation: line.sourceRelation } : {}),
    ...(line.sourceUnitRelation !== undefined
      ? { sourceUnitRelation: line.sourceUnitRelation }
      : {}),
  };
}
