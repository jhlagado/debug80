import type { Tec1gRomArtifactRole } from '@jhlagado/debug80-runtime/platforms/types';
import { TEC1G_EXPAND_BANK_COUNT } from '@jhlagado/debug80-runtime/platforms/tec-common';
import {
  invalidResult,
  mergeResults,
  validResult,
  validateBoolean,
  validateOptionalInteger,
  validateOptionalObject,
  validatePath,
  validateRequiredString,
  type ValidationResult,
} from './config-value-validation';

export type Tec1gRomArtifactValidationResult = ValidationResult;

const TEC1G_MONITOR_ADDRESS = 0xc000;
const TEC1G_MONITOR_SIZE = 0x4000;
const TEC1G_EXPANSION_WINDOW_ADDRESS = 0x8000;
const TEC1G_EXPANSION_WINDOW_SIZE = 0x4000;

export function validateTec1gRomArtifacts(value: unknown): ValidationResult {
  if (value === undefined || value === null) {
    return validResult();
  }

  if (!Array.isArray(value)) {
    return invalidResult(`tec1g.romArtifacts must be an array, got ${typeof value}`);
  }

  const activeRoles = new Map<Tec1gRomArtifactRole, string>();
  const results: ValidationResult[] = [];

  value.forEach((artifact, index) => {
    const fieldName = `tec1g.romArtifacts[${index}]`;
    const objectResult = validateOptionalObject<Record<string, unknown>>(artifact, fieldName);
    if (objectResult.result !== undefined) {
      results.push(objectResult.result);
      return;
    }

    const artifactConfig = objectResult.value;
    const role = artifactConfig.role;
    const active = artifactConfig.active !== false;
    results.push(...validateTec1gRomArtifactShape(artifactConfig, fieldName));

    if (role === 'monitor') {
      results.push(...validateTec1gMonitorArtifactGeometry(artifactConfig, fieldName));
    } else if (role === 'expansion') {
      results.push(...validateTec1gExpansionArtifactGeometry(artifactConfig, fieldName));
    }

    if (active && (role === 'monitor' || role === 'expansion')) {
      const previousId = activeRoles.get(role);
      if (previousId !== undefined) {
        results.push(
          invalidResult(`${fieldName}.role duplicates active ${role} artifact ${previousId}`)
        );
      } else {
        activeRoles.set(role, getArtifactDiagnosticId(artifactConfig, index));
      }
    }
  });

  return mergeResults(results);
}

