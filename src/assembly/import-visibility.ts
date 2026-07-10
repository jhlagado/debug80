import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { DataValue, Instruction, SourceItem } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';
import type { Z80Operand } from '../z80/instruction.js';
import { diagnostic } from '../semantics/diagnostics.js';
import {
  buildRoutineLocalLabelModel,
  routineScopeKey,
  type RoutineLocalLabelModel,
  type RoutineScope,
} from './routine-label-scopes.js';

interface LabelVisibility {
  readonly name: string;
  readonly definingSourceUnit: string | undefined;
  readonly definingSourceName: string;
  readonly unitKey: string;
  /** Enclosing `@` routine when the label is routine-local. */
  readonly routine: string | undefined;
  readonly public: boolean;
  readonly duplicateName: boolean;
}

interface DeclarationVisibility {
  readonly name: string;
  readonly definingSourceUnit: string | undefined;
  readonly definingSourceName: string;
  readonly public: boolean;
}

interface SymbolConflictIndex {
  readonly exact: ReadonlyMap<string, number>;
  readonly declarationLower: ReadonlyMap<string, number>;
}

export function validateImportVisibility(
  items: readonly SourceItem[],
  diagnostics: Diagnostic[],
): void {
  const model = buildRoutineLocalLabelModel(items);
  const symbols = collectSymbolVisibility(items, model);
  for (let index = 0; index < items.length; index += 1) {
    validateItemReferences(items[index]!, model.scopes[index]!, symbols, diagnostics);
  }
}

interface SymbolVisibility {
  readonly labels: ReadonlyMap<string, readonly LabelVisibility[]>;
  readonly declarations: ReadonlyMap<string, readonly DeclarationVisibility[]>;
  readonly exactSymbols: ReadonlySet<string>;
  readonly exactNonLabelSymbols: ReadonlySet<string>;
  readonly lowerNonLabelSymbols: ReadonlySet<string>;
}

function collectSymbolVisibility(
  items: readonly SourceItem[],
  model: RoutineLocalLabelModel,
): SymbolVisibility {
  const labels = new Map<string, LabelVisibility[]>();
  const declarations = new Map<string, DeclarationVisibility[]>();
  const exactSymbols = new Set<string>();
  const exactNonLabelSymbols = new Set<string>();
  const lowerNonLabelSymbols = new Set<string>();
  const importedSourceUnits = importedUnitNames(items);
  const symbolConflicts = buildSymbolConflictIndex(items);
  for (const item of items) {
    for (const name of exactSymbolNames(item)) {
      exactSymbols.add(name);
    }
    for (const name of exactNonLabelSymbolNames(item)) {
      exactNonLabelSymbols.add(name);
      lowerNonLabelSymbols.add(name.toLowerCase());
    }
  }
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.kind !== 'label') continue;
    const scope = model.scopes[index]!;
    const routine = item.name.startsWith('_') ? scope.routine : undefined;
    const importedPrivate = isImportedPrivateLabel(item);
    const existing = labels.get(item.name) ?? [];
    labels.set(item.name, [
      ...existing,
      {
        name: item.name,
        definingSourceUnit: item.span.sourceUnit,
        definingSourceName: item.span.sourceName,
        unitKey: scope.unitKey,
        routine,
        public: routine === undefined && isPublicLabel(item, importedSourceUnits),
        duplicateName:
          routine !== undefined
            ? !(model.localsByScope.get(routineScopeKey(scope))?.has(item.name) ?? false)
            : importedPrivate
              ? hasSameSourceUnitLabelConflict(item, items, index)
              : hasAddressPlanningNameConflict(item.name, symbolConflicts, items, index),
      },
    ]);
  }
  for (const item of items) {
    for (const name of declarationReferenceNames(item)) {
      const existing = declarations.get(name) ?? [];
      declarations.set(name, [
        ...existing,
        {
          name,
          definingSourceUnit: item.span.sourceUnit,
          definingSourceName: item.span.sourceName,
          public: isPublicDeclaration(item, importedSourceUnits),
        },
      ]);
    }
  }
  return { labels, declarations, exactSymbols, exactNonLabelSymbols, lowerNonLabelSymbols };
}

function declarationReferenceNames(item: SourceItem): readonly string[] {
  switch (item.kind) {
    case 'equ':
    case 'type':
    case 'type-alias':
      return [item.name];
    case 'enum':
      return [item.name, ...item.members.map((member) => `${item.name}.${member}`)];
    default:
      return [];
  }
}

