import type { Expression } from '../model/expression.js';
import type { DataValue, SourceItem } from '../model/source-item.js';
import type { SymbolTable } from '../model/symbol.js';
import type { Z80Instruction, Z80Operand } from '../z80/instruction.js';
import { buildRoutineLocalLabelModel, routineScopeKey } from './routine-label-scopes.js';

const PRIVATE_LABEL_PREFIX = '\0azm-private\0';

interface PrivateLabelScope {
  readonly labels: ReadonlyMap<string, string>;
  readonly exactNonPrivateNames: ReadonlySet<string>;
  readonly lowerNonPrivateNames: ReadonlySet<string>;
}

export function isQualifiedPrivateLabelName(name: string): boolean {
  return name.startsWith(PRIVATE_LABEL_PREFIX);
}

export function displaySymbolName(name: string): string {
  if (!isQualifiedPrivateLabelName(name)) return name;
  const parts = name.split('\0');
  return parts[parts.length - 1] ?? name;
}

/**
 * Qualify `_name` labels beneath their nearest preceding non-local owner.
 * Runs before {@link qualifyImportedPrivateLabels}; remaining source-unit
 * private labels of imported units are handled there.
 */
export function qualifyRoutineLocalLabels(items: readonly SourceItem[]): readonly SourceItem[] {
  const model = buildRoutineLocalLabelModel(items);
  if (model.localsByScope.size === 0) return items;
  const scopeCache = new Map<string, PrivateLabelScope>();
  return items.map((item, index) => {
    const scope = model.scopes[index]!;
    if (scope.routine === undefined) return item;
    const scopeKey = routineScopeKey(scope);
    const locals = model.localsByScope.get(scopeKey);
    if (locals === undefined || locals.size === 0) return item;
    let privateScope = scopeCache.get(scopeKey);
    if (privateScope === undefined) {
      const labels = new Map<string, string>();
      for (const name of locals) {
        labels.set(name, qualifyRoutineLocalLabelName(scope.unitKey, scope.routine, name));
      }
      privateScope = {
        labels,
        exactNonPrivateNames: model.outerExactNames,
        lowerNonPrivateNames: model.outerLowerNames,
      };
      scopeCache.set(scopeKey, privateScope);
    }
    return item.kind === 'label' && item.isExported === true
      ? item
      : qualifySourceItemWithScope(item, privateScope);
  });
}

export function qualifyImportedPrivateLabels(items: readonly SourceItem[]): readonly SourceItem[] {
  const labelsByUnit = importedPrivateNamesByUnit(items);
  const exactNonPrivateNamesByUnit = importedExactNonPrivateNamesByUnit(items);
  const lowerNonPrivateNamesByUnit = lowerNamesByUnit(exactNonPrivateNamesByUnit);
  if (labelsByUnit.size === 0) return items;
  return items.map((item) =>
    qualifySourceItem(item, labelsByUnit, exactNonPrivateNamesByUnit, lowerNonPrivateNamesByUnit),
  );
}

export function displaySymbolsForProgram(
  originalItems: readonly SourceItem[],
  qualifiedItems: readonly SourceItem[],
  symbols: Readonly<SymbolTable>,
): SymbolTable {
  const displaySymbols: Record<string, number> = {};
  for (const [name, value] of Object.entries(symbols)) {
    if (!isQualifiedPrivateLabelName(name)) {
      displaySymbols[name] = value;
    }
  }

  interface PrivateLabelPair {
    readonly originalName: string;
    readonly qualifiedName: string;
  }
  const pairs: PrivateLabelPair[] = [];
  for (let index = 0; index < originalItems.length; index += 1) {
    const original = originalItems[index];
    const qualified = qualifiedItems[index];
    if (original?.kind !== 'label' || qualified?.kind !== 'label') continue;
    if (!isQualifiedPrivateLabelName(qualified.name)) continue;
    pairs.push({ originalName: original.name, qualifiedName: qualified.name });
  }

  const privateLowerCounts = new Map<string, number>();
  for (const pair of pairs) {
    const lower = pair.originalName.toLowerCase();
    privateLowerCounts.set(lower, (privateLowerCounts.get(lower) ?? 0) + 1);
  }
  const publicLowerNames = new Set(Object.keys(displaySymbols).map((name) => name.toLowerCase()));

  for (const pair of pairs) {
    const value = symbols[pair.qualifiedName];
    if (value === undefined) continue;
    const lower = pair.originalName.toLowerCase();
    const ambiguous = (privateLowerCounts.get(lower) ?? 0) > 1 || publicLowerNames.has(lower);
    if (!ambiguous) {
      if (displaySymbols[pair.originalName] === undefined) {
        displaySymbols[pair.originalName] = value;
      }
      continue;
    }
    const routine = routineOfQualifiedLabelName(pair.qualifiedName);
    if (routine === undefined) continue;
    const dotted = `${routine}.${pair.originalName}`;
    if (displaySymbols[dotted] === undefined) {
      displaySymbols[dotted] = value;
    }
  }

  return displaySymbols;
}

