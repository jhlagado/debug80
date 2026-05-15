/**
 * @file Pure project target edit helpers for the configure-project command.
 */

import type { Debug80PlatformId, ProjectConfig } from '../debug/session/types';
import {
  createSimplePlatformDefaults,
  createTec1PlatformDefaults,
  createTec1gPlatformDefaults,
} from './config-panel-html';
import { DEBUG80_PROJECT_VERSION } from './project-config';

export type ConfigureProjectTargetEdit =
  | { kind: 'targetPlatformOverride'; platform: Debug80PlatformId }
  | { kind: 'program'; sourceFile: string }
  | { kind: 'assembler'; assembler: string | undefined }
  | { kind: 'targetName'; targetName: string }
  | { kind: 'outputDir'; outputDir: string }
  | { kind: 'artifactBase'; artifactBase: string };

export type ConfigureProjectTargetEditResult =
  | { kind: 'updated'; targetName: string }
  | { kind: 'missingTarget' }
  | { kind: 'noChange' };

type ProjectTargetConfig = NonNullable<ProjectConfig['targets']>[string];

export function applyConfigureProjectTargetEdit(
  config: ProjectConfig,
  targetName: string,
  edit: ConfigureProjectTargetEdit
): ConfigureProjectTargetEditResult {
  const targets = config.targets ?? {};
  const currentTarget = targets[targetName];
  if (currentTarget === undefined) {
    return { kind: 'missingTarget' };
  }

  const updatedTarget: ProjectTargetConfig = { ...currentTarget };
  let nextTargetName = targetName;

  if (edit.kind === 'targetPlatformOverride') {
    applyPlatformOverride(config, targets, updatedTarget, edit.platform);
  } else if (edit.kind === 'program') {
    applyProgramSource(updatedTarget, edit.sourceFile);
  } else if (edit.kind === 'assembler') {
    applyAssembler(updatedTarget, edit.assembler);
  } else if (edit.kind === 'targetName') {
    if (edit.targetName === targetName) {
      return { kind: 'noChange' };
    }
    delete targets[targetName];
    nextTargetName = edit.targetName;
    if (config.defaultTarget === targetName) {
      config.defaultTarget = nextTargetName;
    }
    if (config.target === targetName) {
      config.target = nextTargetName;
    }
  } else if (edit.kind === 'outputDir') {
    updatedTarget.outputDir = edit.outputDir;
  } else if (edit.kind === 'artifactBase') {
    updatedTarget.artifactBase = edit.artifactBase;
  }

  targets[nextTargetName] = updatedTarget;
  config.targets = targets;
  return { kind: 'updated', targetName: nextTargetName };
}

function applyPlatformOverride(
  config: ProjectConfig,
  targets: NonNullable<ProjectConfig['targets']>,
  target: ProjectTargetConfig,
  platform: Debug80PlatformId
): void {
  target.platform = platform;
  delete target.simple;
  delete target.tec1;
  delete target.tec1g;
  if (platform === 'tec1') {
    target.tec1 = createTec1PlatformDefaults();
  } else if (platform === 'tec1g') {
    target.tec1g = createTec1gPlatformDefaults();
  } else {
    target.simple = createSimplePlatformDefaults();
  }
  config.projectVersion = DEBUG80_PROJECT_VERSION;
  if (Object.keys(targets).length <= 1) {
    config.projectPlatform = platform;
  }
}

function applyProgramSource(target: ProjectTargetConfig, sourceFile: string): void {
  target.sourceFile = sourceFile;
  target.asm = sourceFile;
  if (sourceFile.toLowerCase().endsWith('.zax')) {
    target.assembler = 'zax';
  } else if (target.assembler === 'zax') {
    delete target.assembler;
  }
}

function applyAssembler(target: ProjectTargetConfig, assembler: string | undefined): void {
  if (assembler === undefined) {
    delete target.assembler;
    return;
  }
  target.assembler = assembler;
}
