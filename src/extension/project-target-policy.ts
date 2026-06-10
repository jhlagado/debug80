/**
 * Pure target-selection policy for Debug80 project targets.
 */

const TARGET_KEY_PREFIX = 'debug80.selectedTarget:';

export type TargetNameChoice = {
  name: string;
};

export type TargetSelectionDecision =
  | { kind: 'use'; targetName: string; source: 'stored' | 'default' | 'sole' }
  | { kind: 'prompt' }
  | { kind: 'none' };

export type ResolveTargetSelectionDecisionOptions = {
  choices: readonly TargetNameChoice[];
  defaultTarget?: string | undefined;
  storedTarget?: string | undefined;
  forcePrompt?: boolean;
};

export function targetSelectionKeyFor(projectConfigPath: string): string {
  return `${TARGET_KEY_PREFIX}${projectConfigPath}`;
}

export function resolveTargetSelectionDecision({
  choices,
  defaultTarget,
  storedTarget,
  forcePrompt = false,
}: ResolveTargetSelectionDecisionOptions): TargetSelectionDecision {
  if (choices.length === 0) {
    return { kind: 'none' };
  }

  if (!forcePrompt) {
    if (storedTarget !== undefined && choices.some((choice) => choice.name === storedTarget)) {
      return { kind: 'use', targetName: storedTarget, source: 'stored' };
    }

    if (defaultTarget !== undefined && choices.some((choice) => choice.name === defaultTarget)) {
      return { kind: 'use', targetName: defaultTarget, source: 'default' };
    }
  }

  if (choices.length === 1) {
    const only = choices[0];
    if (only === undefined) {
      return { kind: 'none' };
    }
    return { kind: 'use', targetName: only.name, source: 'sole' };
  }

  return { kind: 'prompt' };
}
