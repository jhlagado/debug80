import * as path from 'path';
import { AssembleFailureError } from './assembler';
import type {
  Tec1gExpansionRomArtifactBankConfig,
  Tec1gExpansionRomArtifactOutputConfig,
  Tec1gExpansionRomArtifactPackedOutputConfig,
  Tec1gMultibankExpansionRomArtifactConfig,
  Tec1gRomArtifactConfig,
  Tec1gSourceRomArtifactConfig,
} from '@jhlagado/debug80-runtime/platforms/types';
import { TEC1G_EXPAND_BANK_COUNT } from '@jhlagado/debug80-runtime/platforms/tec-common';

export type Tec1gActiveRomArtifactConfig =
  Tec1gSourceRomArtifactConfig | Tec1gMultibankExpansionRomArtifactConfig;

export interface Tec1gSourceRomArtifactBuildPlan {
  kind: 'source';
  artifact: Tec1gSourceRomArtifactConfig;
  sourceFile: string;
  outputBin: string;
  outputDebugMap: string;
  hexPath: string;
  sourceRoot: string;
  binFrom: number;
  binTo: number;
  targetSize: number;
  sourceLimit: number;
}

export interface Tec1gExpansionBankBuildPlan {
  config: Tec1gExpansionRomArtifactBankConfig;
  physicalBank: number;
  sourceFile: string;
  outputBin: string;
  outputDebugMap: string;
  hexPath: string;
  sourceRoot: string;
}

export interface Tec1gPackedExpansionOutputPlan {
  kind: 'packed';
  id: string;
  outputBin: string;
  banks: number[];
  layout: 'contiguous' | 'physical';
}

export interface Tec1gPerBankExpansionOutputPlan {
  kind: 'perBank';
  id: string;
  outputDir: string;
  banks: number[];
}

export type Tec1gExpansionOutputPlan =
  Tec1gPackedExpansionOutputPlan | Tec1gPerBankExpansionOutputPlan;

export interface Tec1gMultibankExpansionBuildPlan {
  kind: 'multibank';
  artifact: Tec1gMultibankExpansionRomArtifactConfig;
  outputBin: string;
  imageSize: number;
  bankSize: number;
  bankCount: number;
  windowAddress: number;
  windowSize: number;
  banks: Tec1gExpansionBankBuildPlan[];
  outputs: Tec1gExpansionOutputPlan[];
}

export type Tec1gRomArtifactBuildPlan =
  Tec1gSourceRomArtifactBuildPlan | Tec1gMultibankExpansionBuildPlan;

export function createTec1gRomArtifactBuildPlans(
  artifacts: Tec1gRomArtifactConfig[] | undefined,
  baseDir: string
): Tec1gRomArtifactBuildPlan[] {
  return activeSourceBackedTec1gRomArtifacts(artifacts).map((artifact) =>
    isMultibankExpansionArtifact(artifact)
      ? createMultibankPlan(artifact, baseDir)
      : createSourcePlan(artifact, baseDir)
  );
}

export function activeSourceBackedTec1gRomArtifacts(
  artifacts: Tec1gRomArtifactConfig[] | undefined
): Tec1gActiveRomArtifactConfig[] {
  return (artifacts ?? []).filter(
    (artifact): artifact is Tec1gActiveRomArtifactConfig =>
      artifact.active !== false &&
      (('sourceFile' in artifact && 'outputBin' in artifact) ||
        isMultibankExpansionArtifact(artifact))
  );
}

export function isMultibankExpansionArtifact(
  artifact: Tec1gRomArtifactConfig
): artifact is Tec1gMultibankExpansionRomArtifactConfig {
  return artifact.role === 'expansion' && 'banks' in artifact && Array.isArray(artifact.banks);
}

function createSourcePlan(
  artifact: Tec1gSourceRomArtifactConfig,
  baseDir: string
): Tec1gSourceRomArtifactBuildPlan {
  const sourceFile = resolveWorkspacePath(baseDir, artifact.sourceFile);
  const outputBin = resolveWorkspacePath(baseDir, artifact.outputBin);
  assertBinOutputPath(artifact.id, outputBin);
  const outputDebugMap = resolveDebugMapPath(
    artifact.id,
    artifact.outputDebugMap,
    outputBin,
    baseDir
  );
  const targetSize =
    artifact.role === 'monitor'
      ? (artifact.size ?? 0x4000)
      : (artifact.imageSize ?? artifact.windowSize ?? 0x4000);
  const sourceLimit = artifact.role === 'monitor' ? targetSize : (artifact.windowSize ?? 0x4000);
  const binFrom =
    artifact.role === 'monitor' ? (artifact.address ?? 0xc000) : (artifact.windowAddress ?? 0x8000);
  const binSize =
    artifact.role === 'monitor' ? (artifact.size ?? 0x4000) : (artifact.windowSize ?? 0x4000);

  return {
    kind: 'source',
    artifact,
    sourceFile,
    outputBin,
    outputDebugMap,
    hexPath: replaceExtension(outputBin, '.hex'),
    sourceRoot: path.dirname(artifact.sourceFile),
    binFrom,
    binTo: binFrom + binSize - 1,
    targetSize,
    sourceLimit,
  };
}

