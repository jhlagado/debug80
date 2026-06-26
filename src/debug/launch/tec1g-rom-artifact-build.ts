/**
 * @file Build explicit TEC-1G ROM artifacts declared by launch configuration.
 */

import * as path from 'path';
import * as fs from 'fs';
import { AssembleFailureError } from './assembler';
import { resolveAssemblerBackend, type AssemblerBackend } from './assembler-backend';
import { emitConsoleOutput, type EventSender } from '../session/adapter-ui';
import type { LaunchRequestArguments } from '../session/types';
import type {
  Tec1gExpansionRomArtifactBankConfig,
  Tec1gMultibankExpansionRomArtifactConfig,
  Tec1gRomArtifactConfig,
  Tec1gSourceRomArtifactConfig,
} from '../../platforms/types';
import { TEC1G_EXPAND_BANK_COUNT } from '../../platforms/tec-common';

export interface Tec1gBuiltRomArtifact {
  id: string;
  role: 'monitor' | 'expansion';
  sourceFile: string;
  outputBin: string;
  outputDebugMap?: string;
  sourceRoot: string;
  debugMaps?: string[];
  sourceRoots?: string[];
}

export async function buildTec1gRomArtifactsIfRequested(options: {
  baseDir: string;
  args: LaunchRequestArguments;
  sendEvent: EventSender;
  backendFactory?: (
    artifact: Tec1gSourceRomArtifactConfig | Tec1gMultibankExpansionRomArtifactConfig
  ) => AssemblerBackend;
}): Promise<Tec1gBuiltRomArtifact[]> {
  const artifacts = activeSourceBackedTec1gRomArtifacts(options.args.tec1g?.romArtifacts);
  const built: Tec1gBuiltRomArtifact[] = [];

  for (const artifact of artifacts) {
    if (isMultibankExpansionArtifact(artifact)) {
      built.push(
        await buildMultibankExpansionArtifact({
          artifact,
          baseDir: options.baseDir,
          args: options.args,
          sendEvent: options.sendEvent,
          ...(options.backendFactory !== undefined ? { backendFactory: options.backendFactory } : {}),
        })
      );
      continue;
    }

    const backend = options.backendFactory?.(artifact) ?? resolveAssemblerBackend('azm', artifact.sourceFile);
    const sourceFile = resolveWorkspacePath(options.baseDir, artifact.sourceFile);
    const outputBin = resolveWorkspacePath(options.baseDir, artifact.outputBin);
    assertAzmCompatibleOutputPaths(artifact, options.baseDir, outputBin);
    const hexPath = replaceExtension(outputBin, '.hex');
    const outputDebugMap =
      artifact.outputDebugMap !== undefined
        ? resolveWorkspacePath(options.baseDir, artifact.outputDebugMap)
        : replaceExtension(outputBin, '.d8.json');

    const assembleResult = await backend.assemble({
      asmPath: sourceFile,
      hexPath,
      sourceRoot: options.baseDir,
      azm: romArtifactAzmOptions(options.args),
      onOutput: (message) => {
        emitConsoleOutput(options.sendEvent, message, { newline: false });
      },
    });
    if (!assembleResult.success) {
      throw new AssembleFailureError({
        ...assembleResult,
        error: assembleResult.error ?? `${backend.id} failed to assemble ROM artifact ${artifact.id}`,
      });
    }

    if (backend.assembleBin === undefined) {
      throw new AssembleFailureError({
        success: false,
        error: `${backend.id} cannot emit binary ROM artifact ${artifact.id}`,
      });
    }

    const binResult = await backend.assembleBin({
      asmPath: sourceFile,
      hexPath,
      ...romArtifactBinaryRange(artifact),
      sourceRoot: options.baseDir,
      azm: romArtifactAzmOptions(options.args),
      onOutput: (message) => {
        emitConsoleOutput(options.sendEvent, message, { newline: false });
      },
    });
    if (!binResult.success) {
      throw new AssembleFailureError({
        ...binResult,
        error: binResult.error ?? `${backend.id} failed to build ROM artifact ${artifact.id}`,
      });
    }

    if (!fs.existsSync(outputBin)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} did not produce binary ${outputBin}`,
      });
    }
    if (!fs.existsSync(outputDebugMap)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} did not produce debug map ${outputDebugMap}`,
      });
    }
    normalizeBuiltRomArtifactBinary(artifact, outputBin);

    built.push({
      id: artifact.id,
      role: artifact.role,
      sourceFile,
      outputBin,
      outputDebugMap,
      sourceRoot: path.dirname(artifact.sourceFile),
    });
  }

  return built;
}

function romArtifactAzmOptions(args: LaunchRequestArguments): NonNullable<LaunchRequestArguments['azm']> {
  return {
    ...(args.azm ?? {}),
    registerContracts: 'off',
    emitRegisterReport: false,
  };
}

