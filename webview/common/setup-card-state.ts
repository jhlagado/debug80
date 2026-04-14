export type SetupRootOption = {
  name: string;
  path: string;
  hasProject: boolean;
};

export type SetupPrimaryAction = 'openWorkspaceFolder' | 'createProject';

export type SetupCardState = {
  text: string;
  primaryLabel: string;
  primaryAction: SetupPrimaryAction;
};

/**
 * Returns the setup card state for the given root/target situation, or null if
 * the setup card should be hidden (project is already configured).
 */
export function resolveSetupCardState(
  selectedRoot: SetupRootOption | undefined,
  targetCount: number
): SetupCardState | null {
  if (selectedRoot === undefined) {
    return {
      text: 'No workspace folder is open. Open a folder to start with Debug80.',
      primaryLabel: 'Open Folder',
      primaryAction: 'openWorkspaceFolder',
    };
  }
  if (!selectedRoot.hasProject) {
    return {
      text: `No Debug80 project found in ${selectedRoot.name}.`,
      primaryLabel: 'Create Project',
      primaryAction: 'createProject',
    };
  }
  // Project exists (with or without targets) — hide the card.
  void targetCount;
  return null;
}
