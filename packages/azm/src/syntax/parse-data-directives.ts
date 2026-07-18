import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { DataValue } from '../model/source-item.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { parseWholeQuotedString } from './parse-declaration-directives.js';
import { parseLineError, parseLineWarning, typographicQuoteHint } from './parse-diagnostics.js';
import { parseExpression, parseTypeExpr } from './parse-expression.js';
import type { ParseLineResult } from './parse-line.js';

export function parseDataDirective(
  line: LogicalLine,
  directiveText: string,
  valueText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const directive = directiveText.slice(1).toLowerCase() as 'db' | 'dw';
  const parts = splitValueList(valueText);
  const values =
    directive === 'db'
      ? parts.map(parseDataValue).filter((value) => value !== undefined)
      : parts.map(parseExpression).filter((value) => value !== undefined);
  if (values.length !== parts.length) {
    const hint = typographicQuoteHint(valueText);
    return {
      items: [],
      diagnostics: [
        parseLineError(
          line,
          hint ? `invalid .${directive} value list: ${hint}` : `invalid .${directive} value list`,
        ),
      ],
    };
  }
  return {
    items:
      directive === 'db'
        ? [{ kind: 'db', values: values as DataValue[], span }]
        : [{ kind: 'dw', values: values as Expression[], span }],
    diagnostics: parts
      .map((part) => ambiguousBinaryLiteralWarning(line, directive, part))
      .filter((diagnostic): diagnostic is Diagnostic => diagnostic !== undefined),
  };
}

/**
 * Warn when a whole `.db`/`.dw` value is a single binary digit plus a `B`
 * suffix (`0B`/`1B`): those are the only binary literals whose text also reads
 * as a hex byte, and authors writing hex dumps (e.g. ESC/POS `1B 40 ...`)
 * almost always mean the hex value.
 */
function ambiguousBinaryLiteralWarning(
  line: LogicalLine,
  directive: 'db' | 'dw',
  part: string,
): Diagnostic | undefined {
  const text = part.trim();
  if (!/^[01][Bb]$/.test(text)) {
    return undefined;
  }
  const binaryValue = Number.parseInt(text.slice(0, -1), 2);
  const hexValue = Number.parseInt(text, 16);
  return parseLineWarning(
    line,
    `.${directive} value ${text} is a binary literal with value ${binaryValue} (trailing B is the binary suffix) — ` +
      `write 0x${text.toUpperCase()} or ${text}h if hex ${hexValue} was intended`,
  );
}

export function parseDsDirective(
  line: LogicalLine,
  valueText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const parts = splitValueList(valueText);
  const listDiagnostic = validateDsValueList(line, parts);
  if (listDiagnostic) {
    return { items: [], diagnostics: [listDiagnostic] };
  }

  const sizeResult = parseDsSize(line, parts[0] ?? '');
  if (sizeResult.diagnostic) {
    return { items: [], diagnostics: [sizeResult.diagnostic] };
  }

  const fillResult = parseDsFill(line, parts[1]);
  if (fillResult.diagnostic) {
    return { items: [], diagnostics: [fillResult.diagnostic] };
  }

  return {
    items: [
      fillResult.fill === undefined
        ? { kind: 'ds', size: sizeResult.size, span }
        : { kind: 'ds', size: sizeResult.size, fill: fillResult.fill, span },
    ],
    diagnostics: [],
  };
}

export function parseStringDataDirective(
  line: LogicalLine,
  directive: 'cstr' | 'istr' | 'pstr',
  valueText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const value = parseQuotedString(valueText);
  if (value === undefined) {
    const hint = typographicQuoteHint(valueText);
    const message = `.${directive} expects one double-quoted string`;
    return {
      items: [],
      diagnostics: [parseLineError(line, hint ? `${message}: ${hint}` : message)],
    };
  }
  return { items: [{ kind: 'string-data', directive, value, span }], diagnostics: [] };
}

function validateDsValueList(line: LogicalLine, parts: readonly string[]): Diagnostic | undefined {
  return parts.length < 1 || parts.length > 2
    ? parseLineError(line, `invalid .ds value list`)
    : undefined;
}

function parseDsSize(
  line: LogicalLine,
  sizeText: string,
):
  | { readonly size: Expression; readonly diagnostic?: undefined }
  | { readonly diagnostic: Diagnostic } {
  const size = parseTypeSizeExpression(sizeText) ?? parseExpression(sizeText);
  if (!size) {
    return {
      diagnostic: parseLineError(line, `invalid .ds size: ${sizeText}`),
    };
  }
  return { size };
}

function parseDsFill(
  line: LogicalLine,
  fillText: string | undefined,
):
  | { readonly fill: Expression | undefined; readonly diagnostic?: undefined }
  | { readonly diagnostic: Diagnostic } {
  if (fillText === undefined) return { fill: undefined };
  const fill = parseExpression(fillText);
  if (!fill) {
    return {
      diagnostic: parseLineError(line, `invalid .ds fill: ${fillText}`),
    };
  }
  return { fill };
}

function parseTypeSizeExpression(text: string): Expression | undefined {
  const typeExpr = parseTypeExpr(text);
  return typeExpr ? { kind: 'type-size', typeExpr } : undefined;
}

function splitValueList(text: string): string[] {
  const values: string[] = [];
  let state: ValueListScanState = { quote: undefined, escaped: false, parenDepth: 0 };
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (isValueSeparator(text[index] ?? '', state)) {
      values.push(text.slice(start, index));
      start = index + 1;
      continue;
    }
    state = scanValueListChar(text[index] ?? '', state);
  }
  values.push(text.slice(start));
  return values;
}

interface ValueListScanState {
  readonly quote: string | undefined;
  readonly escaped: boolean;
  readonly parenDepth: number;
}

function isValueSeparator(char: string, state: ValueListScanState): boolean {
  return char === ',' && state.quote === undefined && state.parenDepth === 0;
}

function scanValueListChar(char: string, state: ValueListScanState): ValueListScanState {
  const escapedState = scanEscapedValueListChar(char, state);
  if (escapedState) return escapedState;

  const quotedState = scanQuotedValueListChar(char, state);
  if (quotedState) return quotedState;

  return scanParenthesizedValueListChar(char, state);
}

function scanEscapedValueListChar(
  char: string,
  state: ValueListScanState,
): ValueListScanState | undefined {
  if (state.escaped) return { ...state, escaped: false };
  if (char === '\\' && state.quote !== undefined) return { ...state, escaped: true };
  return undefined;
}

function scanQuotedValueListChar(
  char: string,
  state: ValueListScanState,
): ValueListScanState | undefined {
  if (char !== '"' && char !== "'") return undefined;
  return { ...state, quote: state.quote === char ? undefined : (state.quote ?? char) };
}

function scanParenthesizedValueListChar(
  char: string,
  state: ValueListScanState,
): ValueListScanState {
  if (state.quote !== undefined) return state;
  if (char === '(') return { ...state, parenDepth: state.parenDepth + 1 };
  if (char === ')') return { ...state, parenDepth: Math.max(0, state.parenDepth - 1) };
  return state;
}

function parseQuotedString(text: string): string | undefined {
  const input = text.trim();
  if (input[0] !== '"' || input[input.length - 1] !== '"') {
    return undefined;
  }
  return parseWholeQuotedString(input);
}

function parseDataValue(text: string): DataValue | undefined {
  const expression = parseExpression(text);
  if (expression) {
    return expression;
  }

  const value = parseWholeQuotedString(text);
  return value === undefined ? undefined : { kind: 'string-fragment', value };
}
