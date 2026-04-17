/**
 * @file Built-in project kit metadata and starter templates.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { BUNDLED_MON1B_V1_REL, BUNDLED_MON3_V1_REL } from './bundle-materialize';

export type ScaffoldPlatform = 'simple' | 'tec1' | 'tec1g';
export type StarterLanguage = 'asm' | 'zax';
export type ProjectKitId = 'simple/default' | 'tec1/mon1b' | 'tec1/classic-2k' | 'tec1g/mon3';

export type ProjectKit = {
  id: ProjectKitId;
  platform: ScaffoldPlatform;
  profileName: string;
  label: string;
  description: string;
  appStart: number;
  entry: number;
  starterTemplates: Record<StarterLanguage, string>;
  bundledProfile?: {
    bundleRelPath: string;
    romPath: string;
    listingPath?: string;
    sourceRoots: string[];
  };
};

const PROJECT_KITS: Record<ProjectKitId, ProjectKit> = {
  'simple/default': {
    id: 'simple/default',
    platform: 'simple',
    profileName: 'default',
    label: 'Simple / Default',
    description: 'Generic Debug80 RAM program kit at 0x0900.',
    appStart: 0x0900,
    entry: 0,
    starterTemplates: {
      asm: 'simple/default/starter.asm',
      zax: 'simple/default/starter.zax',
    },
  },
  'tec1/mon1b': {
    id: 'tec1/mon1b',
    platform: 'tec1',
    profileName: 'mon1b',
    label: 'TEC-1 / MON-1B',
    description: 'TEC-1 monitor-first profile with user code at 0x0800.',
    appStart: 0x0800,
    entry: 0,
    starterTemplates: {
      asm: 'tec1/mon1b/starter.asm',
      zax: 'tec1/mon1b/starter.zax',
    },
    bundledProfile: {
      bundleRelPath: BUNDLED_MON1B_V1_REL,
      romPath: 'roms/tec1/mon1b/mon-1b.bin',
      listingPath: 'roms/tec1/mon1b/mon-1b.lst',
      sourceRoots: ['src', 'roms/tec1/mon1b'],
    },
  },
  'tec1/classic-2k': {
    id: 'tec1/classic-2k',
    platform: 'tec1',
    profileName: 'classic-2k',
    label: 'TEC-1 / Classic 2K',
    description: 'Classic TEC-1 RAM-program profile at 0x0900.',
    appStart: 0x0900,
    entry: 0,
    starterTemplates: {
      asm: 'tec1/classic-2k/starter.asm',
      zax: 'tec1/classic-2k/starter.zax',
    },
  },
  'tec1g/mon3': {
    id: 'tec1g/mon3',
    platform: 'tec1g',
    profileName: 'mon3',
    label: 'TEC-1G / MON-3',
    description: 'TEC-1G monitor-first profile with user code at 0x4000.',
    appStart: 0x4000,
    entry: 0,
    starterTemplates: {
      asm: 'tec1g/mon3/starter.asm',
      zax: 'tec1g/mon3/starter.zax',
    },
    bundledProfile: {
      bundleRelPath: BUNDLED_MON3_V1_REL,
      romPath: 'roms/tec1g/mon3/mon3.bin',
      listingPath: 'roms/tec1g/mon3/mon3.lst',
      sourceRoots: ['src', 'roms/tec1g/mon3'],
    },
  },
};

export type ProjectKitChoice = vscode.QuickPickItem & {
  kit: ProjectKit;
};

export function listProjectKits(preselectedPlatform?: string): ProjectKit[] {
  const normalized = preselectedPlatform?.trim().toLowerCase();
  const kits = Object.values(PROJECT_KITS);
  if (normalized === 'simple' || normalized === 'tec1' || normalized === 'tec1g') {
    const filtered = kits.filter((kit) => kit.platform === normalized);
    if (filtered.length > 0) {
      return filtered;
    }
  }
  return kits;
}

export function getProjectKitById(id: string | undefined): ProjectKit | undefined {
  if (id === undefined) {
    return undefined;
  }
  return PROJECT_KITS[id as ProjectKitId];
}

export function getProjectKitChoices(preselectedPlatform?: string): ProjectKitChoice[] {
  return listProjectKits(preselectedPlatform).map((kit) => ({
    label: kit.label,
    description: kit.description,
    kit,
  }));
}

export function resolveProjectKitTemplatePath(
  kit: ProjectKit,
  language: StarterLanguage
): string {
  return path.join('resources', 'project-kits', kit.starterTemplates[language]);
}

export function readProjectKitStarterTemplate(
  extensionUri: vscode.Uri,
  kit: ProjectKit,
  language: StarterLanguage
): string {
  const templatePath = path.join(extensionUri.fsPath, resolveProjectKitTemplatePath(kit, language));
  return fs.readFileSync(templatePath, 'utf-8');
}