function createMultibankPlan(
  artifact: Tec1gMultibankExpansionRomArtifactConfig,
  baseDir: string
): Tec1gMultibankExpansionBuildPlan {
  const outputBin = resolveWorkspacePath(baseDir, artifact.outputBin);
  assertBinOutputPath(artifact.id, outputBin);
  const bankSize = artifact.bankSize ?? artifact.windowSize ?? 0x4000;
  const imageSize = artifact.imageSize ?? bankSize * (artifact.bankCount ?? 1);
  const bankCount = artifact.bankCount ?? Math.floor(imageSize / bankSize);
  const windowAddress = artifact.windowAddress ?? 0x8000;
  const windowSize = artifact.windowSize ?? bankSize;

  assertMultibankGeometry(artifact, imageSize, bankSize, bankCount);
  assertMultibankBanks(artifact, bankCount);

  return {
    kind: 'multibank',
    artifact,
    outputBin,
    imageSize,
    bankSize,
    bankCount,
    windowAddress,
    windowSize,
    banks: artifact.banks.map((bank) => createBankPlan(artifact.id, bank, baseDir)),
    outputs: createOutputPlans(artifact, baseDir, bankCount, outputBin),
  };
}

function createBankPlan(
  artifactId: string,
  bank: Tec1gExpansionRomArtifactBankConfig,
  baseDir: string
): Tec1gExpansionBankBuildPlan {
  const outputBin = resolveWorkspacePath(baseDir, bank.outputBin);
  assertBinOutputPath(`${artifactId} bank ${bank.physicalBank}`, outputBin);
  return {
    config: bank,
    physicalBank: bank.physicalBank,
    sourceFile: resolveWorkspacePath(baseDir, bank.sourceFile),
    outputBin,
    outputDebugMap: resolveDebugMapPath(
      `${artifactId} bank ${bank.physicalBank}`,
      bank.outputDebugMap,
      outputBin,
      baseDir
    ),
    hexPath: replaceExtension(outputBin, '.hex'),
    sourceRoot: path.dirname(bank.sourceFile),
  };
}

function createOutputPlans(
  artifact: Tec1gMultibankExpansionRomArtifactConfig,
  baseDir: string,
  bankCount: number,
  runtimeOutputBin: string
): Tec1gExpansionOutputPlan[] {
  if (artifact.outputs === undefined) {return [];}
  if (!Array.isArray(artifact.outputs)) {
    fail(`ROM artifact ${artifact.id} outputs must be an array`);
  }

  const declaredBanks = new Set(artifact.banks.map((bank) => bank.physicalBank));
  return artifact.outputs.map((output) => {
    assertOutputBanks(artifact, output, declaredBanks, bankCount);
    if (output.kind === 'packed') {
      return createPackedOutputPlan(artifact.id, output, baseDir, runtimeOutputBin);
    }
    if (output.kind === 'perBank') {
      if (typeof output.outputDir !== 'string' || output.outputDir === '') {
        fail(`ROM artifact ${artifact.id} output ${output.id} outputDir is required`);
      }
      return {
        kind: 'perBank',
        id: output.id,
        outputDir: resolveWorkspacePath(baseDir, output.outputDir),
        banks: [...output.banks],
      };
    }
    fail(
      `ROM artifact ${artifact.id} output ${String((output as { kind?: unknown }).kind)} is not supported`
    );
  });
}

function createPackedOutputPlan(
  artifactId: string,
  output: Tec1gExpansionRomArtifactPackedOutputConfig,
  baseDir: string,
  runtimeOutputBin: string
): Tec1gPackedExpansionOutputPlan {
  if (
    output.layout !== undefined &&
    output.layout !== 'contiguous' &&
    output.layout !== 'physical'
  ) {
    fail(`ROM artifact ${artifactId} output ${output.id} layout must be contiguous or physical`);
  }
  if (typeof output.outputBin !== 'string' || output.outputBin === '') {
    fail(`ROM artifact ${artifactId} output ${output.id} outputBin is required`);
  }
  const outputBin = resolveWorkspacePath(baseDir, output.outputBin);
  assertBinOutputPath(`${artifactId} output ${output.id}`, outputBin);
  const layout = output.layout ?? 'contiguous';
  if (pathsEqual(runtimeOutputBin, outputBin) && layout !== 'physical') {
    fail(
      `ROM artifact ${artifactId} output ${output.id} writes the runtime outputBin and must use physical layout`
    );
  }
  return { kind: 'packed', id: output.id, outputBin, banks: [...output.banks], layout };
}

