import type { SourceItem } from '../model/source-item.js';
import type { SymbolEntry } from '../outputs/types.js';

/**
 * Collects output-facing symbol entries (labels, constants, enum members)
 * from the original and qualified item lists, resolving values against the
 * assembled symbol table.
 */
export function collectSymbolEntries(
  originalItems: readonly SourceItem[],
  qualifiedItems: readonly SourceItem[],
  resolvedSymbols: Readonly<Record<string, number>>,
): SymbolEntry[] {
  const map = new Map<string, SymbolEntry>();
  const pairs = originalItems.flatMap((original, index) => {
    const qualified = qualifiedItems[index];
    return qualified === undefined ? [] : [{ original, qualified }];
  });
  const displayCounts = new Map<string, number>();
  for (const pair of pairs) {
    for (const name of declarationDisplayNames(pair.original, pair.qualified)) {
      displayCounts.set(name, (displayCounts.get(name) ?? 0) + 1);
    }
  }
  for (const pair of pairs) {
    appendSymbolEntry(map, pair.original, pair.qualified, resolvedSymbols, displayCounts);
  }
  return [...map.values()];
}

function declarationDisplayNames(original: SourceItem, qualified: SourceItem): readonly string[] {
  if (original.kind === 'label' && qualified.kind === 'label') {
    return [baseLabelDisplayName(original.name, qualified.name)];
  }
  if (original.kind === 'equ' && qualified.kind === 'equ') return [original.name];
  if (original.kind === 'enum' && qualified.kind === 'enum') {
    return original.members.map((member) => `${original.name}.${member}`);
  }
  return [];
}

function appendSymbolEntry(
  map: Map<string, SymbolEntry>,
  original: SourceItem,
  qualified: SourceItem,
  resolvedSymbols: Readonly<Record<string, number>>,
  displayCounts: ReadonlyMap<string, number>,
): void {
  if (original.kind === 'equ' && qualified.kind === 'equ') {
    const value = resolvedSymbols[qualified.name];
    if (value !== undefined) {
      const identity = declarationIdentity(original, original.name, 'constant');
      map.set(identity, {
        kind: 'constant',
        name: original.name,
        identity,
        value,
        file: original.span.sourceName,
        line: original.span.line,
        scope: declarationScope(original),
        visibility: declarationVisibility(original),
        sourceUnit: original.span.sourceUnit ?? original.span.sourceName,
        ...(needsSourceQualifier(original.name, original, displayCounts)
          ? { needsSourceQualifier: true }
          : {}),
      });
    }
    return;
  }

  if (original.kind === 'label' && qualified.kind === 'label') {
    const address = resolvedSymbols[qualified.name];
    if (address !== undefined) {
      const baseName = baseLabelDisplayName(original.name, qualified.name);
      const identity = declarationIdentity(original, baseName, 'label');
      map.set(identity, {
        kind: 'label',
        name: baseName,
        identity,
        address,
        file: original.span.sourceName,
        line: original.span.line,
        scope: declarationScope(original),
        visibility: declarationVisibility(original),
        sourceUnit: original.span.sourceUnit ?? original.span.sourceName,
        ...(needsSourceQualifier(baseName, original, displayCounts)
          ? { needsSourceQualifier: true }
          : {}),
      });
    }
    return;
  }

  if (original.kind === 'enum' && qualified.kind === 'enum') {
    for (const member of original.members) {
      const fullName = `${original.name}.${member}`;
      const qualifiedName = `${qualified.name}.${member}`;
      const value = resolvedSymbols[qualifiedName];
      if (value !== undefined) {
        const identity = declarationIdentity(original, fullName, 'constant');
        map.set(identity, {
          kind: 'constant',
          name: fullName,
          identity,
          value,
          file: original.span.sourceName,
          line: original.span.line,
          scope: declarationScope(original),
          visibility: declarationVisibility(original),
          sourceUnit: original.span.sourceUnit ?? original.span.sourceName,
          ...(needsSourceQualifier(fullName, original, displayCounts)
            ? { needsSourceQualifier: true }
            : {}),
        });
      }
    }
  }
}

function baseLabelDisplayName(originalName: string, qualifiedName: string): string {
  const parts = qualifiedName.split('\0');
  const owner = parts.find((part) => part.startsWith('@'));
  return originalName.startsWith('_') && owner !== undefined
    ? `${owner.slice(1)}.${originalName}`
    : originalName;
}

function needsSourceQualifier(
  baseName: string,
  item: SourceItem,
  displayCounts: ReadonlyMap<string, number>,
): boolean {
  return (displayCounts.get(baseName) ?? 0) > 1 && declarationVisibility(item) !== 'exported';
}

function declarationIdentity(item: SourceItem, qualifiedName: string, kind: string): string {
  return `${item.span.sourceName}:${item.span.line}:${item.span.column}:${kind}:${qualifiedName.replaceAll('\0', '|')}`;
}

function declarationVisibility(item: SourceItem): 'exported' | 'source' | 'local' {
  if (item.kind === 'label' && item.name.startsWith('_')) return 'local';
  if ('isExported' in item && item.isExported === true) return 'exported';
  return 'source';
}

function declarationScope(item: SourceItem): 'global' | 'local' {
  return declarationVisibility(item) === 'local' ? 'local' : 'global';
}