function isPublicDeclaration(item: SourceItem, importedSourceUnits: ReadonlySet<string>): boolean {
  if (
    item.kind !== 'equ' &&
    item.kind !== 'enum' &&
    item.kind !== 'type' &&
    item.kind !== 'type-alias'
  ) {
    return false;
  }
  return (
    item.isExported === true ||
    item.span.sourceUnit === undefined ||
    !importedSourceUnits.has(item.span.sourceUnit)
  );
}

function buildSymbolConflictIndex(items: readonly SourceItem[]): SymbolConflictIndex {
  const exact = new Map<string, number>();
  const declarationLower = new Map<string, number>();
  for (const item of items) {
    for (const name of exactSymbolNames(item)) {
      exact.set(name, (exact.get(name) ?? 0) + 1);
    }
    const declarationName = caseInsensitiveDeclarationName(item);
    if (declarationName !== undefined) {
      const key = declarationName.toLowerCase();
      declarationLower.set(key, (declarationLower.get(key) ?? 0) + 1);
    }
  }
  return { exact, declarationLower };
}

function hasAddressPlanningNameConflict(
  labelName: string,
  conflicts: SymbolConflictIndex,
  items: readonly SourceItem[],
  labelIndex: number,
): boolean {
  return (
    (conflicts.exact.get(labelName) ?? 0) > 1 ||
    (conflicts.declarationLower.get(labelName.toLowerCase()) ?? 0) > 0 ||
    hasReportedEnumMemberConflict(labelName, items, labelIndex)
  );
}

function hasReportedEnumMemberConflict(
  labelName: string,
  items: readonly SourceItem[],
  labelIndex: number,
): boolean {
  const lowerName = labelName.toLowerCase();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.kind !== 'enum') continue;
    for (const memberName of qualifiedEnumMemberNames(item)) {
      if (memberName === labelName) return true;
      if (index > labelIndex && memberName.toLowerCase() === lowerName) return true;
    }
  }
  return false;
}

function exactSymbolNames(item: SourceItem): readonly string[] {
  switch (item.kind) {
    case 'label':
    case 'equ':
      return [item.name];
    case 'enum':
      return qualifiedEnumMemberNames(item);
    default:
      return [];
  }
}

function qualifiedEnumMemberNames(item: SourceItem): readonly string[] {
  return item.kind === 'enum' ? item.members.map((member) => `${item.name}.${member}`) : [];
}

function exactNonLabelSymbolNames(item: SourceItem): readonly string[] {
  switch (item.kind) {
    case 'equ':
      return [item.name];
    case 'enum':
      return qualifiedEnumMemberNames(item);
    default:
      return [];
  }
}

function caseInsensitiveDeclarationName(item: SourceItem): string | undefined {
  switch (item.kind) {
    case 'enum':
    case 'type':
    case 'type-alias':
      return item.name;
    default:
      return undefined;
  }
}

function importedUnitNames(items: readonly SourceItem[]): ReadonlySet<string> {
  const units = new Set<string>();
  for (const item of items) {
    if (item.span.sourceUnitRelation === 'import' && item.span.sourceUnit !== undefined) {
      units.add(item.span.sourceUnit);
    }
  }
  return units;
}

function isPublicLabel(
  item: Extract<SourceItem, { readonly kind: 'label' }>,
  importedSourceUnits: ReadonlySet<string>,
): boolean {
  return (
    item.isExported === true ||
    item.span.sourceUnit === undefined ||
    !importedSourceUnits.has(item.span.sourceUnit)
  );
}

function isImportedPrivateLabel(item: Extract<SourceItem, { readonly kind: 'label' }>): boolean {
  return (
    item.isExported !== true &&
    item.span.sourceUnitRelation === 'import' &&
    item.span.sourceUnit !== undefined
  );
}

function hasSameSourceUnitLabelConflict(
  label: Extract<SourceItem, { readonly kind: 'label' }>,
  items: readonly SourceItem[],
  labelIndex: number,
): boolean {
  const sourceUnit = label.span.sourceUnit;
  if (sourceUnit === undefined) return false;
  const lowerName = label.name.toLowerCase();
  for (let index = 0; index < items.length; index += 1) {
    if (index === labelIndex) continue;
    const item = items[index]!;
    if (item.span.sourceUnit !== sourceUnit) continue;
    for (const name of exactSymbolNames(item)) {
      if (name === label.name) return true;
    }
    const declarationName = caseInsensitiveDeclarationName(item);
    if (declarationName !== undefined && declarationName.toLowerCase() === lowerName) {
      return true;
    }
    if (item.kind === 'enum') {
      for (const memberName of qualifiedEnumMemberNames(item)) {
        if (memberName.toLowerCase() === lowerName) return true;
      }
    }
  }
  return false;
}