function validateTec1gRomArtifactShape(
  artifact: Record<string, unknown>,
  fieldName: string
): ValidationResult[] {
  const multibankExpansion = artifact.banks !== undefined;
  const sourceBacked =
    artifact.sourceFile !== undefined ||
    artifact.outputBin !== undefined ||
    artifact.outputDebugMap !== undefined;
  const binaryOnly = artifact.binary !== undefined || artifact.debugMap !== undefined;
  const results: ValidationResult[] = [
    validateRequiredString(artifact.id, `${fieldName}.id`),
    validateTec1gRomArtifactRole(artifact.role, `${fieldName}.role`),
    validateBoolean(artifact.active, `${fieldName}.active`),
    validateBoolean(artifact.build, `${fieldName}.build`),
  ];

  if (multibankExpansion) {
    results.push(validatePath(artifact.outputBin, `${fieldName}.outputBin`, true));
    results.push(
      ...validateTec1gExpansionArtifactBanks(
        artifact.banks,
        `${fieldName}.banks`,
        artifact.bankCount
      )
    );
    results.push(
      ...validateTec1gExpansionArtifactOutputs(
        artifact.outputs,
        `${fieldName}.outputs`,
        artifact.banks,
        artifact.outputBin
      )
    );
    if (artifact.role !== 'expansion') {
      results.push(invalidResult(`${fieldName}.banks is only supported for expansion artifacts`));
    }
    if (artifact.sourceFile !== undefined || artifact.outputDebugMap !== undefined) {
      results.push(
        invalidResult(
          `${fieldName} multibank artifacts must not specify sourceFile or outputDebugMap`
        )
      );
    }
    if (artifact.binary !== undefined || artifact.debugMap !== undefined) {
      results.push(
        invalidResult(`${fieldName} multibank artifacts must not specify binary or debugMap`)
      );
    }
  } else if (sourceBacked) {
    results.push(validatePath(artifact.sourceFile, `${fieldName}.sourceFile`, true));
    results.push(validatePath(artifact.outputBin, `${fieldName}.outputBin`, true));
    results.push(validatePath(artifact.outputDebugMap, `${fieldName}.outputDebugMap`));
    if (artifact.binary !== undefined) {
      results.push(invalidResult(`${fieldName} source-backed artifacts must not specify binary`));
    }
    if (artifact.debugMap !== undefined) {
      results.push(invalidResult(`${fieldName} source-backed artifacts must not specify debugMap`));
    }
    if (artifact.outputs !== undefined) {
      results.push(
        invalidResult(`${fieldName}.outputs is only supported for multibank expansion artifacts`)
      );
    }
  } else if (binaryOnly) {
    results.push(validatePath(artifact.binary, `${fieldName}.binary`, true));
    results.push(validatePath(artifact.debugMap, `${fieldName}.debugMap`));
    if (artifact.active !== false) {
      results.push(
        invalidResult(`${fieldName} active binary-only artifacts are deferred for Phase 2`)
      );
    }
    if (artifact.sourceFile !== undefined || artifact.outputBin !== undefined) {
      results.push(
        invalidResult(`${fieldName} binary-only artifacts must not specify sourceFile or outputBin`)
      );
    }
    if (artifact.outputs !== undefined) {
      results.push(
        invalidResult(`${fieldName}.outputs is only supported for multibank expansion artifacts`)
      );
    }
  } else {
    results.push(invalidResult(`${fieldName} must specify sourceFile/outputBin or binary`));
  }

  return results;
}

function validateTec1gExpansionArtifactOutputs(
  value: unknown,
  fieldName: string,
  bankDeclarations: unknown,
  runtimeOutputBin: unknown
): ValidationResult[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return [invalidResult(`${fieldName} must be an array`)];
  }

  const declaredBanks = declaredPhysicalBanks(bankDeclarations);
  const results: ValidationResult[] = [];
  value.forEach((output, index) => {
    const outputField = `${fieldName}[${index}]`;
    const objectResult = validateOptionalObject<Record<string, unknown>>(output, outputField);
    if (objectResult.result !== undefined) {
      results.push(objectResult.result);
      return;
    }

    const config = objectResult.value;
    results.push(validateRequiredString(config.id, `${outputField}.id`));
    if (config.kind !== 'packed' && config.kind !== 'perBank') {
      results.push(
        invalidResult(
          `${outputField}.kind must be "packed" or "perBank", got ${String(config.kind)}`
        )
      );
    }

    if (config.kind === 'packed') {
      results.push(validatePath(config.outputBin, `${outputField}.outputBin`, true));
      if (
        config.layout !== undefined &&
        config.layout !== 'contiguous' &&
        config.layout !== 'physical'
      ) {
        results.push(
          invalidResult(
            `${outputField}.layout must be "contiguous" or "physical", got ${String(config.layout)}`
          )
        );
      }
      if (
        typeof config.outputBin === 'string' &&
        typeof runtimeOutputBin === 'string' &&
        pathsEquivalent(config.outputBin, runtimeOutputBin) &&
        config.layout !== 'physical'
      ) {
        results.push(
          invalidResult(
            `${outputField} writes the runtime outputBin and must use layout "physical"`
          )
        );
      }
    } else if (config.kind === 'perBank') {
      results.push(validatePath(config.outputDir, `${outputField}.outputDir`, true));
    }

    results.push(
      ...validateTec1gExpansionArtifactOutputBanks(
        config.banks,
        `${outputField}.banks`,
        declaredBanks
      )
    );
  });

  return results;
}

