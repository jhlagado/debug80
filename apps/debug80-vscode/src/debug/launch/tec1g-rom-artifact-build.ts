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
  Tec1gMultibankExpansionRomArtifactConfig,
  Tec1gSourceRomArtifactConfig,
} from '@jhlagado/debug80-runtime/platforms/types';
import type { SourceAddressSpace, SourceAddressTransform } from '../../mapping/types';
import {
  createTec1gRomArtifactBuildPlans,
  type Tec1gExpansionBankBuildPlan,
  type Tec1gExpansionOutputPlan,
  type Tec1gMultibankExpansionBuildPlan,
  type Tec1gSourceRomArtifactBuildPlan,
} from './tec1g-rom-artifact-plan';

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
  const plans = createTec1gRomArtifactBuildPlans(options.args.tec1g?.romArtifacts, options.baseDir);
  const built: Tec1gBuiltRomArtifact[] = [];

  for (const plan of plans) {
    if (plan.kind === 'multibank') {
      built.push(
        await buildMultibankExpansionArtifact({
          plan,
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

    const artifact = plan.artifact;
    const backend =
      options.backendFactory?.(artifact) ?? resolveAssemblerBackend('azm', artifact.sourceFile);

    const assembleResult = await backend.assemble({
      asmPath: plan.sourceFile,
      hexPath: plan.hexPath,
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
      asmPath: plan.sourceFile,
      hexPath: plan.hexPath,
      binFrom: plan.binFrom,
      binTo: plan.binTo,
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

    if (!fs.existsSync(plan.outputBin)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} did not produce binary ${plan.outputBin}`,
      });
    }
    if (!fs.existsSync(plan.outputDebugMap)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} did not produce debug map ${plan.outputDebugMap}`,
      });
    }
    normalizeBuiltRomArtifactBinary(plan);

    built.push({
      id: artifact.id,
      role: artifact.role,
      sourceFile: plan.sourceFile,
      outputBin: plan.outputBin,
      outputDebugMap: plan.outputDebugMap,
      sourceRoot: plan.sourceRoot,
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
function normalizeBuiltRomArtifactBinary(plan: Tec1gSourceRomArtifactBuildPlan): void {
  const bytes = fs.readFileSync(plan.outputBin);
  if (bytes.length > plan.sourceLimit) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${plan.artifact.id} binary is ${bytes.length} bytes; limit is ${plan.sourceLimit}`,
    });
  }
  if (bytes.length < plan.targetSize) {
    const padded = Buffer.alloc(plan.targetSize);
    bytes.copy(padded);
    fs.writeFileSync(plan.outputBin, padded);
  }
}

async function buildMultibankExpansionArtifact(options: {
  plan: Tec1gMultibankExpansionBuildPlan;
  baseDir: string;
  args: LaunchRequestArguments;
  sendEvent: EventSender;
  backendFactory?: (
    artifact: Tec1gSourceRomArtifactConfig | Tec1gMultibankExpansionRomArtifactConfig
  ) => AssemblerBackend;
}): Promise<Tec1gBuiltRomArtifact> {
  const { plan } = options;
  const artifact = plan.artifact;
  const builtBanks = new Map<number, BuiltExpansionArtifactBank>();
  const debugMaps: string[] = [];
  const debugMapAddressSpaces: Record<string, SourceAddressSpace> = {};
  const debugMapAddressTransforms: Record<string, SourceAddressTransform> = {};
  const sourceRoots: string[] = [];

  for (const bank of plan.banks) {
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
      rebase: plan.windowAddress,
      size: plan.windowSize,
    };
    sourceRoots.push(bank.sourceRoot);
  }

  const runtimeOutputWritten = writeMultibankExpansionOutputs({
    outputs: plan.outputs,
    runtimeOutputBin: plan.outputBin,
    builtBanks,
    imageSize: plan.imageSize,
    bankSize: plan.bankSize,
  });
  if (!runtimeOutputWritten) {
    writePhysicalPackedExpansionOutput({
      outputBin: plan.outputBin,
      banks: plan.banks.map((bank) => bank.physicalBank),
      builtBanks,
      imageSize: plan.imageSize,
      bankSize: plan.bankSize,
    });
  }

  return {
    id: artifact.id,
    role: 'expansion',
    sourceFile: plan.banks[0]?.sourceFile ?? '',
    outputBin: plan.outputBin,
    sourceRoot: plan.banks[0]?.sourceRoot ?? '',
    debugMaps,
    debugMapAddressSpaces,
    debugMapAddressTransforms,
    sourceRoots,
  };
}

async function buildExpansionArtifactBank(options: {
  artifact: Tec1gMultibankExpansionRomArtifactConfig;
  bank: Tec1gExpansionBankBuildPlan;
  baseDir: string;
  args: LaunchRequestArguments;
  sendEvent: EventSender;
  backendFactory?: (
    artifact: Tec1gSourceRomArtifactConfig | Tec1gMultibankExpansionRomArtifactConfig
  ) => AssemblerBackend;
}): Promise<{ bytes: Buffer; outputDebugMap: string }> {
  const { artifact, bank } = options;
  const backend =
    options.backendFactory?.(artifact) ?? resolveAssemblerBackend('azm', bank.config.sourceFile);

  const assembleResult = await backend.assemble({
    asmPath: bank.sourceFile,
    hexPath: bank.hexPath,
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
    asmPath: bank.sourceFile,
    hexPath: bank.hexPath,
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

  if (!fs.existsSync(bank.outputBin)) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} bank ${bank.physicalBank} did not produce binary ${bank.outputBin}`,
    });
  }
  if (!fs.existsSync(bank.outputDebugMap)) {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} bank ${bank.physicalBank} did not produce debug map ${bank.outputDebugMap}`,
    });
  }

  const bytes = fs.readFileSync(bank.outputBin);
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
    fs.writeFileSync(bank.outputBin, padded);
  }

  return { bytes: padded, outputDebugMap: bank.outputDebugMap };
}

function writeMultibankExpansionOutputs(options: {
  outputs: Tec1gExpansionOutputPlan[];
  runtimeOutputBin: string;
  builtBanks: Map<number, BuiltExpansionArtifactBank>;
  imageSize: number;
  bankSize: number;
}): boolean {
  let runtimeOutputWritten = false;

  for (const output of options.outputs) {
    if (output.kind === 'packed') {
      if (output.layout === 'physical') {
        writePhysicalPackedExpansionOutput({
          outputBin: output.outputBin,
          banks: output.banks,
          builtBanks: options.builtBanks,
          imageSize: options.imageSize,
          bankSize: options.bankSize,
        });
      } else {
        writeContiguousPackedExpansionOutput({
          outputBin: output.outputBin,
          banks: output.banks,
          builtBanks: options.builtBanks,
          bankSize: options.bankSize,
        });
      }
      runtimeOutputWritten ||= pathsEqual(output.outputBin, options.runtimeOutputBin);
    } else {
      writePerBankExpansionOutput({
        output,
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
  output: Extract<Tec1gExpansionOutputPlan, { kind: 'perBank' }>;
  builtBanks: Map<number, BuiltExpansionArtifactBank>;
}): void {
  fs.mkdirSync(options.output.outputDir, { recursive: true });
  for (const physicalBank of options.output.banks) {
    const bank = requireBuiltExpansionBank(options.builtBanks, physicalBank);
    fs.writeFileSync(path.join(options.output.outputDir, `bank${physicalBank}.bin`), bank.bytes);
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

function pathsEqual(left: string, right: string): boolean {
  return path.normalize(left) === path.normalize(right);
}

export {
  applyTec1gRomArtifactsToLaunchArgs,
  hasActiveTec1gMonitorRomArtifact,
  hasActiveTec1gRomArtifacts,
} from './tec1g-rom-artifact-launch';
