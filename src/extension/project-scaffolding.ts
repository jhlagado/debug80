/**
 * @file Project scaffolding helpers for Debug80 workspaces.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensureDirExists, inferDefaultTarget } from '../debug/config-utils';
import {
  DEBUG80_PROJECT_VERSION,
  findProjectConfigPath,
  listProjectSourceFiles,
} from './project-config';
import {
  TEC1G_RAM_END,
  TEC1G_RAM_START,
  TEC1G_ROM0_END,
  TEC1G_ROM0_START,
  TEC1G_ROM1_END,
  TEC1G_ROM1_START,
} from '../platforms/tec1g/constants';
import {
  getDefaultProjectKitForPlatform,
  getProjectKitChoices,
  readProjectKitStarterTemplate,
  type ProjectKit,
  type ScaffoldPlatform,
  type StarterLanguage,
} from './project-kits';
import { materializeBundledRom } from './bundle-materialize';

type ScaffoldPlan = {
  kit: ProjectKit;
  targetName: string;
  sourceFile: string;
  outputDir: string;
  artifactBase: string;
  starterLanguage?: StarterLanguage;
  starterFile?: {
    path: string;
  };
};

type SourceChoice =
  | { kind: 'existing'; sourceFile: string }
  | { kind: 'starter'; language: StarterLanguage };

function createSimpleDefaults(): Record<string, unknown> {
  return {
    regions: [
      { start: 0, end: 2047, kind: 'rom' },
      { start: 2048, end: 65535, kind: 'ram' },
    ],
    appStart: 0x0900,
    entry: 0,
  };
}

function createTec1Defaults(appStart: number): Record<string, unknown> {
  return {
    regions: [
      { start: 0, end: 2047, kind: 'rom' },
      { start: 2048, end: 4095, kind: 'ram' },
    ],
    appStart,
    entry: 0,
  };
}

function createTec1gDefaults(appStart: number): Record<string, unknown> {
  return {
    regions: [
      { start: TEC1G_ROM0_START, end: TEC1G_ROM0_END, kind: 'rom' },
      { start: TEC1G_RAM_START, end: TEC1G_RAM_END, kind: 'ram' },
      { start: TEC1G_ROM1_START, end: TEC1G_ROM1_END, kind: 'rom' },
    ],
    appStart,
    entry: 0,
  };
}

function platformDisplayName(platform: ScaffoldPlatform): string {
  if (platform === 'tec1') {
    return 'TEC-1';
  }
  if (platform === 'tec1g') {
    return 'TEC-1G';
  }
  return 'Simple';
}

export function createStarterSourceContent(
  extensionUri: vscode.Uri,
  kit: ProjectKit,
  language: StarterLanguage
): string {
  return readProjectKitStarterTemplate(extensionUri, kit, language);
}

export function createDefaultProjectConfig(plan: ScaffoldPlan): {
  projectVersion: typeof DEBUG80_PROJECT_VERSION;
  projectPlatform: ScaffoldPlatform;
  defaultTarget: string;
  defaultProfile: string;
  profiles: Record<string, Record<string, unknown>>;
  targets: Record<string, Record<string, unknown>>;
} {
  const profileConfig: Record<string, unknown> = {
    platform: plan.kit.platform,
  };
  if (plan.kit.description.length > 0) {
    profileConfig.description = plan.kit.description;
  }
  if (plan.kit.bundledProfile !== undefined) {
    profileConfig.bundledAssets = {
      romHex: {
        bundleId: plan.kit.bundledProfile.bundleRelPath,
        path: path.basename(plan.kit.bundledProfile.romPath),
        destination: plan.kit.bundledProfile.romPath,
      },
      ...(plan.kit.bundledProfile.listingPath !== undefined
        ? {
            listing: {
              bundleId: plan.kit.bundledProfile.bundleRelPath,
              path: path.basename(plan.kit.bundledProfile.listingPath),
              destination: plan.kit.bundledProfile.listingPath,
            },
          }
        : {}),
      ...(plan.kit.bundledProfile.sourcePath !== undefined
        ? {
            source: {
              bundleId: plan.kit.bundledProfile.bundleRelPath,
              path: path.basename(plan.kit.bundledProfile.sourcePath),
              destination: plan.kit.bundledProfile.sourcePath,
            },
          }
        : {}),
    };
  }

  const targetConfig: Record<string, unknown> = {
    sourceFile: plan.sourceFile,
    outputDir: plan.outputDir,
    artifactBase: plan.artifactBase,
    platform: plan.kit.platform,
    profile: plan.kit.profileName,
  };

  if (plan.kit.platform === 'tec1') {
    const base = createTec1Defaults(plan.kit.appStart);
    targetConfig.tec1 = plan.kit.bundledProfile !== undefined
      ? {
          ...base,
          romHex: plan.kit.bundledProfile.romPath,
          ...(plan.kit.bundledProfile.listingPath !== undefined
            ? { extraListings: [plan.kit.bundledProfile.listingPath] }
            : {}),
          sourceRoots: plan.kit.bundledProfile.sourceRoots,
        }
      : base;
  } else if (plan.kit.platform === 'tec1g') {
    const base = createTec1gDefaults(plan.kit.appStart);
    targetConfig.tec1g = plan.kit.bundledProfile !== undefined
      ? {
          ...base,
          romHex: plan.kit.bundledProfile.romPath,
          ...(plan.kit.bundledProfile.listingPath !== undefined
            ? { extraListings: [plan.kit.bundledProfile.listingPath] }
            : {}),
          sourceRoots: plan.kit.bundledProfile.sourceRoots,
        }
      : base;
  } else {
    targetConfig.simple = createSimpleDefaults();
  }

  return {
    projectVersion: DEBUG80_PROJECT_VERSION,
    projectPlatform: plan.kit.platform,
    defaultProfile: plan.kit.profileName,
    defaultTarget: plan.targetName,
    profiles: {
      [plan.kit.profileName]: profileConfig,
    },
    targets: {
      [plan.targetName]: targetConfig,
    },
  };
}

async function chooseProjectKit(preselectedPlatform?: string): Promise<ProjectKit | undefined> {
  const items = getProjectKitChoices(preselectedPlatform);
  if (items.length === 1) {
    return items[0]?.kit;
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder:
      preselectedPlatform !== undefined && preselectedPlatform.trim().length > 0
        ? `Choose a profile kit for ${platformDisplayName(preselectedPlatform.trim().toLowerCase() as ScaffoldPlatform)}`
        : 'Choose the profile kit for this Debug80 project',
    matchOnDescription: true,
  });

  return picked?.kit;
}

export function createDefaultLaunchConfig(): Record<string, unknown> {
  return {
    version: '0.2.0',
    configurations: [
      {
        name: 'Debug80: Current Project',
        type: 'z80',
        request: 'launch',
      },
    ],
  };
}

export async function scaffoldProject(
  folder: vscode.WorkspaceFolder,
  includeLaunch: boolean,
  extensionUri?: vscode.Uri,
  preselectedPlatform?: string
): Promise<boolean> {
  const workspaceRoot = folder.uri.fsPath;
  const vscodeDir = path.join(workspaceRoot, '.vscode');
  const configPath = path.join(workspaceRoot, 'debug80.json');
  const launchPath = path.join(vscodeDir, 'launch.json');
  const configExists = findProjectConfigPath(folder) !== undefined;

  const inferred = inferDefaultTarget(workspaceRoot);
  const plan = configExists
    ? undefined
    : await buildScaffoldPlan(folder, inferred, preselectedPlatform);

  if (!configExists && plan === undefined) {
    return false;
  }

  ensureDirExists(
    path.join(workspaceRoot, path.dirname(plan?.sourceFile ?? inferred.sourceFile))
  );
  ensureDirExists(path.join(workspaceRoot, plan?.outputDir ?? inferred.outputDir));

  let created = false;

  if (!configExists) {
    if (plan === undefined) {
      return false;
    }

    const defaultConfig = createDefaultProjectConfig(plan);

    try {
      if (plan.starterFile !== undefined) {
        const starterPath = path.join(workspaceRoot, plan.starterFile.path);
        ensureDirExists(path.dirname(starterPath));
        if (!fs.existsSync(starterPath)) {
          fs.writeFileSync(
            starterPath,
            createStarterSourceContent(
              extensionUri ?? vscode.Uri.file(process.cwd()),
              plan.kit,
              plan.starterLanguage ?? 'asm'
            )
          );
        }
      }
      fs.writeFileSync(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`);
      if (plan.kit.bundledProfile !== undefined && extensionUri !== undefined) {
        const romResult = materializeBundledRom(
          extensionUri,
          workspaceRoot,
          plan.kit.bundledProfile.bundleRelPath
        );
        if (!romResult.ok) {
          void vscode.window.showWarningMessage(
            `Debug80: Project created but bundled ROM assets could not be installed: ${romResult.reason}`
          );
        }
      }
      void vscode.window.showInformationMessage(
        `Debug80: Created ${plan.kit.label} project in debug80.json targeting ${plan.sourceFile}.`
      );
      created = true;
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Debug80: Failed to write debug80.json: ${String(err)}`
      );
      return false;
    }
  } else if (!includeLaunch) {
    void vscode.window.showInformationMessage('Debug80 project config already exists.');
  }

  if (includeLaunch) {
    if (!fs.existsSync(launchPath)) {
      const launchConfig = createDefaultLaunchConfig();
      try {
        ensureDirExists(vscodeDir);
        fs.writeFileSync(launchPath, `${JSON.stringify(launchConfig, null, 2)}\n`);
        void vscode.window.showInformationMessage(
          'Debug80: Created .vscode/launch.json for the current-project workflow.'
        );
        created = true;
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Debug80: Failed to write .vscode/launch.json: ${String(err)}`
        );
        return created;
      }
    } else {
      void vscode.window.showInformationMessage(
        'Debug80: .vscode/launch.json already exists; not overwriting.'
      );
    }
  }

  return created;
}

async function buildScaffoldPlan(
  folder: vscode.WorkspaceFolder,
  inferred: { sourceFile: string; outputDir: string; artifactBase: string },
  preselectedPlatform?: string
): Promise<ScaffoldPlan | undefined> {
  const defaultKit = getDefaultProjectKitForPlatform(preselectedPlatform);
  if (defaultKit !== undefined) {
    const sourceFile = 'src/main.asm';
    const artifactBase = path.basename(sourceFile, path.extname(sourceFile)) || inferred.artifactBase;
    return {
      kit: defaultKit,
      targetName: artifactBase,
      sourceFile,
      outputDir: inferred.outputDir,
      artifactBase,
      starterLanguage: 'asm',
      starterFile: {
        path: sourceFile,
      },
    };
  }

  const kit = await chooseProjectKit(preselectedPlatform);
  if (kit === undefined) {
    return undefined;
  }

  const choice = await chooseEntrySource(folder, inferred.sourceFile);
  if (choice === undefined) {
    return undefined;
  }

  if (choice.kind === 'existing') {
    const sourceFile = choice.sourceFile;
    const artifactBase = path.basename(sourceFile, path.extname(sourceFile)) || inferred.artifactBase;
    return {
      kit,
      targetName: artifactBase,
      sourceFile,
      outputDir: inferred.outputDir,
      artifactBase,
    };
  }

  const sourceFile = choice.language === 'zax' ? 'src/main.zax' : 'src/main.asm';
  const artifactBase = path.basename(sourceFile, path.extname(sourceFile)) || inferred.artifactBase;
  return {
    kit,
    targetName: artifactBase,
    sourceFile,
    outputDir: inferred.outputDir,
    artifactBase,
    starterLanguage: choice.language,
    starterFile: {
      path: sourceFile,
    },
  };
}

async function chooseEntrySource(
  folder: vscode.WorkspaceFolder,
  inferredSourceFile: string
): Promise<SourceChoice | undefined> {
  const sourceFiles = listProjectSourceFiles(folder.uri.fsPath);
  const inferredExists = sourceFiles.includes(inferredSourceFile);
  if (sourceFiles.length === 1) {
    return { kind: 'existing', sourceFile: sourceFiles[0] ?? inferredSourceFile };
  }

  const items: Array<
    vscode.QuickPickItem & {
      choice: SourceChoice;
    }
  > = [
    ...sourceFiles.map((sourceFile) => ({
      label: sourceFile,
      ...(sourceFile === inferredSourceFile && inferredExists ? { description: 'suggested' } : {}),
      choice: { kind: 'existing', sourceFile } as SourceChoice,
    })),
    {
      label: 'Create ASM starter',
      description: 'Create src/main.asm with minimal starter code',
      choice: { kind: 'starter' as const, language: 'asm' as const },
    },
    {
      label: 'Create ZAX starter',
      description: 'Create src/main.zax with minimal starter code',
      choice: { kind: 'starter' as const, language: 'zax' as const },
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder:
      sourceFiles.length === 0
        ? 'Create a starter source file for this Debug80 project'
        : 'Choose the program file for this Debug80 project',
    matchOnDescription: true,
  });
  return picked?.choice;
}
