/**
 * @file Project scaffolding helpers for Debug80 workspaces.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensureDirExists, inferDefaultTarget } from '../debug/config-utils';
import { DEBUG80_PROJECT_VERSION, listProjectSourceFiles } from './project-config';
import { TEC1_APP_START_DEFAULT } from '../platforms/tec1/constants';
import {
  TEC1G_APP_START_DEFAULT,
  TEC1G_RAM_END,
  TEC1G_RAM_START,
  TEC1G_ROM0_END,
  TEC1G_ROM0_START,
  TEC1G_ROM1_END,
  TEC1G_ROM1_START,
} from '../platforms/tec1g/constants';
import {
  BUNDLED_MON3_V1_REL,
  materializeBundledRom,
  type MaterializeBundledRomResult,
} from './bundle-materialize';

type ScaffoldPlatform = 'simple' | 'tec1' | 'tec1g';

type StarterLanguage = 'asm' | 'zax';

type ScaffoldPlan = {
  targetName: string;
  platform: ScaffoldPlatform;
  sourceFile: string;
  outputDir: string;
  artifactBase: string;
  starterFile?: {
    path: string;
    content: string;
  };
  /** Present when bundled MON3 was copied into the workspace during scaffold */
  bundledMon3?: Extract<MaterializeBundledRomResult, { ok: true }>;
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

function createTec1Defaults(): Record<string, unknown> {
  return {
    regions: [
      { start: 0, end: 2047, kind: 'rom' },
      { start: 2048, end: 4095, kind: 'ram' },
    ],
    appStart: TEC1_APP_START_DEFAULT,
    entry: 0,
  };
}