function validateTec1gExpansionArtifactBanks(
  value: unknown,
  fieldName: string,
  bankCount: unknown
): ValidationResult[] {
  if (!Array.isArray(value)) {
    return [invalidResult(`${fieldName} must be an array`)];
  }

  const results: ValidationResult[] = [];
  if (value.length === 0) {
    results.push(invalidResult(`${fieldName} must contain at least one bank`));
  }
  const seen = new Set<number>();
  value.forEach((bank, index) => {
    const bankField = `${fieldName}[${index}]`;
    const objectResult = validateOptionalObject<Record<string, unknown>>(bank, bankField);
    if (objectResult.result !== undefined) {
      results.push(objectResult.result);
      return;
    }

    const config = objectResult.value;
    if (config.physicalBank === undefined || config.physicalBank === null) {
      results.push(invalidResult(`${bankField}.physicalBank is required`));
    } else {
      results.push(validateOptionalInteger(config.physicalBank, `${bankField}.physicalBank`));
    }
    if (
      typeof config.physicalBank === 'number' &&
      Number.isInteger(config.physicalBank) &&
      (config.physicalBank < 0 || config.physicalBank >= TEC1G_EXPAND_BANK_COUNT)
    ) {
      results.push(
        invalidResult(
          `${bankField}.physicalBank must be between 0 and ${TEC1G_EXPAND_BANK_COUNT - 1}`
        )
      );
    }
    if (typeof config.physicalBank === 'number' && Number.isInteger(config.physicalBank)) {
      if (
        typeof bankCount === 'number' &&
        Number.isInteger(bankCount) &&
        config.physicalBank >= 0 &&
        config.physicalBank < TEC1G_EXPAND_BANK_COUNT &&
        config.physicalBank >= bankCount
      ) {
        results.push(
          invalidResult(`${bankField}.physicalBank must be less than bankCount ${bankCount}`)
        );
      }
      if (seen.has(config.physicalBank)) {
        results.push(
          invalidResult(`${bankField}.physicalBank duplicates bank ${config.physicalBank}`)
        );
      }
      seen.add(config.physicalBank);
    }

    results.push(validatePath(config.sourceFile, `${bankField}.sourceFile`, true));
    results.push(validatePath(config.outputBin, `${bankField}.outputBin`, true));
    results.push(validatePath(config.outputDebugMap, `${bankField}.outputDebugMap`));
  });

  return results;
}

function validateTec1gExpansionArtifactOutputBanks(
  value: unknown,
  fieldName: string,
  declaredBanks: Set<number>
): ValidationResult[] {
  if (!Array.isArray(value)) {
    return [invalidResult(`${fieldName} must be an array`)];
  }

  const results: ValidationResult[] = [];
  if (value.length === 0) {
    results.push(invalidResult(`${fieldName} must contain at least one bank`));
  }

  const seen = new Set<number>();
  value.forEach((bank, index) => {
    const bankField = `${fieldName}[${index}]`;
    results.push(validateOptionalInteger(bank, bankField));
    if (typeof bank !== 'number' || !Number.isInteger(bank)) {
      return;
    }
    if (bank < 0 || bank >= TEC1G_EXPAND_BANK_COUNT) {
      results.push(
        invalidResult(`${bankField} must be between 0 and ${TEC1G_EXPAND_BANK_COUNT - 1}`)
      );
    }
    if (!declaredBanks.has(bank)) {
      results.push(invalidResult(`${bankField} references undeclared bank ${bank}`));
    }
    if (seen.has(bank)) {
      results.push(invalidResult(`${bankField} duplicates bank ${bank}`));
    }
    seen.add(bank);
  });

  return results;
}

function declaredPhysicalBanks(bankDeclarations: unknown): Set<number> {
  const declaredBanks = new Set<number>();
  if (!Array.isArray(bankDeclarations)) {
    return declaredBanks;
  }

  for (const bank of bankDeclarations) {
    const physicalBank =
      typeof bank === 'object' && bank !== null
        ? (bank as Record<string, unknown>).physicalBank
        : undefined;
    if (typeof physicalBank === 'number' && Number.isInteger(physicalBank)) {
      declaredBanks.add(physicalBank);
    }
  }

  return declaredBanks;
}