function assertMultibankBanks(
  artifact: Tec1gMultibankExpansionRomArtifactConfig,
  bankCount: number
): void {
  if (artifact.banks.length === 0) {
    fail(`ROM artifact ${artifact.id} must declare at least one bank`);
  }
  const seen = new Set<number>();
  for (const bank of artifact.banks) {
    if (!Number.isInteger(bank.physicalBank) || bank.physicalBank < 0) {
      fail(
        `ROM artifact ${artifact.id} bank ${bank.physicalBank} is outside bankCount ${bankCount}`
      );
    }
    if (bank.physicalBank >= TEC1G_EXPAND_BANK_COUNT) {
      fail(
        `ROM artifact ${artifact.id} bank ${bank.physicalBank} is outside supported bank range 0-${TEC1G_EXPAND_BANK_COUNT - 1}`
      );
    }
    if (bank.physicalBank >= bankCount) {
      fail(
        `ROM artifact ${artifact.id} bank ${bank.physicalBank} is outside bankCount ${bankCount}`
      );
    }
    if (seen.has(bank.physicalBank)) {
      fail(
        `ROM artifact ${artifact.id} declares physical bank ${bank.physicalBank} more than once`
      );
    }
    seen.add(bank.physicalBank);
  }
}

function assertOutputBanks(
  artifact: Tec1gMultibankExpansionRomArtifactConfig,
  output: Tec1gExpansionRomArtifactOutputConfig,
  declaredBanks: Set<number>,
  bankCount: number
): void {
  if (!Array.isArray(output.banks) || output.banks.length === 0) {
    fail(`ROM artifact ${artifact.id} output ${output.id} must declare at least one bank`);
  }
  const seen = new Set<number>();
  for (const physicalBank of output.banks) {
    if (!Number.isInteger(physicalBank) || physicalBank < 0 || physicalBank >= bankCount) {
      fail(
        `ROM artifact ${artifact.id} output ${output.id} bank ${physicalBank} is outside bankCount ${bankCount}`
      );
    }
    if (!declaredBanks.has(physicalBank)) {
      fail(
        `ROM artifact ${artifact.id} output ${output.id} references undeclared bank ${physicalBank}`
      );
    }
    if (seen.has(physicalBank)) {
      fail(
        `ROM artifact ${artifact.id} output ${output.id} declares bank ${physicalBank} more than once`
      );
    }
    seen.add(physicalBank);
  }
}

function assertMultibankGeometry(
  artifact: Tec1gMultibankExpansionRomArtifactConfig,
  imageSize: number,
  bankSize: number,
  bankCount: number
): void {
  if (!Number.isInteger(bankSize) || bankSize <= 0) {
    fail(`ROM artifact ${artifact.id} bankSize must be a positive integer`);
  }
  if (!Number.isInteger(imageSize) || imageSize <= 0 || imageSize % bankSize !== 0) {
    fail(`ROM artifact ${artifact.id} imageSize must be a positive multiple of bankSize`);
  }
  if (!Number.isInteger(bankCount) || bankCount !== imageSize / bankSize) {
    fail(`ROM artifact ${artifact.id} bankCount must equal imageSize / bankSize`);
  }
}

function resolveDebugMapPath(
  artifactId: string,
  configuredPath: string | undefined,
  outputBin: string,
  baseDir: string
): string {
  const expectedDebugMap = replaceExtension(outputBin, '.d8.json');
  if (configuredPath === undefined) {return expectedDebugMap;}
  const outputDebugMap = resolveWorkspacePath(baseDir, configuredPath);
  if (!pathsEqual(outputDebugMap, expectedDebugMap)) {
    fail(`ROM artifact ${artifactId} outputDebugMap must match ${expectedDebugMap}`);
  }
  return outputDebugMap;
}

function assertBinOutputPath(artifactId: string, outputBin: string): void {
  if (path.extname(outputBin).toLowerCase() !== '.bin') {
    fail(`ROM artifact ${artifactId} outputBin must use .bin so AZM writes the configured binary`);
  }
}

function resolveWorkspacePath(baseDir: string, filePath: string): string {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(baseDir, filePath);
}

function replaceExtension(filePath: string, extension: string): string {
  return path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}${extension}`
  );
}

function pathsEqual(left: string, right: string): boolean {
  return path.normalize(left) === path.normalize(right);
}

function fail(error: string): never {
  throw new AssembleFailureError({ success: false, error });
}
