import {
  appendParsedAsmStatement,
  parseAsmStatement,
} from './parseAsmStatements.js';
import type { AsmInstructionNode, AsmItemNode, AsmLabelNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { topLevelStartKeyword } from './parseTopLevelCommon.js';
import { isSupportedSourcePath } from './sourceExtensions.js';

export type AzmAsmStreamItem = AsmLabelNode | AsmInstructionNode;

export function parseAzmAsmStreamLine(args: {
  rest: string;
  filePath: string;
  stmtSpan: SourceSpan;
  diagnostics: Diagnostic[];
  nativeMode?: boolean;
}): AzmAsmStreamItem[] | undefined {
  const { rest, filePath, stmtSpan, diagnostics, nativeMode = false } = args;
  if (!nativeMode && !isSupportedSourcePath(filePath)) return undefined;
  if (topLevelStartKeyword(rest) !== undefined) return undefined;

  const content = rest.trim();
  if (content.length === 0) return [];

  const nodes: AzmAsmStreamItem[] = [];
  const asmItems: AsmItemNode[] = [];
  const labelMatch = /^(@?[A-Za-z_][A-Za-z0-9_]*|\.[A-Za-z_][A-Za-z0-9_]*)\s*:(?!\=)\s*(.*)$/.exec(content);
  if (labelMatch) {
    const rawName = labelMatch[1]!;
    const isEntry = rawName.startsWith('@');
    nodes.push({
      kind: 'AsmLabel',
      span: stmtSpan,
      name: isEntry ? rawName.slice(1) : rawName,
      ...(isEntry ? { isEntry: true } : {}),
    });
    const remainder = labelMatch[2]?.trim() ?? '';
    if (remainder.length > 0) {
      appendParsedAsmStatement(
        asmItems,
        parseAsmStatement(filePath, remainder, stmtSpan, diagnostics),
      );
    }
  } else {
    appendParsedAsmStatement(
      asmItems,
      parseAsmStatement(filePath, content, stmtSpan, diagnostics),
    );
  }

  for (const item of asmItems) nodes.push(item);
  return nodes;
}
