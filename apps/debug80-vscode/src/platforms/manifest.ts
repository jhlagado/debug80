/**
 * @fileoverview Lazy platform manifest for debug adapter platform providers.
 */

import { normalizePlatformName } from '../debug/launch-args';
import type { LaunchRequestArguments } from '../debug/session/types';
import type { PlatformKind } from '../debug/launch/program-loader';
import type { ResolvedPlatformProvider } from './provider';

type PlatformProviderLoader = (args: LaunchRequestArguments) => Promise<ResolvedPlatformProvider>;

export interface PlatformManifestEntry {
  id: PlatformKind;
  displayName: string;
  loadProvider: PlatformProviderLoader;
}

const platformEntries = new Map<PlatformKind, PlatformManifestEntry>([
  [
    'simple',
    {
      id: 'simple',
      displayName: 'Simple',
      loadProvider: async (args): Promise<ResolvedPlatformProvider> => {
        const { createSimplePlatformProvider } = await import('./simple/provider.js');
        return createSimplePlatformProvider(args);
      },
    },
  ],
  [
    'tec1',
    {
      id: 'tec1',
      displayName: 'TEC-1',
      loadProvider: async (args): Promise<ResolvedPlatformProvider> => {
        const { createTec1PlatformProvider } = await import('./tec1/provider.js');
        return createTec1PlatformProvider(args);
      },
    },
  ],
  [
    'tec1g',
    {
      id: 'tec1g',
      displayName: 'TEC-1G',
      loadProvider: async (args): Promise<ResolvedPlatformProvider> => {
        const { createTec1gPlatformProvider } = await import('./tec1g/provider.js');
        return createTec1gPlatformProvider(args);
      },
    },
  ],
]);

export function registerPlatform(entry: PlatformManifestEntry): void {
  platformEntries.set(entry.id, entry);
}

export function listPlatforms(): PlatformManifestEntry[] {
  return Array.from(platformEntries.values());
}

export async function resolvePlatformProvider(
  args: LaunchRequestArguments
): Promise<ResolvedPlatformProvider> {
  const platform = normalizePlatformName(args);
  const entry = platformEntries.get(platform);
  if (entry === undefined) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return entry.loadProvider(args);
}
