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
  Tec1gExpansionRomArtifactOutputConfig,
  Tec1gExpansionRomArtifactPackedOutputConfig,
  Tec1gExpansionRomArtifactPerBankOutputConfig,
  Tec1gMultibankExpansionRomArtifactConfig,
  Tec1gRomArtifactConfig,
  Tec1gSourceRomArtifactConfig,
} from '@jhlagado/debug80-runtime/platforms/types';
import type { SourceAddressSpace, SourceAddressTransform } from '../../mapping/types';
import { TEC1G_EXPAND_BANK_COUNT } from '@jhlagado/debug80-runtime/platforms/tec-common';

export interface Tec1gBuiltRomArtifact {
  id: string;
  role: 'monitor' | 'expansion';
  sourceFile: string;
  outputBin: string;
  outputDebugMap?: string;
  sourceRoot: string;
  debugMaps?: string[];
  sourceRoots?: string[];
  debugMapAddressSpaces?: Record<string, SourceAddressSpace>;
  debugMapAddressTransforms?: Record<string, SourceAddressTransform>;
}

interface BuiltExpansionArtifactBank {
  physicalBank: number;
  bytes: Buffer;
  outputDebugMap: string;
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
          ...(options.backendFactory !== undefined
            ? { backendFactory: options.backendFactory }
            : {}),
        })
      );
      continue;
    }

    const backend =
      options.backendFactory?.(artifact) ?? resolveAssemblerBackend('azm', artifact.sourceFile);
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
        error:
          assembleResult.error ?? `${backend.id} failed to assemble ROM artifact ${artifact.id}`,
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