function validateItemReferences(
  item: SourceItem,
  scope: RoutineScope,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  switch (item.kind) {
    case 'org':
      validateExpression(item.expression, item.span, scope, symbols, diagnostics);
      return;
    case 'equ':
      validateExpression(item.expression, item.span, scope, symbols, diagnostics);
      return;
    case 'db':
      for (const value of item.values) {
        validateDataValue(value, item.span, scope, symbols, diagnostics);
      }
      return;
    case 'dw':
      for (const value of item.values) {
        validateExpression(value, item.span, scope, symbols, diagnostics);
      }
      return;
    case 'ds':
      validateExpression(item.size, item.span, scope, symbols, diagnostics);
      if (item.fill !== undefined) {
        validateExpression(item.fill, item.span, scope, symbols, diagnostics);
      }
      return;
    case 'align':
      validateExpression(item.alignment, item.span, scope, symbols, diagnostics);
      return;
    case 'binfrom':
    case 'binto':
      validateExpression(item.expression, item.span, scope, symbols, diagnostics);
      return;
    case 'instruction':
      validateInstruction(item.instruction, item.span, scope, symbols, diagnostics);
      return;
    case 'label':
    case 'routine':
    case 'contracts-policy':
    case 'rc-ignore':
    case 'expect-out':
    case 'comment':
    case 'end':
    case 'enum':
    case 'type':
    case 'type-alias':
    case 'string-data':
      return;
  }
}

function validateDataValue(
  value: DataValue,
  span: SourceSpan,
  scope: RoutineScope,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  if ('kind' in value && value.kind === 'string-fragment') return;
  validateExpression(value, span, scope, symbols, diagnostics);
}

function validateInstruction(
  instruction: Instruction,
  span: SourceSpan,
  scope: RoutineScope,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  for (const expression of instructionExpressions(instruction)) {
    validateExpression(expression, span, scope, symbols, diagnostics);
  }
}

function instructionExpressions(instruction: Instruction): readonly Expression[] {
  switch (instruction.mnemonic) {
    case 'ld-a-imm':
    case 'jp':
    case 'call':
    case 'jr':
    case 'djnz':
      return [instruction.expression];
    case 'jp-cc':
    case 'call-cc':
    case 'jr-cc':
      return [instruction.expression];
    case 'ld':
      return [...operandExpressions(instruction.target), ...operandExpressions(instruction.source)];
    case 'in':
      return instruction.port.kind === 'imm' ? [instruction.port.expression] : [];
    case 'out':
      return instruction.port.kind === 'imm' ? [instruction.port.expression] : [];
    case 'inc':
    case 'dec':
      return 'displacement' in instruction.operand ? [instruction.operand.displacement] : [];
    case 'bit':
    case 'res':
    case 'set':
      return [
        ...(typeof instruction.bit === 'number' ? [] : [instruction.bit]),
        ...('displacement' in instruction.operand ? [instruction.operand.displacement] : []),
      ];
    case 'rlc':
    case 'rrc':
    case 'rl':
    case 'rr':
    case 'sla':
    case 'sra':
    case 'sll':
    case 'sls':
    case 'srl':
      return 'displacement' in instruction.operand ? [instruction.operand.displacement] : [];
    case 'add':
      if ('source' in instruction && 'target' in instruction) {
        return [
          ...operandExpressions(instruction.target),
          ...operandExpressions(instruction.source),
        ];
      }
      return 'source' in instruction ? operandExpressions(instruction.source) : [];
    case 'adc':
    case 'sbc':
      return 'source' in instruction ? operandExpressions(instruction.source) : [];
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return operandExpressions(instruction.source);
    default:
      return [];
  }
}

function operandExpressions(operand: Z80Operand): readonly Expression[] {
  switch (operand.kind) {
    case 'mem-abs':
    case 'imm':
      return [operand.expression];
    case 'indexed':
      return [operand.displacement];
    default:
      return [];
  }
}

