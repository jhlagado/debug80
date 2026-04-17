/**
 * @file Built-in project kit definitions used by scaffolding.
 */

import type { BundledAssetReference } from '../debug/types';

export type ScaffoldPlatform = 'simple' | 'tec1' | 'tec1g';

export type BuiltInProjectKit = {
  profileName: string;
  platform: Exclude<ScaffoldPlatform, 'simple'>;
  bundledAssets: Record<string, BundledAssetReference>;
  romHexDestination: string;
  listingDestination?: string;
  sourceRoots: string[];
};

const BUILT_IN_PROJECT_KITS: Record<Exclude<ScaffoldPlatform, 'simple'>, BuiltInProjectKit> = {
  tec1: {
    profileName: 'mon1b',
    platform: 'tec1',
    bundledAssets: {
      romHex: {
        bundleId: 'tec1/mon1b/v1',
        path: 'mon-1b.bin',
        destination: 'roms/tec1/mon1b/mon-1b.bin',
      },
      listing: {
        bundleId: 'tec1/mon1b/v1',
        path: 'mon-1b.lst',
        destination: 'roms/tec1/mon1b/mon-1b.lst',
      },
    },
    romHexDestination: 'roms/tec1/mon1b/mon-1b.bin',
    listingDestination: 'roms/tec1/mon1b/mon-1b.lst',
    sourceRoots: ['src', 'roms/tec1/mon1b'],
  },
  tec1g: {
    profileName: 'mon3',
    platform: 'tec1g',
    bundledAssets: {
      romHex: {
        bundleId: 'tec1g/mon3/v1',
        path: 'mon3.bin',
        destination: 'roms/tec1g/mon3/mon3.bin',
      },
      listing: {
        bundleId: 'tec1g/mon3/v1',
        path: 'mon3.lst',
        destination: 'roms/tec1g/mon3/mon3.lst',
      },
    },
    romHexDestination: 'roms/tec1g/mon3/mon3.bin',
    listingDestination: 'roms/tec1g/mon3/mon3.lst',
    sourceRoots: ['src', 'roms/tec1g/mon3'],
  },
};

export function resolveBuiltInProjectKit(platform: Exclude<ScaffoldPlatform, 'simple'>): BuiltInProjectKit {
  return BUILT_IN_PROJECT_KITS[platform];
}
