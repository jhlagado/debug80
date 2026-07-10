import { registerContractsPolicyModeForFile } from './policy.js';
import type {
  AnalyzeRegisterContractsOptions,
  RegisterContractsJsonReportModel,
  RegisterContractsPolicyMode,
} from './types.js';

export function registerContractsArtifactFallbackMode(
  options: AnalyzeRegisterContractsOptions,
): AnalyzeRegisterContractsOptions['mode'] {
  return options.mode === 'off' &&
    (options.emitInference === true ||
      options.emitInterface === true ||
      options.emitAnnotations === true ||
      options.fixRegisterContracts === true)
    ? 'audit'
    : options.mode;
}

export function effectiveFilePolicies(
  files: Iterable<string>,
  options: AnalyzeRegisterContractsOptions,
  sourcePolicy: ReadonlyMap<string, RegisterContractsPolicyMode>,
  fallbackMode: AnalyzeRegisterContractsOptions['mode'],
): ReadonlyMap<string, RegisterContractsPolicyMode> {
  return new Map(
    [...files].map((file) => [
      file,
      registerContractsPolicyModeForFile(
        file,
        options.policy ?? {},
        fallbackMode,
        sourcePolicy.get(file),
      ),
    ]),
  );
}

export function filterBaselineForAnalyzedFiles(
  baseline: RegisterContractsJsonReportModel,
  isAnalyzedFile: (file: string) => boolean,
): RegisterContractsJsonReportModel {
  return {
    ...baseline,
    findings: baseline.findings.filter((finding) => isAnalyzedFile(finding.location.file)),
    ...(baseline.suppressedFindings !== undefined
      ? {
          suppressedFindings: baseline.suppressedFindings.filter((item) =>
            isAnalyzedFile(item.finding.location.file),
          ),
        }
      : {}),
  };
}