/**
 * Enforces configured ROM artifact binary geometry after assembly.
 */
function normalizeBuiltRomArtifactBinary(
  artifact: Tec1gSourceRomArtifactConfig,
  outputBin: string
): void {
  const targetSize =
    artifact.role === 'monitor'
      ? (artifact.size ?? 0x4000)
      : (artifact.imageSize ?? artifact.windowSize ?? 0x4000);
  const sourceLimit = artifact.role === 'monitor' ? targetSize : (artifact.windowSize ?? 0x4000);
  const bytes = fs.readFileSync(outputBin);
  if (bytes.length > sourceLimit) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} binary is ${bytes.length} bytes; limit is ${sourceLimit}`,
    });
  }
  if (bytes.length < targetSize) {
    const padded = Buffer.alloc(targetSize);
    bytes.copy(padded);
    fs.writeFileSync(outputBin, padded);
  }
}

async function buildMultibankExpansionArtifact(options: {
  artifact: Tec1gMultibankExpansionRomArtifactConfig;
  baseDir: string;
  args: LaunchRequestArguments;
  sendEvent: EventSender;
  backendFactory?: (
    artifact: Tec1gSourceRomArtifactConfig | Tec1gMultibankExpansionRomArtifactConfig
  ) => AssemblerBackend;
}): Promise<Tec1gBuiltRomArtifact> {
  const artifact = options.artifact;
  const outputBin = resolveWorkspacePath(options.baseDir, artifact.outputBin);
  assertBinOutputPath(artifact.id, outputBin);

  const bankSize = artifact.bankSize ?? artifact.windowSize ?? 0x4000;
  const imageSize = artifact.imageSize ?? bankSize * (artifact.bankCount ?? 1);
  const bankCount = artifact.bankCount ?? Math.floor(imageSize / bankSize);
  assertMultibankExpansionArtifactGeometry(artifact, imageSize, bankSize, bankCount);
  assertMultibankExpansionArtifactBanks(artifact, bankCount);
  const packed = Buffer.alloc(imageSize);
  const debugMaps: string[] = [];
  const sourceRoots: string[] = [];

  for (const bank of artifact.banks) {
    const builtBank = await buildExpansionArtifactBank({
      artifact,
      bank,
      baseDir: options.baseDir,
      args: options.args,
      sendEvent: options.sendEvent,
      ...(options.backendFactory !== undefined ? { backendFactory: options.backendFactory } : {}),
    });
    builtBank.bytes.copy(packed, bank.physicalBank * bankSize);
    debugMaps.push(builtBank.outputDebugMap);
    sourceRoots.push(path.dirname(bank.sourceFile));
  }

  fs.mkdirSync(path.dirname(outputBin), { recursive: true });
  fs.writeFileSync(outputBin, packed);

  return {
    id: artifact.id,
    role: 'expansion',
    sourceFile: artifact.banks[0]?.sourceFile ?? '',
    outputBin,
    sourceRoot: path.dirname(artifact.banks[0]?.sourceFile ?? ''),
    debugMaps,
    sourceRoots,
  };
}

async function buildExpansionArtifactBank(options: {
  artifact: Tec1gMultibankExpansionRomArtifactConfig;
  bank: Tec1gExpansionRomArtifactBankConfig;
  baseDir: string;
  args: LaunchRequestArguments;
  sendEvent: EventSender;
  backendFactory?: (
    artifact: Tec1gSourceRomArtifactConfig | Tec1gMultibankExpansionRomArtifactConfig
  ) => AssemblerBackend;
}): Promise<{ bytes: Buffer; outputDebugMap: string }> {
  const { artifact, bank } = options;
  const sourceFile = resolveWorkspacePath(options.baseDir, bank.sourceFile);
  const outputBin = resolveWorkspacePath(options.baseDir, bank.outputBin);
  assertAzmCompatibleBankOutputPaths(artifact.id, bank, options.baseDir, outputBin);
  const hexPath = replaceExtension(outputBin, '.hex');
  const outputDebugMap =
    bank.outputDebugMap !== undefined
      ? resolveWorkspacePath(options.baseDir, bank.outputDebugMap)
      : replaceExtension(outputBin, '.d8.json');
  const backend =
    options.backendFactory?.(artifact) ?? resolveAssemblerBackend('azm', bank.sourceFile);

  const assembleResult = await backend.assemble({
    asmPath: sourceFile,
    hexPath,
    sourceRoot: options.baseDir,
    azm: romArtifactAzmOptions(options.args),
    onOutput: (message) => {
      emitConsoleOutput(options.sendEvent, message, { newline: false });
    },
  });
  if (!assembleResult.success) {
    throw new AssembleFailureError({
      ...assembleResult,
      error: assembleResult.error ?? `${backend.id} failed to assemble ROM artifact ${artifact.id} bank ${bank.physicalBank}`,
    });
  }

  if (backend.assembleBin === undefined) {
    throw new AssembleFailureError({
      success: false,
      error: `${backend.id} cannot emit binary ROM artifact ${artifact.id} bank ${bank.physicalBank}`,
    });
  }

  const binResult = await backend.assembleBin({
    asmPath: sourceFile,
    hexPath,
    binFrom: artifact.windowAddress ?? 0x8000,
    binTo: (artifact.windowAddress ?? 0x8000) + (artifact.windowSize ?? 0x4000) - 1,
    sourceRoot: options.baseDir,
    azm: romArtifactAzmOptions(options.args),
    onOutput: (message) => {
      emitConsoleOutput(options.sendEvent, message, { newline: false });
    },
  });
  if (!binResult.success) {
    throw new AssembleFailureError({
      ...binResult,
      error: binResult.error ?? `${backend.id} failed to build ROM artifact ${artifact.id} bank ${bank.physicalBank}`,
    });
  }

  if (!fs.existsSync(outputBin)) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} bank ${bank.physicalBank} did not produce binary ${outputBin}`,
    });
  }
  if (!fs.existsSync(outputDebugMap)) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} bank ${bank.physicalBank} did not produce debug map ${outputDebugMap}`,
    });
  }

  const bytes = fs.readFileSync(outputBin);
  const bankSize = artifact.bankSize ?? artifact.windowSize ?? 0x4000;
  if (bytes.length > bankSize) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} bank ${bank.physicalBank} binary is ${bytes.length} bytes; limit is ${bankSize}`,
    });
  }
  const padded = Buffer.alloc(bankSize);
  bytes.copy(padded);
  if (bytes.length < bankSize) {
    fs.writeFileSync(outputBin, padded);
  }

  return { bytes: padded, outputDebugMap };
}

