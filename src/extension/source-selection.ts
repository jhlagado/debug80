/**
 * @file Source file selection helpers for Debug80 commands.
 */

import * as path from 'path';

export type SourcePickItem = {
  label: string;
  description?: string;
};

export function resolveResourceSourceSelection(
  resourcePath: string | undefined,
  folderPath: string,
  candidates: readonly string[]
): string | undefined {
  if (resourcePath === undefined) {
    return undefined;
  }
  const relative = path.relative(folderPath, resourcePath);
  if (
    relative.length === 0 ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }
  const normalized = relative.split(path.sep).join('/');
  return candidates.includes(normalized) ? normalized : undefined;
}

export function buildSourcePickItems(
  candidates: readonly string[],
  currentSource: string | undefined
): SourcePickItem[] {
  return candidates.map((candidate) => ({
    label: candidate,
    ...(candidate === currentSource ? { description: 'current program file' } : {}),
  }));
}