function romArtifactAzmOptions(
  args: LaunchRequestArguments
): NonNullable<LaunchRequestArguments['azm']> {
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
  assertMultibankExpansionArtifactOutputs(artifact, options.baseDir, bankCount);
  const builtBanks = new Map<number, BuiltExpansionArtifactBank>();
  const debugMaps: string[] = [];
  const debugMapAddressSpaces: Record<string, SourceAddressSpace> = {};
  const debugMapAddressTransforms: Record<string, SourceAddressTransform> = {};
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
    builtBanks.set(bank.physicalBank, {
      physicalBank: bank.physicalBank,
      ...builtBank,
    });
    debugMaps.push(builtBank.outputDebugMap);
    debugMapAddressSpaces[path.normalize(builtBank.outputDebugMap)] = {
      kind: 'tec1g-expansion',
      physicalBank: bank.physicalBank,
    };
    debugMapAddressTransforms[path.normalize(builtBank.outputDebugMap)] = {
      rebase: artifact.windowAddress ?? 0x8000,
      size: artifact.windowSize ?? bankSize,
    };
    sourceRoots.push(path.dirname(bank.sourceFile));
  }

  const runtimeOutputWritten = writeMultibankExpansionOutputs({
    artifact,
    baseDir: options.baseDir,
    runtimeOutputBin: outputBin,
    builtBanks,
    imageSize,
    bankSize,
  });
  if (!runtimeOutputWritten) {
    writePhysicalPackedExpansionOutput({
      outputBin,
      banks: artifact.banks.map((bank) => bank.physicalBank),
      builtBanks,
      imageSize,
      bankSize,
    });
  }

  return {
    id: artifact.id,
    role: 'expansion',
    sourceFile: artifact.banks[0]?.sourceFile ?? '',
    outputBin,
    sourceRoot: path.dirname(artifact.banks[0]?.sourceFile ?? ''),
    debugMaps,
    debugMapAddressSpaces,
    debugMapAddressTransforms,
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
      error:
        assembleResult.error ??
        `${backend.id} failed to assemble ROM artifact ${artifact.id} bank ${bank.physicalBank}`,
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
      error:
        binResult.error ??
        `${backend.id} failed to build ROM artifact ${artifact.id} bank ${bank.physicalBank}`,
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

function writeMultibankExpansionOutputs(options: {
  artifact: Tec1gMultibankExpansionRomArtifactConfig;
  baseDir: string;
  runtimeOutputBin: string;
  builtBanks: Map<number, BuiltExpansionArtifactBank>;
  imageSize: number;
  bankSize: number;
}): boolean {
  let runtimeOutputWritten = false;

  for (const output of options.artifact.outputs ?? []) {
    if (output.kind === 'packed') {
      const outputBin = resolveWorkspacePath(options.baseDir, output.outputBin);
      if (output.layout === 'physical') {
        writePhysicalPackedExpansionOutput({
          outputBin,
          banks: output.banks,
          builtBanks: options.builtBanks,
          imageSize: options.imageSize,
          bankSize: options.bankSize,
        });
      } else {
        writeContiguousPackedExpansionOutput({
          outputBin,
          banks: output.banks,
          builtBanks: options.builtBanks,
          bankSize: options.bankSize,
        });
      }
      runtimeOutputWritten ||= pathsEqual(outputBin, options.runtimeOutputBin);
    } else {
      writePerBankExpansionOutput({
        output,
        baseDir: options.baseDir,
        builtBanks: options.builtBanks,
      });
    }
  }

  return runtimeOutputWritten;
}

function writePhysicalPackedExpansionOutput(options: {
  outputBin: string;
  banks: number[];
  builtBanks: Map<number, BuiltExpansionArtifactBank>;
  imageSize: number;
  bankSize: number;
}): void {
  const packed = Buffer.alloc(options.imageSize);
  for (const physicalBank of options.banks) {
    const bank = requireBuiltExpansionBank(options.builtBanks, physicalBank);
    bank.bytes.copy(packed, physicalBank * options.bankSize);
  }
  writeBinaryFile(options.outputBin, packed);
}

function writeContiguousPackedExpansionOutput(options: {
  outputBin: string;
  banks: number[];
  builtBanks: Map<number, BuiltExpansionArtifactBank>;
  bankSize: number;
}): void {
  const packed = Buffer.alloc(options.banks.length * options.bankSize);
  options.banks.forEach((physicalBank, index) => {
    const bank = requireBuiltExpansionBank(options.builtBanks, physicalBank);
    bank.bytes.copy(packed, index * options.bankSize);
  });
  writeBinaryFile(options.outputBin, packed);
}

function writePerBankExpansionOutput(options: {
  output: Tec1gExpansionRomArtifactPerBankOutputConfig;
  baseDir: string;
  builtBanks: Map<number, BuiltExpansionArtifactBank>;
}): void {
  const outputDir = resolveWorkspacePath(options.baseDir, options.output.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  for (const physicalBank of options.output.banks) {
    const bank = requireBuiltExpansionBank(options.builtBanks, physicalBank);
    fs.writeFileSync(path.join(outputDir, `bank${physicalBank}.bin`), bank.bytes);
  }
}

function writeBinaryFile(outputBin: string, bytes: Buffer): void {
  fs.mkdirSync(path.dirname(outputBin), { recursive: true });
  fs.writeFileSync(outputBin, bytes);
}

function requireBuiltExpansionBank(
  builtBanks: Map<number, BuiltExpansionArtifactBank>,
  physicalBank: number
): BuiltExpansionArtifactBank {
  const bank = builtBanks.get(physicalBank);
  if (bank === undefined) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact output references unbuilt bank ${physicalBank}`,
    });
  }
  return bank;
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
  const generatedDebugMapAddressSpaces: Record<string, SourceAddressSpace> = {};
  const generatedDebugMapAddressTransforms: Record<string, SourceAddressTransform> = {};
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
    Object.assign(generatedDebugMapAddressSpaces, artifact.debugMapAddressSpaces ?? {});
    Object.assign(generatedDebugMapAddressTransforms, artifact.debugMapAddressTransforms ?? {});
    generatedSourceRoots.push(...artifactSourceRoots(artifact));
  }

  const existingDebugMaps = monitorArtifactGenerated
    ? (args.debugMaps ?? []).filter(shouldKeepExistingDebugMapForGeneratedMonitor)
    : (args.debugMaps ?? []);
  args.debugMaps = prependUniqueGroup(existingDebugMaps, generatedDebugMaps);
  args.debugMapAddressSpaces = {
    ...(args.debugMapAddressSpaces ?? {}),
    ...generatedDebugMapAddressSpaces,
  };
  args.debugMapAddressTransforms = {
    ...(args.debugMapAddressTransforms ?? {}),
    ...generatedDebugMapAddressTransforms,
  };
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
    (
      artifact
    ): artifact is Tec1gSourceRomArtifactConfig | Tec1gMultibankExpansionRomArtifactConfig =>
      artifact.active !== false &&
      (('sourceFile' in artifact && 'outputBin' in artifact) ||
        isMultibankExpansionArtifact(artifact))
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
    return {
      binFrom: artifact.address ?? 0xc000,
      binTo: (artifact.address ?? 0xc000) + (artifact.size ?? 0x4000) - 1,
    };
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

function assertMultibankExpansionArtifactOutputs(
  artifact: Tec1gMultibankExpansionRomArtifactConfig,
  baseDir: string,
  bankCount: number
): void {
  if (artifact.outputs === undefined) {
    return;
  }
  if (!Array.isArray(artifact.outputs)) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} outputs must be an array`,
    });
  }

  const declaredBanks = new Set(artifact.banks.map((bank) => bank.physicalBank));
  for (const output of artifact.outputs) {
    if (output.kind === 'packed') {
      assertPackedExpansionOutput(artifact.id, output, baseDir);
      const runtimeOutputBin = resolveWorkspacePath(baseDir, artifact.outputBin);
      const recipeOutputBin = resolveWorkspacePath(baseDir, output.outputBin);
      if (pathsEqual(runtimeOutputBin, recipeOutputBin) && output.layout !== 'physical') {
        throw new AssembleFailureError({
          success: false,
          error: `ROM artifact ${artifact.id} output ${output.id} writes the runtime outputBin and must use physical layout`,
        });
      }
    } else if (output.kind === 'perBank') {
      if (typeof output.outputDir !== 'string' || output.outputDir === '') {
        throw new AssembleFailureError({
          success: false,
          error: `ROM artifact ${artifact.id} output ${output.id} outputDir is required`,
        });
      }
    } else {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} output ${String((output as { kind?: unknown }).kind)} is not supported`,
      });
    }

    assertMultibankExpansionOutputBanks(artifact, output, declaredBanks, bankCount);
  }
}

function assertPackedExpansionOutput(
  artifactId: string,
  output: Tec1gExpansionRomArtifactPackedOutputConfig,
  baseDir: string
): void {
  if (
    output.layout !== undefined &&
    output.layout !== 'contiguous' &&
    output.layout !== 'physical'
  ) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifactId} output ${output.id} layout must be contiguous or physical`,
    });
  }
  if (typeof output.outputBin !== 'string' || output.outputBin === '') {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifactId} output ${output.id} outputBin is required`,
    });
  }
  assertBinOutputPath(
    `${artifactId} output ${output.id}`,
    resolveWorkspacePath(baseDir, output.outputBin)
  );
}

function assertMultibankExpansionOutputBanks(
  artifact: Tec1gMultibankExpansionRomArtifactConfig,
  output: Tec1gExpansionRomArtifactOutputConfig,
  declaredBanks: Set<number>,
  bankCount: number
): void {
  if (!Array.isArray(output.banks) || output.banks.length === 0) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} output ${output.id} must declare at least one bank`,
    });
  }

  const seen = new Set<number>();
  for (const physicalBank of output.banks) {
    if (!Number.isInteger(physicalBank) || physicalBank < 0 || physicalBank >= bankCount) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} output ${output.id} bank ${physicalBank} is outside bankCount ${bankCount}`,
      });
    }
    if (!declaredBanks.has(physicalBank)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} output ${output.id} references undeclared bank ${physicalBank}`,
      });
    }
    if (seen.has(physicalBank)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} output ${output.id} declares bank ${physicalBank} more than once`,
      });
    }
    seen.add(physicalBank);
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

function pathsEqual(left: string, right: string): boolean {
  return path.normalize(left) === path.normalize(right);
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