export function applyTec1gRomArtifactsToLaunchArgs(
  args: LaunchRequestArguments,
  artifacts: Tec1gBuiltRomArtifact[]
): void {
  if (artifacts.length === 0) {
    return;
  }

  args.tec1g = { ...(args.tec1g ?? {}) };
  const generatedDebugMaps: string[] = [];
  const generatedSourceRoots: string[] = [];
  let monitorArtifactGenerated = false;
  for (const artifact of artifacts) {
    if (artifact.role === 'monitor') {
      args.tec1g.romHex = artifact.outputBin;
      monitorArtifactGenerated = true;
    } else {
      args.tec1g.expansionRomHex = artifact.outputBin;
    }

    generatedDebugMaps.push(...artifactDebugMaps(artifact));
    generatedSourceRoots.push(...artifactSourceRoots(artifact));
  }

  const existingDebugMaps = monitorArtifactGenerated
    ? (args.debugMaps ?? []).filter(shouldKeepExistingDebugMapForGeneratedMonitor)
    : (args.debugMaps ?? []);
  args.debugMaps = prependUniqueGroup(existingDebugMaps, generatedDebugMaps);
  args.sourceRoots = prependUniqueGroup(args.sourceRoots ?? [], generatedSourceRoots);
}

export function hasActiveTec1gMonitorRomArtifact(args: LaunchRequestArguments): boolean {
  return activeSourceBackedTec1gRomArtifacts(args.tec1g?.romArtifacts).some(
    (artifact) => artifact.role === 'monitor'
  );
}

export function hasActiveTec1gRomArtifacts(args: LaunchRequestArguments): boolean {
  return activeSourceBackedTec1gRomArtifacts(args.tec1g?.romArtifacts).length > 0;
}

function activeSourceBackedTec1gRomArtifacts(
  artifacts: Tec1gRomArtifactConfig[] | undefined
): Array<Tec1gSourceRomArtifactConfig | Tec1gMultibankExpansionRomArtifactConfig> {
  return (artifacts ?? []).filter(
    (artifact): artifact is Tec1gSourceRomArtifactConfig | Tec1gMultibankExpansionRomArtifactConfig =>
      artifact.active !== false &&
      (('sourceFile' in artifact && 'outputBin' in artifact) || isMultibankExpansionArtifact(artifact))
  );
}

function isMultibankExpansionArtifact(
  artifact: Tec1gRomArtifactConfig
): artifact is Tec1gMultibankExpansionRomArtifactConfig {
  return artifact.role === 'expansion' && 'banks' in artifact && Array.isArray(artifact.banks);
}