function qualifyRoutineLocalLabelName(unitKey: string, routine: string, name: string): string {
  return `${PRIVATE_LABEL_PREFIX}${unitKey}\0@${routine}\0${name}`;
}

function routineOfQualifiedLabelName(name: string): string | undefined {
  const parts = name.split('\0');
  const routinePart = parts[parts.length - 2];
  return routinePart !== undefined && routinePart.startsWith('@') && routinePart.length > 1
    ? routinePart.slice(1)
    : undefined;
}

function importedPrivateNamesByUnit(
  items: readonly SourceItem[],
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const namesByUnit = new Map<string, Map<string, string>>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (!isImportedPrivateDeclaration(item)) continue;
    if (item.kind === 'label' && hasSameSourceUnitDeclarationConflict(item, items, index)) continue;
    const unit = item.span.sourceUnit;
    if (unit === undefined) continue;
    const unitNames = namesByUnit.get(unit) ?? new Map<string, string>();
    for (const name of privateDeclarationNames(item)) {
      unitNames.set(name, qualifyPrivateLabelName(unit, name));
    }
    namesByUnit.set(unit, unitNames);
  }
  return namesByUnit;
}

function privateDeclarationNames(item: SourceItem): readonly string[] {
  switch (item.kind) {
    case 'label':
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

function importedExactNonPrivateNamesByUnit(
  items: readonly SourceItem[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const names = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.span.sourceUnitRelation !== 'import' || item.span.sourceUnit === undefined) continue;
    const sourceUnit = item.span.sourceUnit;
    const unitNames = names.get(sourceUnit) ?? new Set<string>();
    for (const name of exactNonPrivateNames(item)) {
      unitNames.add(name);
    }
    names.set(sourceUnit, unitNames);
  }
  return names;
}

function lowerNamesByUnit(
  namesByUnit: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyMap<string, ReadonlySet<string>> {
  const result = new Map<string, Set<string>>();
  for (const [unit, names] of namesByUnit) {
    result.set(unit, new Set([...names].map((name) => name.toLowerCase())));
  }
  return result;
}

function exactNonPrivateNames(item: SourceItem): readonly string[] {
  if (isImportedPrivateDeclaration(item)) return [];
  switch (item.kind) {
    case 'label':
      return [item.name];
    case 'equ':
      return [item.name];
    case 'enum':
      return [item.name, ...item.members.map((member) => `${item.name}.${member}`)];
    case 'type':
    case 'type-alias':
      return [item.name];
    default:
      return [];
  }
}

function hasSameSourceUnitDeclarationConflict(
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
    if (item.kind === 'label' || item.kind === 'equ') {
      if (item.name === label.name) return true;
      continue;
    }
    if (item.kind === 'type' || item.kind === 'type-alias') {
      if (item.name.toLowerCase() === lowerName) return true;
      continue;
    }
    if (item.kind === 'enum') {
      if (item.name.toLowerCase() === lowerName) return true;
      for (const member of item.members) {
        if (`${item.name}.${member}`.toLowerCase() === lowerName) return true;
      }
    }
  }
  return false;
}

function isImportedPrivateDeclaration(item: SourceItem): boolean {
  return (
    (item.kind === 'label' ||
      item.kind === 'equ' ||
      item.kind === 'enum' ||
      item.kind === 'type' ||
      item.kind === 'type-alias') &&
    item.isExported !== true &&
    !isQualifiedPrivateLabelName(item.name) &&
    item.span.sourceUnitRelation === 'import' &&
    item.span.sourceUnit !== undefined
  );
}

function qualifyPrivateLabelName(sourceUnit: string, name: string): string {
  return `${PRIVATE_LABEL_PREFIX}${sourceUnit}\0${name}`;
}

function privateLabelsForItem(
  item: SourceItem,
  labelsByUnit: ReadonlyMap<string, ReadonlyMap<string, string>>,
  exactNonPrivateNamesByUnit: ReadonlyMap<string, ReadonlySet<string>>,
  lowerNonPrivateNamesByUnit: ReadonlyMap<string, ReadonlySet<string>>,
): PrivateLabelScope | undefined {
  const sourceUnit = item.span.sourceUnit;
  if (item.span.sourceUnitRelation !== 'import' || sourceUnit === undefined) return undefined;
  const map = labelsByUnit.get(sourceUnit);
  if (map === undefined || map.size === 0) return undefined;
  return {
    labels: map,
    exactNonPrivateNames: exactNonPrivateNamesByUnit.get(sourceUnit) ?? new Set<string>(),
    lowerNonPrivateNames: lowerNonPrivateNamesByUnit.get(sourceUnit) ?? new Set<string>(),
  };
}

function qualifySourceItem(
  item: SourceItem,
  labelsByUnit: ReadonlyMap<string, ReadonlyMap<string, string>>,
  exactNonPrivateNamesByUnit: ReadonlyMap<string, ReadonlySet<string>>,
  lowerNonPrivateNamesByUnit: ReadonlyMap<string, ReadonlySet<string>>,
): SourceItem {
  const privateScope = privateLabelsForItem(
    item,
    labelsByUnit,
    exactNonPrivateNamesByUnit,
    lowerNonPrivateNamesByUnit,
  );
  if (privateScope === undefined) return item;
  return qualifySourceItemWithScope(item, privateScope);
}

function qualifySourceItemWithScope(item: SourceItem, privateScope: PrivateLabelScope): SourceItem {
  switch (item.kind) {
    case 'label':
      return { ...item, name: privateScope.labels.get(item.name) ?? item.name };
    case 'equ':
      return {
        ...item,
        name: privateScope.labels.get(item.name) ?? item.name,
        expression: qualifyExpression(item.expression, privateScope),
      };
    case 'org':
    case 'binfrom':
    case 'binto':
      return { ...item, expression: qualifyExpression(item.expression, privateScope) };
    case 'db':
      return { ...item, values: item.values.map((value) => qualifyDataValue(value, privateScope)) };
    case 'dw':
      return {
        ...item,
        values: item.values.map((value) => qualifyExpression(value, privateScope)),
      };
    case 'ds':
      return {
        ...item,
        size: qualifyExpression(item.size, privateScope),
        ...(item.fill !== undefined ? { fill: qualifyExpression(item.fill, privateScope) } : {}),
      };
    case 'align':
      return { ...item, alignment: qualifyExpression(item.alignment, privateScope) };
    case 'instruction':
      return {
        ...item,
        instruction: qualifyInstruction(item.instruction, privateScope),
      };
    case 'enum':
      return { ...item, name: privateScope.labels.get(item.name) ?? item.name };
    case 'type':
      return {
        ...item,
        name: privateScope.labels.get(item.name) ?? item.name,
        fields: item.fields.map((field) =>
          field.typeExpr === undefined
            ? field
            : { ...field, typeExpr: qualifyTypeExpr(field.typeExpr, privateScope) },
        ),
      };
    case 'type-alias':
      return {
        ...item,
        name: privateScope.labels.get(item.name) ?? item.name,
        typeExpr: qualifyTypeExpr(item.typeExpr, privateScope),
      };
    case 'comment':
    case 'routine':
    case 'contracts-policy':
    case 'rc-ignore':
    case 'expect-out':
    case 'end':
    case 'string-data':
      return item;
  }
}

function qualifyTypeExpr(
  typeExpr: import('../model/expression.js').TypeExpr,
  privateScope: PrivateLabelScope,
): import('../model/expression.js').TypeExpr {
  return {
    ...typeExpr,
    name: privateScope.labels.get(typeExpr.name) ?? typeExpr.name,
  };
}

function qualifyDataValue(value: DataValue, privateScope: PrivateLabelScope): DataValue {
  return value.kind === 'string-fragment' ? value : qualifyExpression(value, privateScope);
}

function qualifyInstruction(
  instruction: Z80Instruction,
  privateScope: PrivateLabelScope,
): Z80Instruction {
  switch (instruction.mnemonic) {
    case 'ld-a-imm':
    case 'jp':
    case 'call':
    case 'jr':
    case 'djnz':
    case 'jp-cc':
    case 'call-cc':
    case 'jr-cc':
      return {
        ...instruction,
        expression: qualifyExpression(instruction.expression, privateScope),
      };
    case 'ld':
      return {
        ...instruction,
        target: qualifyOperand(instruction.target, privateScope),
        source: qualifyOperand(instruction.source, privateScope),
      };
    case 'in':
    case 'out':
      return instruction.port.kind === 'imm'
        ? {
            ...instruction,
            port: {
              ...instruction.port,
              expression: qualifyExpression(instruction.port.expression, privateScope),
            },
          }
        : instruction;
    case 'inc':
    case 'dec':
      return 'displacement' in instruction.operand
        ? {
            ...instruction,
            operand: {
              ...instruction.operand,
              displacement: qualifyExpression(instruction.operand.displacement, privateScope),
            },
          }
        : instruction;
    case 'bit':
    case 'res':
    case 'set':
      return {
        ...instruction,
        bit:
          typeof instruction.bit === 'number'
            ? instruction.bit
            : qualifyExpression(instruction.bit, privateScope),
        operand:
          'displacement' in instruction.operand
            ? {
                ...instruction.operand,
                displacement: qualifyExpression(instruction.operand.displacement, privateScope),
              }
            : instruction.operand,
      };
    case 'rlc':
    case 'rrc':
    case 'rl':
    case 'rr':
    case 'sla':
    case 'sra':
    case 'sll':
    case 'sls':
    case 'srl':
      return 'displacement' in instruction.operand
        ? {
            ...instruction,
            operand: {
              ...instruction.operand,
              displacement: qualifyExpression(instruction.operand.displacement, privateScope),
            },
          }
        : instruction;
    case 'add':
      if ('source' in instruction && 'target' in instruction) {
        return instruction;
      }
      return 'source' in instruction
        ? { ...instruction, source: qualifyOperand(instruction.source, privateScope) }
        : instruction;
    case 'adc':
    case 'sbc':
    case 'sub':
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return { ...instruction, source: qualifyOperand(instruction.source, privateScope) };
    default:
      return instruction;
  }
}

function qualifyOperand(operand: Z80Operand, privateScope: PrivateLabelScope): Z80Operand {
  switch (operand.kind) {
    case 'mem-abs':
    case 'imm':
      return { ...operand, expression: qualifyExpression(operand.expression, privateScope) };
    case 'indexed':
      return { ...operand, displacement: qualifyExpression(operand.displacement, privateScope) };
    default:
      return operand;
  }
}

function qualifyExpression(expression: Expression, privateScope: PrivateLabelScope): Expression {
  switch (expression.kind) {
    case 'symbol':
      return {
        ...expression,
        name: lookupPrivateLabel(privateScope, expression.name) ?? expression.name,
      };
    case 'byte-function':
    case 'unary':
      return { ...expression, expression: qualifyExpression(expression.expression, privateScope) };
    case 'binary':
      return {
        ...expression,
        left: qualifyExpression(expression.left, privateScope),
        right: qualifyExpression(expression.right, privateScope),
      };
    case 'layout-cast':
      return {
        ...expression,
        typeExpr: qualifyTypeExpr(expression.typeExpr, privateScope),
        base: qualifyExpression(expression.base, privateScope),
        path: expression.path.map((part) =>
          part.kind === 'index'
            ? { ...part, expression: qualifyExpression(part.expression, privateScope) }
            : part,
        ),
      };
    case 'number':
    case 'current-location':
      return expression;
    case 'sizeof':
    case 'type-size':
      return { ...expression, typeExpr: qualifyTypeExpr(expression.typeExpr, privateScope) };
    case 'offset':
      return { ...expression, typeExpr: qualifyTypeExpr(expression.typeExpr, privateScope) };
  }
}

function lookupPrivateLabel(privateScope: PrivateLabelScope, name: string): string | undefined {
  const exact = privateScope.labels.get(name);
  return exact;
}
