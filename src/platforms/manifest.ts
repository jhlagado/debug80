/**
 * @fileoverview Lazy platform manifest for debug adapter platform providers.
 */

import { normalizePlatformName } from '../debug/launch-args';
import type { LaunchRequestArguments } from '../debug/types';
import type { PlatformKind } from '../debug/program-loader';
import type { ResolvedPlatformProvider } from './provider';

type PlatformProviderLoader = (
  args: LaunchRequestArguments
) => Promise<ResolvedPlatformProvider>;

const platformLoaders = new Map<PlatformKind, PlatformProviderLoader>([
  [
    'simple',
    async (args): Promise<ResolvedPlatformProvider> => {
      const { createSimplePlatformProvider } = await import('./simple/provider.js');
      return createSimplePlatformProvider(args);
    },
  ],
  [
    'tec1',
    async (args): Promise<ResolvedPlatformProvider> => {
      const { createTec1PlatformProvider } = await import('./tec1/provider.js');
      return createTec1PlatformProvider(args);
    },
  ],
  [
    'tec1g',
    async (args): Promise<ResolvedPlatformProvider> => {
      const { createTec1gPlatformProvider } = await import('./tec1g/provider.js');
      return createTec1gPlatformProvider(args);
    },
  ],
]);

export function registerPlatform(
  platform: PlatformKind,
  loadProvider: PlatformProviderLoader
): void {
  platformLoaders.set(platform, loadProvider);
}

export function listPlatforms(): PlatformKind[] {
  return Array.from(platformLoaders.keys());
}

export async function resolvePlatformProvider(
  args: LaunchRequestArguments
): Promise<ResolvedPlatformProvider> {
  const platform = normalizePlatformName(args);
  const loadProvider = platformLoaders.get(platform);
  if (loadProvider === undefined) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return loadProvider(args);
}