function validateExpression(
  expression: Expression,
  span: SourceSpan,
  scope: RoutineScope,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  switch (expression.kind) {
    case 'symbol':
      validateSymbolReference(expression.name, span, scope, symbols, diagnostics);
      return;
    case 'byte-function':
    case 'unary':
      validateExpression(expression.expression, span, scope, symbols, diagnostics);
      return;
    case 'binary':
      validateExpression(expression.left, span, scope, symbols, diagnostics);
      validateExpression(expression.right, span, scope, symbols, diagnostics);
      return;
    case 'layout-cast':
      validateTypeReference(expression.typeExpr, span, symbols, diagnostics);
      validateExpression(expression.base, span, scope, symbols, diagnostics);
      for (const part of expression.path) {
        if (part.kind === 'index') {
          validateExpression(part.expression, span, scope, symbols, diagnostics);
        }
      }
      return;
    case 'number':
    case 'current-location':
      return;
    case 'sizeof':
    case 'offset':
      validateTypeReference(expression.typeExpr, span, symbols, diagnostics);
      return;
    case 'type-size':
      if (expression.typeExpr.length === undefined) {
        validateSymbolReference(expression.typeExpr.name, span, scope, symbols, diagnostics);
      }
      return;
  }
}

function validateTypeReference(
  typeExpr: import('../model/expression.js').TypeExpr,
  span: SourceSpan,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  if (isBuiltinTypeName(typeExpr.name)) return;
  validateDeclarationReference(typeExpr.name, span, symbols, diagnostics);
}

function isBuiltinTypeName(name: string): boolean {
  return /^(?:byte|word|addr)$/iu.test(name);
}

function validateSymbolReference(
  name: string,
  referenceSpan: SourceSpan,
  referenceScope: RoutineScope,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  const label = lookupLabel(symbols, name, referenceSpan, referenceScope);
  if (!label) {
    validateDeclarationReference(name, referenceSpan, symbols, diagnostics);
    return;
  }
  if (label.duplicateName) return;
  if (label.routine !== undefined) {
    if (label.unitKey === referenceScope.unitKey && label.routine === referenceScope.routine) {
      return;
    }
    diagnostics.push(
      diagnostic(
        referenceSpan,
        `local symbol "${name}" belongs to ${label.routine} in ${label.definingSourceName}`,
      ),
    );
    return;
  }
  if (label.public) return;
  if (referenceSpan.sourceUnit === label.definingSourceUnit) return;
  diagnostics.push(
    diagnostic(
      referenceSpan,
      `symbol "${name}" is private to ${label.definingSourceName}; export it with @${label.name} or keep the reference inside that file`,
    ),
  );
}

function validateDeclarationReference(
  name: string,
  referenceSpan: SourceSpan,
  symbols: SymbolVisibility,
  diagnostics: Diagnostic[],
): void {
  const candidates = symbols.declarations.get(name);
  if (candidates === undefined || candidates.length !== 1) return;
  const declaration = candidates[0]!;
  if (declaration.public || referenceSpan.sourceUnit === declaration.definingSourceUnit) return;
  diagnostics.push(
    diagnostic(
      referenceSpan,
      `symbol "${name}" is private to ${declaration.definingSourceName}; export it with @${declaration.name} or keep the reference inside that source unit`,
    ),
  );
}

function lookupLabel(
  symbols: SymbolVisibility,
  name: string,
  referenceSpan: SourceSpan,
  referenceScope: RoutineScope,
): LabelVisibility | undefined {
  if (symbols.exactNonLabelSymbols.has(name)) return undefined;
  const candidates = [...(symbols.labels.get(name) ?? [])];
  return preferredLabel(candidates, referenceSpan, referenceScope);
}

function preferredLabel(
  labels: readonly LabelVisibility[] | undefined,
  referenceSpan: SourceSpan,
  referenceScope: RoutineScope,
): LabelVisibility | undefined {
  if (labels === undefined || labels.length === 0) return undefined;
  return (
    labels.find(
      (label) =>
        label.routine !== undefined &&
        label.unitKey === referenceScope.unitKey &&
        label.routine === referenceScope.routine,
    ) ??
    labels.find(
      (label) =>
        label.routine === undefined && label.definingSourceUnit === referenceSpan.sourceUnit,
    ) ??
    labels.find((label) => label.public) ??
    labels[0]
  );
}