function pathsEquivalent(left: string, right: string): boolean {
  return left.split(/[\\/]+/).join('/') === right.split(/[\\/]+/).join('/');
}

function validateTec1gRomArtifactRole(value: unknown, fieldName: string): ValidationResult {
  if (value === undefined || value === null || value === '') {
    return invalidResult(`${fieldName} is required`);
  }

  if (value !== 'monitor' && value !== 'expansion') {
    return invalidResult(`${fieldName} must be "monitor" or "expansion", got ${String(value)}`);
  }

  return validResult();
}

function validateTec1gMonitorArtifactGeometry(
  artifact: Record<string, unknown>,
  fieldName: string
): ValidationResult[] {
  const results: ValidationResult[] = [
    validateOptionalInteger(artifact.address, `${fieldName}.address`),
    validateOptionalInteger(artifact.size, `${fieldName}.size`),
  ];

  if (artifact.address !== TEC1G_MONITOR_ADDRESS) {
    results.push(invalidResult(`${fieldName}.address must be 0xc000 for TEC-1G monitor artifacts`));
  }

  if (artifact.size !== TEC1G_MONITOR_SIZE) {
    results.push(invalidResult(`${fieldName}.size must be 0x4000 for TEC-1G monitor artifacts`));
  }

  return results;
}

function validateTec1gExpansionArtifactGeometry(
  artifact: Record<string, unknown>,
  fieldName: string
): ValidationResult[] {
  const results: ValidationResult[] = [
    validateOptionalInteger(artifact.windowAddress, `${fieldName}.windowAddress`),
    validateOptionalInteger(artifact.windowSize, `${fieldName}.windowSize`),
    validateOptionalInteger(artifact.imageSize, `${fieldName}.imageSize`),
    validateOptionalInteger(artifact.bankSize, `${fieldName}.bankSize`),
    validateOptionalInteger(artifact.bankCount, `${fieldName}.bankCount`),
  ];

  if (artifact.windowAddress !== TEC1G_EXPANSION_WINDOW_ADDRESS) {
    results.push(
      invalidResult(`${fieldName}.windowAddress must be 0x8000 for TEC-1G expansion artifacts`)
    );
  }

  if (artifact.windowSize !== TEC1G_EXPANSION_WINDOW_SIZE) {
    results.push(
      invalidResult(`${fieldName}.windowSize must be 0x4000 for TEC-1G expansion artifacts`)
    );
  }

  if (
    typeof artifact.imageSize !== 'number' ||
    typeof artifact.bankSize !== 'number' ||
    artifact.imageSize <= 0 ||
    artifact.bankSize <= 0 ||
    artifact.imageSize % artifact.bankSize !== 0
  ) {
    results.push(invalidResult(`${fieldName}.imageSize must be a positive multiple of bankSize`));
  }

  if (
    typeof artifact.imageSize === 'number' &&
    typeof artifact.bankSize === 'number' &&
    typeof artifact.bankCount === 'number' &&
    artifact.bankCount !== artifact.imageSize / artifact.bankSize
  ) {
    results.push(invalidResult(`${fieldName}.bankCount must equal imageSize / bankSize`));
  }

  if (
    typeof artifact.bankCount === 'number' &&
    (artifact.bankCount < 1 || artifact.bankCount > TEC1G_EXPAND_BANK_COUNT)
  ) {
    results.push(
      invalidResult(`${fieldName}.bankCount must be between 1 and ${TEC1G_EXPAND_BANK_COUNT}`)
    );
  }

  if (artifact.bankSize !== artifact.windowSize) {
    results.push(
      invalidResult(
        `${fieldName}.bankSize must equal windowSize for Phase 2 TEC-1G expansion artifacts`
      )
    );
  }

  return results;
}

function getArtifactDiagnosticId(artifact: Record<string, unknown>, index: number): string {
  return typeof artifact.id === 'string' && artifact.id !== '' ? artifact.id : `#${index}`;
}
