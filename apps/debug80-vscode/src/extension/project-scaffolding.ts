/**
 * @file Project scaffolding helpers for Debug80 workspaces.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensureDirExists, inferDefaultTarget } from '../debug/launch/config-utils';
import { DEBUG80_PROJECT_VERSION, findProjectConfigPath } from './project-config';
import { isTargetEntrySourcePath, listTargetSourceFiles } from './target-discovery';
import {
  TEC1G_RAM_END,
  TEC1G_RAM_START,
  TEC1G_ROM0_END,
  TEC1G_ROM0_START,
  TEC1G_ROM1_END,
  TEC1G_ROM1_START,
} from '@jhlagado/debug80-runtime/platforms/tec1g/constants';
import {
  getDefaultProjectKitForPlatform,
  getProjectKitChoices,
  readProjectKitStarterTemplate,
  type ProjectKit,
  type ScaffoldPlatform,
  type StarterLanguage,
} from './project-kits';
import { ensureDebug80Gitignore } from './project-gitignore';

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
  /** Create the project with an empty targets map; the user picks a program file later. */
  noTarget?: true;
};

type SourceChoice =
  | { kind: 'existing'; sourceFile: string }
  | { kind: 'starter'; language: StarterLanguage }
  | { kind: 'none' };

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

function getKitSourceRoots(kit: ProjectKit): string[] | undefined {
  return kit.sourceRoots ?? kit.bundledProfile?.sourceRoots;
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
  defaultTarget?: string;
  defaultProfile: string;
  azm: { symbolCase: 'strict' };
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
      ...(plan.kit.bundledProfile.debugMapPath !== undefined
        ? {
            debugMap: {
              bundleId: plan.kit.bundledProfile.bundleRelPath,
              path: path.basename(plan.kit.bundledProfile.debugMapPath),
              destination: plan.kit.bundledProfile.debugMapPath,
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
    ...(getKitSourceRoots(plan.kit) !== undefined
      ? { sourceRoots: getKitSourceRoots(plan.kit) }
      : {}),
  };

  if (plan.kit.platform === 'tec1') {
    const base = createTec1Defaults(plan.kit.appStart);
    targetConfig.tec1 =
      plan.kit.bundledProfile !== undefined
        ? {
            ...base,
            romHex: plan.kit.bundledProfile.romPath,
          }
        : base;
  } else if (plan.kit.platform === 'tec1g') {
    const base = createTec1gDefaults(plan.kit.appStart);
    targetConfig.tec1g =
      plan.kit.bundledProfile !== undefined
        ? {
            ...base,
            romHex: plan.kit.bundledProfile.romPath,
            ...(plan.kit.platformConfig ?? {}),
          }
        : {
            ...base,
            ...(plan.kit.platformConfig ?? {}),
          };
  } else {
    targetConfig.simple = createSimpleDefaults();
  }

  return {
    projectVersion: DEBUG80_PROJECT_VERSION,
    projectPlatform: plan.kit.platform,
    defaultProfile: plan.kit.profileName,
    ...(plan.noTarget === true ? {} : { defaultTarget: plan.targetName }),
    azm: { symbolCase: 'strict' },
    profiles: {
      [plan.kit.profileName]: profileConfig,
    },
    targets: plan.noTarget === true ? {} : { [plan.targetName]: targetConfig },
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

  if (plan?.noTarget !== true) {
    ensureDirExists(path.join(workspaceRoot, path.dirname(plan?.sourceFile ?? inferred.sourceFile)));
  }
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
      void vscode.window.showInformationMessage(
        plan.noTarget === true
          ? `Debug80: Created ${plan.kit.label} project in debug80.json. Pick a program file to add the first target.`
          : `Debug80: Created ${plan.kit.label} project in debug80.json targeting ${plan.sourceFile}.`
      );
      created = true;
    } catch (err) {
      void vscode.window.showErrorMessage(`Debug80: Failed to write debug80.json: ${String(err)}`);
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

  if (created) {
    const outputDirForGitignore = plan?.outputDir ?? inferred.outputDir;
    ensureDebug80Gitignore(workspaceRoot, outputDirForGitignore);
  }

  return created;
}

async function buildScaffoldPlan(
  folder: vscode.WorkspaceFolder,
  inferred: { sourceFile: string; outputDir: string; artifactBase: string },
  preselectedPlatform?: string
): Promise<ScaffoldPlan | undefined> {
  const kit =
    getDefaultProjectKitForPlatform(preselectedPlatform) ??
    (await chooseProjectKit(preselectedPlatform));
  if (kit === undefined) {
    return undefined;
  }

  const choice = await chooseEntrySource(folder, inferred.sourceFile);
  if (choice === undefined) {
    return undefined;
  }

  if (choice.kind === 'none') {
    return {
      kit,
      targetName: inferred.artifactBase,
      sourceFile: inferred.sourceFile,
      outputDir: inferred.outputDir,
      artifactBase: inferred.artifactBase,
      noTarget: true,
    };
  }

  if (choice.kind === 'existing') {
    const sourceFile = choice.sourceFile;
    const artifactBase =
      path.basename(sourceFile, path.extname(sourceFile)) || inferred.artifactBase;
    return {
      kit,
      targetName: artifactBase,
      sourceFile,
      outputDir: inferred.outputDir,
      artifactBase,
    };
  }

  const sourceFile = 'src/main.asm';
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
  const sourceFiles = listTargetSourceFiles(folder.uri.fsPath);
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
      ...(sourceFile === inferredSourceFile && inferredExists
        ? { description: 'suggested' }
        : isTargetEntrySourcePath(sourceFile)
          ? { description: 'main-file convention' }
          : {}),
      choice: { kind: 'existing', sourceFile } as SourceChoice,
    })),
    {
      label: 'Create ASM starter',
      description: 'Create src/main.asm with minimal starter code',
      choice: { kind: 'starter' as const, language: 'asm' as const },
    },
    {
      label: 'No target yet',
      description: 'Create the project without a target; pick a program file later',
      choice: { kind: 'none' as const },
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