function createTec1gDefaults(): Record<string, unknown> {
  return {
    regions: [
      { start: TEC1G_ROM0_START, end: TEC1G_ROM0_END, kind: 'rom' },
      { start: TEC1G_RAM_START, end: TEC1G_RAM_END, kind: 'ram' },
      { start: TEC1G_ROM1_START, end: TEC1G_ROM1_END, kind: 'rom' },
    ],
    appStart: TEC1G_APP_START_DEFAULT,
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

export function createStarterSourceContent(language: StarterLanguage): string {
  if (language === 'zax') {
    return ['; Debug80 starter (ZAX)', '', 'start:', '    nop', '    jr start', ''].join('\n');
  }

  return ['; Debug80 starter (ASM)', '', 'start:', '    nop', '    jr start', ''].join('\n');
}

export function createDefaultProjectConfig(plan: ScaffoldPlan): {
  projectVersion: typeof DEBUG80_PROJECT_VERSION;
  projectPlatform: ScaffoldPlatform;
  defaultTarget: string;
  targets: Record<string, Record<string, unknown>>;
} {
  const targetConfig: Record<string, unknown> = {
    sourceFile: plan.sourceFile,
    outputDir: plan.outputDir,
    artifactBase: plan.artifactBase,
    platform: plan.platform,
  };

  if (plan.platform === 'tec1') {
    targetConfig.tec1 = createTec1Defaults();
  } else if (plan.platform === 'tec1g') {
    const base = createTec1gDefaults();
    if (plan.bundledMon3 !== undefined) {
      const sourceRoots = [
        'src',
        ...(plan.bundledMon3.listingRelativePath !== undefined ? ['roms/tec1g/mon3'] : []),
      ];
      targetConfig.tec1g = {
        ...base,
        romHex: plan.bundledMon3.romRelativePath,
        ...(plan.bundledMon3.listingRelativePath !== undefined
          ? { extraListings: [plan.bundledMon3.listingRelativePath] }
          : {}),
        sourceRoots,
      };
    } else {
      targetConfig.tec1g = base;
    }
  } else {
    targetConfig.simple = createSimpleDefaults();
  }

  return {
    projectVersion: DEBUG80_PROJECT_VERSION,
    projectPlatform: plan.platform,
    defaultTarget: plan.targetName,
    targets: {
      [plan.targetName]: targetConfig,
    },
  };
}

async function choosePlatform(): Promise<ScaffoldPlatform | undefined> {
  const items: Array<vscode.QuickPickItem & { platform: ScaffoldPlatform }> = [
    {
      label: 'Simple',
      description: 'Generic Debug80 memory-map platform',
      platform: 'simple',
    },
    {
      label: 'TEC-1',
      description: 'Classic TEC-1 keypad/LCD platform',
      platform: 'tec1',
    },
    {
      label: 'TEC-1G',
      description: 'TEC-1G LCD/GLCD/matrix platform',
      platform: 'tec1g',
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Choose the platform for this Debug80 project',
    matchOnDescription: true,
  });

  return picked?.platform;
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

function ensureWorkspaceSettings(vscodeDir: string): void {
  const settingsPath = path.join(vscodeDir, 'settings.json');
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        settings = parsed as Record<string, unknown>;
      }
    } catch {
      // Keep defaults if settings cannot be parsed.
    }
  }

  const associationsRaw = settings['files.associations'];
  const associations =
    associationsRaw !== null &&
    associationsRaw !== undefined &&
    typeof associationsRaw === 'object' &&
    !Array.isArray(associationsRaw)
      ? ({ ...associationsRaw } as Record<string, unknown>)
      : {};
  if (typeof associations['*.z80'] !== 'string') {
    associations['*.z80'] = 'z80-asm';
  }
  settings['files.associations'] = associations;
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

export async function scaffoldProject(
  folder: vscode.WorkspaceFolder,
  includeLaunch: boolean,
  extensionUri?: vscode.Uri,
  preselectedPlatform?: string
): Promise<boolean> {
  const workspaceRoot = folder.uri.fsPath;
  const vscodeDir = path.join(workspaceRoot, '.vscode');
  const configPath = path.join(vscodeDir, 'debug80.json');
  const launchPath = path.join(vscodeDir, 'launch.json');
  const configExists = fs.existsSync(configPath);

  const inferred = inferDefaultTarget(workspaceRoot);
  const plan = configExists ? undefined : await buildScaffoldPlan(folder, inferred, preselectedPlatform);

  if (!configExists && plan === undefined) {
    return false;
  }

  let scaffoldPlan = plan;

  if (
    scaffoldPlan !== undefined &&
    scaffoldPlan.platform === 'tec1g' &&
    extensionUri !== undefined
  ) {
    const mat = materializeBundledRom(extensionUri, workspaceRoot, BUNDLED_MON3_V1_REL);
    if (mat.ok) {
      scaffoldPlan = { ...scaffoldPlan, bundledMon3: mat };
    } else {
      void vscode.window.showWarningMessage(
        `Debug80: Could not copy bundled MON3 ROM (${mat.reason}). You can add romHex manually in debug80.json.`
      );
    }
  }

  ensureDirExists(
    path.join(workspaceRoot, path.dirname(scaffoldPlan?.sourceFile ?? inferred.sourceFile))
  );
  ensureDirExists(path.join(workspaceRoot, scaffoldPlan?.outputDir ?? inferred.outputDir));
  ensureDirExists(vscodeDir);
  if (includeLaunch) {
    ensureDirExists(vscodeDir);
  }
  ensureWorkspaceSettings(vscodeDir);

  let created = false;

  if (!configExists) {
    if (scaffoldPlan === undefined) {
      return false;
    }

    const defaultConfig = createDefaultProjectConfig(scaffoldPlan);

    try {
      if (scaffoldPlan.starterFile !== undefined) {
        const starterPath = path.join(workspaceRoot, scaffoldPlan.starterFile.path);
        ensureDirExists(path.dirname(starterPath));
        if (!fs.existsSync(starterPath)) {
          fs.writeFileSync(starterPath, scaffoldPlan.starterFile.content);
        }
      }
      fs.writeFileSync(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`);
      void vscode.window.showInformationMessage(
        `Debug80: Created ${platformDisplayName(scaffoldPlan.platform)} project in .vscode/debug80.json targeting ${scaffoldPlan.sourceFile}.`
      );
      created = true;
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Debug80: Failed to write .vscode/debug80.json: ${String(err)}`
      );
      return false;
    }
  } else if (!includeLaunch) {
    void vscode.window.showInformationMessage('.vscode/debug80.json already exists.');
  }

  if (includeLaunch) {
    if (!fs.existsSync(launchPath)) {
      const launchConfig = createDefaultLaunchConfig();
      try {
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
  const resolvedPlatform: ScaffoldPlatform | undefined =
    preselectedPlatform === 'tec1' || preselectedPlatform === 'tec1g' || preselectedPlatform === 'simple'
      ? preselectedPlatform
      : undefined;

  // When the platform comes from the webview UI, skip all interactive pickers
  // and build a plan from defaults immediately.
  if (resolvedPlatform !== undefined) {
    return buildDefaultScaffoldPlan(folder, inferred, resolvedPlatform);
  }

  const platform = await choosePlatform();
  if (platform === undefined) {
    return undefined;
  }

  const targetName =
    (
      await vscode.window.showInputBox({
        prompt: 'Debug80 target name',
        placeHolder: 'app',
        value: 'app',
        validateInput: (value) =>
          value.trim().length === 0 ? 'Target name cannot be empty.' : undefined,
      })
    )?.trim() ?? '';
  if (targetName.length === 0) {
    return undefined;
  }

  const choice = await chooseEntrySource(folder, inferred.sourceFile);
  if (choice === undefined) {
    return undefined;
  }

  if (choice.kind === 'existing') {
    const sourceFile = choice.sourceFile;
    return {
      targetName,
      platform,
      sourceFile,
      outputDir: inferred.outputDir,
      artifactBase: path.basename(sourceFile, path.extname(sourceFile)) || inferred.artifactBase,
    };
  }

  const sourceFile = choice.language === 'zax' ? 'src/main.zax' : 'src/main.asm';
  return {
    targetName,
    platform,
    sourceFile,
    outputDir: inferred.outputDir,
    artifactBase: path.basename(sourceFile, path.extname(sourceFile)) || inferred.artifactBase,
    starterFile: {
      path: sourceFile,
      content: createStarterSourceContent(choice.language),
    },
  };
}

function buildDefaultScaffoldPlan(
  folder: vscode.WorkspaceFolder,
  inferred: { sourceFile: string; outputDir: string; artifactBase: string },
  platform: ScaffoldPlatform
): ScaffoldPlan {
  const sourceFiles = listProjectSourceFiles(folder.uri.fsPath);
  const inferredExists = sourceFiles.includes(inferred.sourceFile);
  const sourceFile =
    sourceFiles.length === 1
      ? (sourceFiles[0] ?? inferred.sourceFile)
      : inferredExists
        ? inferred.sourceFile
        : sourceFiles[0] ?? inferred.sourceFile;

  const needsStarter = sourceFiles.length === 0;
  const starterFile = needsStarter
    ? { path: 'src/main.asm', content: createStarterSourceContent('asm') }
    : undefined;
  const resolvedSource = needsStarter ? 'src/main.asm' : sourceFile;

  const baseName = path.basename(resolvedSource, path.extname(resolvedSource)) || inferred.artifactBase;
  return {
    targetName: baseName,
    platform,
    sourceFile: resolvedSource,
    outputDir: inferred.outputDir,
    artifactBase: baseName,
    ...(starterFile !== undefined ? { starterFile } : {}),
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