function romArtifactBinaryRange(artifact: Tec1gSourceRomArtifactConfig): {
  binFrom: number;
  binTo: number;
} {
  if (artifact.role === 'monitor') {
    return { binFrom: artifact.address ?? 0xc000, binTo: (artifact.address ?? 0xc000) + (artifact.size ?? 0x4000) - 1 };
  }

  return {
    binFrom: artifact.windowAddress ?? 0x8000,
    binTo: (artifact.windowAddress ?? 0x8000) + (artifact.windowSize ?? 0x4000) - 1,
  };
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

function assertAzmCompatibleOutputPaths(
  artifact: Tec1gSourceRomArtifactConfig,
  baseDir: string,
  outputBin: string
): void {
  if (path.extname(outputBin).toLowerCase() !== '.bin') {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} outputBin must use .bin so AZM writes the configured binary`,
    });
  }

  if (artifact.outputDebugMap !== undefined) {
    const outputDebugMap = resolveWorkspacePath(baseDir, artifact.outputDebugMap);
    const expectedDebugMap = replaceExtension(outputBin, '.d8.json');
    if (path.normalize(outputDebugMap) !== path.normalize(expectedDebugMap)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} outputDebugMap must match ${expectedDebugMap}`,
      });
    }
  }
}

function assertAzmCompatibleBankOutputPaths(
  artifactId: string,
  bank: Tec1gExpansionRomArtifactBankConfig,
  baseDir: string,
  outputBin: string
): void {
  assertBinOutputPath(`${artifactId} bank ${bank.physicalBank}`, outputBin);

  if (bank.outputDebugMap !== undefined) {
    const outputDebugMap = resolveWorkspacePath(baseDir, bank.outputDebugMap);
    const expectedDebugMap = replaceExtension(outputBin, '.d8.json');
    if (path.normalize(outputDebugMap) !== path.normalize(expectedDebugMap)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifactId} bank ${bank.physicalBank} outputDebugMap must match ${expectedDebugMap}`,
      });
    }
  }
}

function assertMultibankExpansionArtifactBanks(
  artifact: Tec1gMultibankExpansionRomArtifactConfig,
  bankCount: number
): void {
  if (artifact.banks.length === 0) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} must declare at least one bank`,
    });
  }

  const seen = new Set<number>();
  for (const bank of artifact.banks) {
    if (!Number.isInteger(bank.physicalBank) || bank.physicalBank < 0) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} bank ${bank.physicalBank} is outside bankCount ${bankCount}`,
      });
    }
    if (bank.physicalBank >= TEC1G_EXPAND_BANK_COUNT) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} bank ${bank.physicalBank} is outside supported bank range 0-${TEC1G_EXPAND_BANK_COUNT - 1}`,
      });
    }
    if (bank.physicalBank >= bankCount) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} bank ${bank.physicalBank} is outside bankCount ${bankCount}`,
      });
    }
    if (seen.has(bank.physicalBank)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} declares physical bank ${bank.physicalBank} more than once`,
      });
    }
    seen.add(bank.physicalBank);
  }
}

function assertMultibankExpansionArtifactGeometry(
  artifact: Tec1gMultibankExpansionRomArtifactConfig,
  imageSize: number,
  bankSize: number,
  bankCount: number
): void {
  if (!Number.isInteger(bankSize) || bankSize <= 0) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} bankSize must be a positive integer`,
    });
  }
  if (!Number.isInteger(imageSize) || imageSize <= 0 || imageSize % bankSize !== 0) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} imageSize must be a positive multiple of bankSize`,
    });
  }
  if (!Number.isInteger(bankCount) || bankCount !== imageSize / bankSize) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} bankCount must equal imageSize / bankSize`,
    });
  }
}

function assertBinOutputPath(artifactId: string, outputBin: string): void {
  if (path.extname(outputBin).toLowerCase() !== '.bin') {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifactId} outputBin must use .bin so AZM writes the configured binary`,
    });
  }
}

function artifactDebugMaps(artifact: Tec1gBuiltRomArtifact): string[] {
  if (artifact.debugMaps !== undefined) {
    return artifact.debugMaps;
  }
  return artifact.outputDebugMap !== undefined ? [artifact.outputDebugMap] : [];
}

function artifactSourceRoots(artifact: Tec1gBuiltRomArtifact): string[] {
  return artifact.sourceRoots ?? [artifact.sourceRoot];
}

function prependUniqueGroup(values: string[], group: string[]): string[] {
  if (group.length === 0) {
    return values;
  }
  const uniqueGroup = group.filter((entry, index) => group.indexOf(entry) === index);
  return [...uniqueGroup, ...values.filter((existing) => !uniqueGroup.includes(existing))];
}

function shouldKeepExistingDebugMapForGeneratedMonitor(mapPath: string): boolean {
  const normalized = mapPath.split(/[\\/]+/).join('/');
  if (normalized.includes('resources/bundles/tec1g/mon3/v1/') && normalized.endsWith('.d8.json')) {
    return false;
  }
  if (normalized.includes('roms/tec1g/mon3/') && normalized.endsWith('.d8.json')) {
    return false;
  }
  return true;
}
