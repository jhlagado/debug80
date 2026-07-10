import type { SourceItem } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';

/**
 * Explicit local-label ownership.
 *
 * Every non-local label establishes an owner. A label beginning with `_`
 * belongs to the nearest preceding non-local label in the same privacy unit.
 * `@` export syntax has already been normalized away by this stage and has no
 * effect on local ownership.
 *
 * The privacy unit is the imported source unit for `.import`ed items;
 * the root file and everything textually `.include`d into it share one
 * root unit, matching include semantics.
 */

const ROOT_UNIT_KEY = '\0<root>';

export interface RoutineScope {
  /** Privacy unit the item belongs to (import unit, or the shared root unit). */
  readonly unitKey: string;
  /** Owning non-local symbol name, or undefined before the first owner. */
  readonly routine: string | undefined;
}

export interface RoutineLocalLabelModel {
  /** Scope of each item, index-aligned with the input items. */
  readonly scopes: readonly RoutineScope[];
  /**
   * Routine-local label names per scope key. Labels excluded here (same
   * name defined twice in one routine, or a name that also exists as an
   * outer declaration) stay unqualified so the ordinary duplicate-symbol
   * diagnostics surface.
   */
  readonly localsByScope: ReadonlyMap<string, ReadonlySet<string>>;
  /** Exact names resolvable outside any routine scope (labels, equs, enum members). */
  readonly outerExactNames: ReadonlySet<string>;
  /** Lower-cased outer names, for the case-insensitive resolution fallback. */
  readonly outerLowerNames: ReadonlySet<string>;
}

export function privacyUnitKeyFromSpan(span: SourceSpan): string {
  return span.sourceUnitRelation === 'import' && span.sourceUnit !== undefined
    ? span.sourceUnit
    : ROOT_UNIT_KEY;
}

export function privacyUnitKey(item: SourceItem): string {
  return privacyUnitKeyFromSpan(item.span);
}

export function routineScopeKey(scope: RoutineScope): string {
  return `${scope.unitKey}\0@${scope.routine ?? ''}`;
}

export function assignRoutineScopes(items: readonly SourceItem[]): readonly RoutineScope[] {
  const currentOwnerByUnit = new Map<string, string>();
  return items.map((item) => {
    const unitKey = privacyUnitKey(item);
    if (item.kind === 'label' && !item.name.startsWith('_')) {
      currentOwnerByUnit.set(unitKey, item.name);
      return { unitKey, routine: item.name };
    }
    return { unitKey, routine: currentOwnerByUnit.get(unitKey) };
  });
}

export function isRoutineLocalCandidate(
  item: SourceItem,
  scope: RoutineScope,
): item is Extract<SourceItem, { readonly kind: 'label' }> {
  return (
    item.kind === 'label' &&
    item.origin !== 'generated' &&
    item.name.startsWith('_') &&
    scope.routine !== undefined
  );
}

export function buildRoutineLocalLabelModel(items: readonly SourceItem[]): RoutineLocalLabelModel {
  const scopes = assignRoutineScopes(items);

  const candidateCounts = new Map<string, number>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const scope = scopes[index]!;
    if (!isRoutineLocalCandidate(item, scope)) continue;
    const key = `${routineScopeKey(scope)}\0${item.name}`;
    candidateCounts.set(key, (candidateCounts.get(key) ?? 0) + 1);
  }

  // Global bail sets for reference resolution: a reference that matches a
  // name resolvable outside any routine scope must never be captured by a
  // case-insensitive routine-local fallback.
  const outerExactNames = new Set<string>();
  const outerLowerNames = new Set<string>();
  // Per-unit declaration names for conflict exclusion: a routine-local
  // label may shadow names from other units, but a clash inside its own
  // privacy unit stays unqualified so duplicate-symbol diagnostics surface
  // (mirroring the imported file-private rules).
  const unitExactNames = new Map<string, Set<string>>();
  const unitDeclarationLowerNames = new Map<string, Set<string>>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const scope = scopes[index]!;
    if (isRoutineLocalCandidate(item, scope)) continue;
    for (const name of outerSymbolNames(item)) {
      outerExactNames.add(name);
      outerLowerNames.add(name.toLowerCase());
      const names = unitExactNames.get(scope.unitKey) ?? new Set<string>();
      names.add(name);
      unitExactNames.set(scope.unitKey, names);
    }
    for (const name of caseInsensitiveDeclarationNames(item)) {
      outerLowerNames.add(name.toLowerCase());
      const names = unitDeclarationLowerNames.get(scope.unitKey) ?? new Set<string>();
      names.add(name.toLowerCase());
      unitDeclarationLowerNames.set(scope.unitKey, names);
    }
  }

  const localsByScope = new Map<string, Set<string>>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const scope = scopes[index]!;
    if (!isRoutineLocalCandidate(item, scope)) continue;
    const scopeKey = routineScopeKey(scope);
    if ((candidateCounts.get(`${scopeKey}\0${item.name}`) ?? 0) > 1) continue;
    if (unitExactNames.get(scope.unitKey)?.has(item.name) === true) continue;
    if (unitDeclarationLowerNames.get(scope.unitKey)?.has(item.name.toLowerCase()) === true) {
      continue;
    }
    const locals = localsByScope.get(scopeKey) ?? new Set<string>();
    locals.add(item.name);
    localsByScope.set(scopeKey, locals);
  }

  return { scopes, localsByScope, outerExactNames, outerLowerNames };
}

function outerSymbolNames(item: SourceItem): readonly string[] {
  switch (item.kind) {
    case 'label':
    case 'equ':
      return [item.name];
    case 'enum':
      return item.members.map((member) => `${item.name}.${member}`);
    default:
      return [];
  }
}

function caseInsensitiveDeclarationNames(item: SourceItem): readonly string[] {
  switch (item.kind) {
    case 'enum':
      return [item.name, ...item.members.map((member) => `${item.name}.${member}`)];
    case 'type':
    case 'type-alias':
      return [item.name];
    default:
      return [];
  }
}
