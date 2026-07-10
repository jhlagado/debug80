export const IDENTIFIER_PATTERN = '[A-Za-z_][A-Za-z0-9_]*';
export const LABEL_NAME_PATTERN = '[A-Za-z_.$?][A-Za-z0-9_.$?]*';

const IDENTIFIER_RE = new RegExp(`^${IDENTIFIER_PATTERN}$`);
const LABEL_NAME_RE = new RegExp(`^${LABEL_NAME_PATTERN}$`);
const DECLARED_NAME_RE = new RegExp(`^@?${LABEL_NAME_PATTERN}$`);
const LEADING_LABEL_RE = new RegExp(`^(@?${LABEL_NAME_PATTERN}):\\s*(.*)$`);

export interface ParsedDeclaredName {
  readonly rawLabel: string;
  readonly name: string;
  readonly isExported: boolean;
}

export interface ParsedLeadingLabel extends ParsedDeclaredName {
  readonly labelColumn: number;
  readonly statementText: string;
  readonly statementColumn: number;
}

export function isIdentifier(text: string): boolean {
  return IDENTIFIER_RE.test(text);
}

export function isLabelName(text: string): boolean {
  return LABEL_NAME_RE.test(text);
}

export function parseDeclaredName(text: string): ParsedDeclaredName | undefined {
  if (!DECLARED_NAME_RE.test(text)) return undefined;
  return {
    rawLabel: text,
    name: normalizeExportedName(text),
    isExported: text.startsWith('@'),
  };
}

export function normalizeExportedName(raw: string): string {
  return raw.startsWith('@') ? raw.slice(1) : raw;
}

export function hasLeadingLabel(text: string): boolean {
  return new RegExp(`^@?${LABEL_NAME_PATTERN}:`).test(text);
}

export function parseLeadingLabel(text: string, column: number): ParsedLeadingLabel | undefined {
  const match = LEADING_LABEL_RE.exec(text);
  if (!match) return undefined;
  const rawLabel = match[1] ?? '';
  const parsed = parseDeclaredName(rawLabel);
  if (!parsed) return undefined;
  const statementText = match[2] ?? '';
  const statementOffset = text.indexOf(statementText, rawLabel.length + 1);
  return {
    ...parsed,
    labelColumn: column,
    statementText,
    statementColumn: column + (statementOffset === -1 ? text.length : statementOffset),
  };
}
